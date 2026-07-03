/**
 * On-chain config + helpers for the token site (the "commons" layer).
 *
 * This lives only on the website and only touches a wallet here. The Starchild
 * companion app never imports any of this.
 */
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  fallback,
  formatUnits,
  parseUnits,
  type Address,
  type EIP1193Provider,
} from 'viem'
import { base } from 'viem/chains'

/** $STARCHILD on Base. */
export const STARCHILD_TOKEN = '0x980e9f2061487376ab1438e965ad276a1d36fba3' as const

// Governance weight = how much $STARCHILD you simply HOLD (read live via the
// token's balanceOf). No staking, no locking, no contract — just hold + sign.
// (The old StarchildStaking contract is retired; nothing references it now.)

// ── Governance: EIP-712 signing constants (client-safe — no server imports) ──
export const PROPOSE_MIN = parseUnits('10000000', 18) // hold 10,000,000 $STARCHILD to propose
// A fixed `salt` binds these signatures to THIS app + API. Without it, another
// service that copied the same typed-data shape could reuse a signature; with it,
// the domain separator is unique to Starchild governance.
// salt = keccak256("starchild-dao:governance:v2:token.starchild.software")
export const GOV_SALT = '0xc9255544d668fd6ddb88c3888cf6abcd94afa1daa5acbff52e3b2903780f059f' as const
export const EIP712_DOMAIN = { name: 'Starchild Governance', version: '2', chainId: 8453, salt: GOV_SALT } as const
export const PROPOSAL_TYPES = {
  Proposal: [{ name: 'title', type: 'string' }, { name: 'detail', type: 'string' }, { name: 'nonce', type: 'string' }, { name: 'threshold', type: 'uint256' }],
} as const
// Vote carries `voter`, `nonce` and `deadline` so an old captured signature can't
// be replayed to flip a wallet back to a previous stance (votes are last-write-wins).
// The nonce is a millisecond timestamp; the backend requires each new vote to use a
// strictly larger nonce than the last one it recorded for that (proposal, voter).
export const VOTE_TYPES = {
  Vote: [
    { name: 'proposalId', type: 'string' },
    { name: 'support', type: 'bool' },
    { name: 'voter', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

// The official-proposer address below holds zero $STARCHILD — so "official"
// proposals from it bypass the stake-to-propose gate while carrying NO vote
// weight (it can pose a question, never sway it). The founder's personal
// holdings live at a SEPARATE, public wallet (FOUNDER_HOLDINGS / kiliansolutions.eth)
// and vote as a normal holder, like anyone else.
export const FOUNDER_ADDRESS = (process.env.NEXT_PUBLIC_FOUNDER_ADDRESS ?? '0x1f44d8655727bb26532c657bec8882154a01e170').toLowerCase()
export const isFounder = (addr?: string | null): boolean => !!addr && addr.toLowerCase() === FOUNDER_ADDRESS

// ── Governance weight = live $STARCHILD balance (just hold + sign) ──
export async function fetchBalance(addr: Address): Promise<bigint> {
  return publicClient.readContract({ address: STARCHILD_TOKEN, abi: erc20Abi, functionName: 'balanceOf', args: [addr] }) as Promise<bigint>
}

// ── Governance signing + API (client) ──
export type ProposalView = {
  id: string; title: string; detail: string; proposer: string; createdAt: number
  support: string; against: string; voters: number; againstVoters: number
  threshold: string; official: boolean; passed: boolean
}

export async function fetchProposals(): Promise<ProposalView[]> {
  const r = await fetch('/api/proposals', { cache: 'no-store' })
  const d = await r.json()
  return d.proposals ?? []
}

export async function signAndPropose(title: string, detail: string, threshold = 0n): Promise<void> {
  const wallet = getWalletClient()
  const [account] = await wallet.requestAddresses()
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const signature = await wallet.signTypedData({ account, domain: EIP712_DOMAIN, types: PROPOSAL_TYPES, primaryType: 'Proposal', message: { title, detail, nonce, threshold } })
  const r = await fetch('/api/proposals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, detail, nonce, threshold: threshold.toString(), proposer: account, signature }) })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'failed to submit proposal')
}

export async function signAndVote(proposalId: string, support: boolean): Promise<void> {
  const wallet = getWalletClient()
  const [account] = await wallet.requestAddresses()
  const nonce = BigInt(Date.now())                                  // monotonic — an older sig has a smaller nonce and is rejected
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)     // signature only valid for ~1 hour
  const signature = await wallet.signTypedData({ account, domain: EIP712_DOMAIN, types: VOTE_TYPES, primaryType: 'Vote', message: { proposalId, support, voter: account, nonce, deadline } })
  const r = await fetch('/api/votes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposalId, support, voter: account, nonce: nonce.toString(), deadline: deadline.toString(), signature }) })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'failed to vote')
}

/** Canonical burn sink — every burn (past founder burns + contract burns) lands here. */
export const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD' as const

/** The community Incentive Fund — a Safe multisig on Base. Seeded by me, grown
 *  by buybacks; every payout is public. Rewards the people who make Starchild
 *  better (genuine feedback first, then whatever the DAO decides). */
export const INCENTIVE_FUND = '0xcD46BD0010430E8cE680c0141c8f22ec992E42EB' as const
export const INCENTIVE_FUND_ENS = 'starchildfund.base.eth' as const

/** My personal holdings — public, tied to my ENS. Held openly, on purpose. */
export const FOUNDER_HOLDINGS = '0xE8f1B462BBf419315c14FBBd69689D9f163f36B2' as const
export const FOUNDER_HOLDINGS_ENS = 'kiliansolutions.eth' as const

// Multiple CORS-enabled Base RPCs with failover, and multicall batching so all
// reads coalesce into 1–2 requests (avoids 429 rate-limits from bursts).
export const publicClient = createPublicClient({
  chain: base,
  transport: fallback([
    http('https://base-rpc.publicnode.com'),
    http('https://base.drpc.org'),
    http('https://1rpc.io/base'),
    http('https://mainnet.base.org'),
  ]),
  batch: { multicall: { wait: 30 } },
})

export function getInjected(): EIP1193Provider | null {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).ethereum ?? null
}

export function getWalletClient() {
  const injected = getInjected()
  if (!injected) throw new Error('No wallet found. Install a Base-compatible wallet.')
  return createWalletClient({ chain: base, transport: custom(injected) })
}

// ─── ABIs (minimal) ───────────────────────────────────────────────────────────

export const erc20Abi = [
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }, { type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
] as const

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function fetchTokenMeta() {
  const [decimals, symbol] = await Promise.all([
    publicClient.readContract({ address: STARCHILD_TOKEN, abi: erc20Abi, functionName: 'decimals' }),
    publicClient.readContract({ address: STARCHILD_TOKEN, abi: erc20Abi, functionName: 'symbol' }),
  ])
  return { decimals: Number(decimals), symbol }
}

export type BurnStats = { burned: bigint; supply: bigint; pct: number; decimals: number; symbol: string }

/**
 * All-time burn, read straight from chain: balanceOf(0x…dEaD) ÷ totalSupply.
 * Captures every burn — the founder's existing burns AND every contract burn,
 * since they all land at the dead address. Works before the goals contract exists.
 */
export async function fetchBurnStats(): Promise<BurnStats> {
  const [supply, burned, decimals, symbol] = await Promise.all([
    publicClient.readContract({ address: STARCHILD_TOKEN, abi: erc20Abi, functionName: 'totalSupply' }) as Promise<bigint>,
    publicClient.readContract({ address: STARCHILD_TOKEN, abi: erc20Abi, functionName: 'balanceOf', args: [DEAD_ADDRESS] }) as Promise<bigint>,
    publicClient.readContract({ address: STARCHILD_TOKEN, abi: erc20Abi, functionName: 'decimals' }) as Promise<number>,
    publicClient.readContract({ address: STARCHILD_TOKEN, abi: erc20Abi, functionName: 'symbol' }) as Promise<string>,
  ])
  const pct = supply === 0n ? 0 : Number((burned * 1000000n) / supply) / 10000
  return { burned, supply, pct, decimals: Number(decimals), symbol }
}

export function fmt(amount: bigint, decimals: number, maxFrac = 0): string {
  const n = Number(formatUnits(amount, decimals))
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFrac })
}

// ── Live market stats + burn txns (served by /api/stats) ──────────────────────
export type Burn = { hash: string; from: string; amount: string; timestamp: string }
export type Stats = {
  price: string | null; marketCap: number | null; liquidity: number | null
  volume24h: number | null; chartUrl: string | null; burns: Burn[]
}
export async function fetchStats(): Promise<Stats> {
  const r = await fetch('/api/stats', { cache: 'no-store' })
  return r.json()
}

export const basescanTx = (hash: string) => `https://basescan.org/tx/${hash}`
export const basescanAddr = (addr: string) => `https://basescan.org/address/${addr}`
export const safeUrl = (addr: string) => `https://app.safe.global/balances?safe=base:${addr}`

// My posts about this token — embedded so they show their own real words, not a
// paraphrase. The label is only what each one is about, in order.
export const ARTICLES = [
  { id: '2036077636703715830', label: 'where the Starchild began' },
  { id: '2036945553167466929', label: 'why I first said no to the fees' },
  { id: '2038726798293311852', label: 'the companion itself, in motion' },
  { id: '2068817367296025035', label: 'why I changed my mind' },
  { id: '2069928720685486191', label: 'the first dev update' },
  { id: '2071407013167288519', label: 'the second dev update' },
].map((a) => ({ ...a, url: `https://x.com/KilianSolutions/status/${a.id}` }))

// Everything is verifiable — these are the receipts.
export const LINKS = {
  token: `https://basescan.org/token/${STARCHILD_TOKEN}`,
  fund: `https://basescan.org/address/${INCENTIVE_FUND}`,
  fundSafe: `https://app.safe.global/balances?safe=base:${INCENTIVE_FUND}`,
  holdings: `https://basescan.org/address/${FOUNDER_HOLDINGS}`,
  x: 'https://x.com/Starchild_app',
  xFounder: 'https://x.com/KilianSolutions',
  repo: 'https://github.com/forever8896/starchild',
  govSource: 'https://github.com/forever8896/starchild/blob/master/token/src/lib/governance.ts',
} as const
