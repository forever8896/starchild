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

  // The founder holds zero by design — official proposals bypass the hold gate
  // (and the founder still has zero vote weight, so they can ask, never decide).
  if (isFounder(proposer)) return { ok: true, proposer }

  const weight = await weightOf(proposer)
  if (weight < PROPOSE_MIN) return { ok: false, error: 'must hold at least 10,000,000 $STARCHILD to propose' }
  return { ok: true, proposer }
}

// ── Votes ────────────────────────────────────────────────────────────────────

export async function verifyVote(input: {
  proposalId: string; support: boolean; voter: string; signature: `0x${string}`
}): Promise<{ ok: true; voter: Address } | { ok: false; error: string }> {
  let voter: Address
  try { voter = getAddress(input.voter) } catch { return { ok: false, error: 'bad address' } }
  const valid = await verifyTypedData({
    address: voter, domain: EIP712_DOMAIN, types: VOTE_TYPES, primaryType: 'Vote',
    message: { proposalId: input.proposalId, support: input.support }, signature: input.signature,
  }).catch(() => false)
  if (!valid) return { ok: false, error: 'invalid signature' }
  const weight = await weightOf(voter)
  if (weight <= 0n) return { ok: false, error: 'hold $STARCHILD to vote' }
  return { ok: true, voter }
}

export async function recordVote(proposalId: string, voter: Address, support: boolean): Promise<void> {
  await redis().hset(votesKey(proposalId), { [voter.toLowerCase()]: support ? '1' : '0' })
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
      if (s === '1') { support += w; voters++ } else { against += w; againstVoters++ }
    }
    out[id] = { support, against, voters, againstVoters }
  })
  return out
}
