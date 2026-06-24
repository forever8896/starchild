/**
 * Gasless, stake-weighted governance for the Starchild commons.
 *
 * Proposals and votes are EIP-712 signatures (free — no gas, no burning).
 * Weight comes from on-chain stake in StarchildStaking: the backend verifies
 * each signature, reads the signer's live stake, and tallies. Nothing here
 * touches the companion app.
 *
 * Storage: Upstash Redis (REST). Set UPSTASH_REDIS_REST_URL + _TOKEN.
 */
import { verifyTypedData, getAddress, type Address } from 'viem'
import { Redis } from '@upstash/redis'
import {
  publicClient, STARCHILD_TOKEN, erc20Abi,
  PROPOSE_MIN, EIP712_DOMAIN, PROPOSAL_TYPES, VOTE_TYPES, isFounder,
} from './burnGoals'

export { PROPOSE_MIN, EIP712_DOMAIN, PROPOSAL_TYPES, VOTE_TYPES }

export type Proposal = {
  id: string
  title: string
  detail: string
  proposer: Address
  nonce: string
  threshold: string // absolute $STARCHILD (base units) of "for" weight needed to pass; "0" = idea board
  signature: `0x${string}`
  createdAt: number
}

// Lazy so a missing env var doesn't crash the build — only resolved at request time.
let _redis: Redis | null = null
function redis(): Redis {
  if (!_redis) _redis = Redis.fromEnv()
  return _redis
}
const PROPOSAL_KEY = 'gov:proposals' // list of proposal JSON
const votesKey = (id: string) => `gov:votes:${id}` // hash voter(lc) -> support('1'|'0')
const nonceKey = (id: string) => `gov:vnonce:${id}` // hash voter(lc) -> last vote nonce used (replay guard)
const PNONCE_KEY = 'gov:pnonce' // set of used "proposer(lc):nonce" (proposal replay guard)

/** Governance weight = how much $STARCHILD the address holds, live. */
export async function weightOf(addr: Address): Promise<bigint> {
  return publicClient.readContract({ address: STARCHILD_TOKEN, abi: erc20Abi, functionName: 'balanceOf', args: [addr] }) as Promise<bigint>
}

// ── Proposals ────────────────────────────────────────────────────────────────

export async function listProposals(): Promise<Proposal[]> {
  const raw = await redis().lrange<Proposal>(PROPOSAL_KEY, 0, -1)
  // Upstash returns parsed objects for JSON; normalize if strings
  return raw.map((p) => (typeof p === 'string' ? (JSON.parse(p) as Proposal) : p))
}

export async function addProposal(p: Proposal): Promise<void> {
  await redis().rpush(PROPOSAL_KEY, JSON.stringify(p))
}

/** Verify a proposal signature and that the proposer meets the stake minimum. */
export async function verifyProposal(input: {
  title: string; detail: string; nonce: string; threshold: string; proposer: string; signature: `0x${string}`
}): Promise<{ ok: true; proposer: Address } | { ok: false; error: string }> {
  let proposer: Address
  try { proposer = getAddress(input.proposer) } catch { return { ok: false, error: 'bad address' } }
  if (!input.title?.trim() || input.title.length > 100) return { ok: false, error: 'title 1–100 chars' }
  if (input.detail && input.detail.length > 500) return { ok: false, error: 'detail ≤ 500 chars' }
  let threshold: bigint
  try { threshold = BigInt(input.threshold ?? '0'); if (threshold < 0n) threshold = 0n } catch { return { ok: false, error: 'bad threshold' } }

  const valid = await verifyTypedData({
    address: proposer, domain: EIP712_DOMAIN, types: PROPOSAL_TYPES, primaryType: 'Proposal',
    message: { title: input.title, detail: input.detail ?? '', nonce: input.nonce, threshold }, signature: input.signature,
  }).catch(() => false)
  if (!valid) return { ok: false, error: 'invalid signature' }

  // Replay guard: a proposal signature can only be used once.
  if (await proposalNonceUsed(proposer, input.nonce)) return { ok: false, error: 'proposal signature already used' }

  // The founder holds zero by design — official proposals bypass the hold gate
  // (and the founder still has zero vote weight, so they can ask, never decide).
  if (isFounder(proposer)) return { ok: true, proposer }

  const weight = await weightOf(proposer)
  if (weight < PROPOSE_MIN) return { ok: false, error: 'must hold at least 10,000,000 $STARCHILD to propose' }
  return { ok: true, proposer }
}

// ── Votes ────────────────────────────────────────────────────────────────────

export async function verifyVote(input: {
  proposalId: string; support: boolean; voter: string; nonce: string; deadline: string; signature: `0x${string}`
}): Promise<{ ok: true; voter: Address; nonce: bigint } | { ok: false; error: string }> {
  let voter: Address
  try { voter = getAddress(input.voter) } catch { return { ok: false, error: 'bad address' } }
  let nonce: bigint, deadline: bigint
  try { nonce = BigInt(input.nonce); deadline = BigInt(input.deadline) } catch { return { ok: false, error: 'bad nonce/deadline' } }
  if (nonce <= 0n) return { ok: false, error: 'bad nonce' }
  // Short-lived signature: a captured one expires.
  if (deadline < BigInt(Math.floor(Date.now() / 1000))) return { ok: false, error: 'vote signature expired — sign again' }

  const valid = await verifyTypedData({
    address: voter, domain: EIP712_DOMAIN, types: VOTE_TYPES, primaryType: 'Vote',
    message: { proposalId: input.proposalId, support: input.support, voter, nonce, deadline }, signature: input.signature,
  }).catch(() => false)
  if (!valid) return { ok: false, error: 'invalid signature' }

  // Replay guard: each new vote must carry a strictly larger nonce than the last
  // one recorded for this (proposal, voter). An old captured signature has a
  // smaller nonce and is rejected — so it can't flip a changed vote back.
  const last = await getVoteNonce(input.proposalId, voter)
  if (last !== null && nonce <= last) return { ok: false, error: 'stale vote signature (replay rejected)' }

  const weight = await weightOf(voter)
  if (weight <= 0n) return { ok: false, error: 'hold $STARCHILD to vote' }
  return { ok: true, voter, nonce }
}

export async function recordVote(proposalId: string, voter: Address, support: boolean, nonce: bigint): Promise<void> {
  await redis().hset(votesKey(proposalId), { [voter.toLowerCase()]: support ? '1' : '0' })
  await redis().hset(nonceKey(proposalId), { [voter.toLowerCase()]: nonce.toString() })
}

/** Last vote nonce recorded for a (proposal, voter), or null if they haven't voted. */
export async function getVoteNonce(proposalId: string, voter: Address): Promise<bigint | null> {
  const v = await redis().hget(nonceKey(proposalId), voter.toLowerCase())
  if (v == null) return null
  try { return BigInt(String(v)) } catch { return null }
}

/** Proposal replay guard — has this (proposer, nonce) signature been used already? */
export async function proposalNonceUsed(proposer: Address, nonce: string): Promise<boolean> {
  return (await redis().sismember(PNONCE_KEY, `${proposer.toLowerCase()}:${nonce}`)) === 1
}
export async function markProposalNonce(proposer: Address, nonce: string): Promise<void> {
  await redis().sadd(PNONCE_KEY, `${proposer.toLowerCase()}:${nonce}`)
}

/** The voter's current recorded stance on a proposal: '1' (for), '0' (against), or null (hasn't voted). */
export async function getVote(proposalId: string, voter: Address): Promise<'1' | '0' | null> {
  const v = await redis().hget(votesKey(proposalId), voter.toLowerCase())
  const s = v == null ? null : String(v) // Upstash may deserialize '1'/'0' as numbers
  return s === '1' ? '1' : s === '0' ? '0' : null
}

/**
 * Live, stake-weighted tally per proposal. Weight = the voter's CURRENT staked
 * balance (read live via multicall), so unstaking removes your weight — votes
 * can't be cast then withdrawn for free.
 */
export async function tally(proposalIds: string[]): Promise<Record<string, { support: bigint; against: bigint; voters: number; againstVoters: number }>> {
  const out: Record<string, { support: bigint; against: bigint; voters: number; againstVoters: number }> = {}
  const voterSets = await Promise.all(proposalIds.map((id) => redis().hgetall<Record<string, string>>(votesKey(id))))
  const allVoters = new Set<string>()
  voterSets.forEach((vs) => vs && Object.keys(vs).forEach((v) => allVoters.add(v)))
  const voterList = [...allVoters]
  const weights = new Map<string, bigint>()
  if (voterList.length) {
    const res = await publicClient.multicall({
      contracts: voterList.map((v) => ({ address: STARCHILD_TOKEN, abi: erc20Abi, functionName: 'balanceOf', args: [getAddress(v)] })),
    })
    voterList.forEach((v, i) => weights.set(v, res[i].status === 'success' ? (res[i].result as bigint) : 0n))
  }
  proposalIds.forEach((id, i) => {
    const vs = voterSets[i] || {}
    let support = 0n, against = 0n, voters = 0, againstVoters = 0
    for (const [v, s] of Object.entries(vs)) {
      const w = weights.get(v) ?? 0n
      // Upstash may hand back '1'/'0' as numbers — normalize before comparing.
      if (String(s) === '1') { support += w; voters++ } else { against += w; againstVoters++ }
    }
    out[id] = { support, against, voters, againstVoters }
  })
  return out
}
