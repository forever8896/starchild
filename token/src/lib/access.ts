/**
 * Inference access — lock $STARCHILD → claim a capped, expiring Venice key.
 * (docs/inference-access-spec.md). Shared, secret-free: constants, the EIP-712
 * `ClaimAccess` message, the cap mapping, on-chain lock reads, and the
 * client-side lock/sign helpers. The Venice ADMIN key + minting + Upstash live
 * ONLY in the server route (`app/api/access/claim`), never here.
 */
import { type Address, type Hex, parseAbi } from 'viem'
import { publicClient, getWalletClient, STARCHILD_TOKEN, erc20Abi } from './burnGoals'

/** StarchildLock on Base. Set NEXT_PUBLIC_STARCHILD_LOCK after deploy; zero = not live yet. */
export const STARCHILD_LOCK = (process.env.NEXT_PUBLIC_STARCHILD_LOCK ??
  '0x0000000000000000000000000000000000000000') as Address
export const LOCK_LIVE = STARCHILD_LOCK !== '0x0000000000000000000000000000000000000000'

export const LOCK_ABI = parseAbi([
  'function lock(uint256 amount, uint64 duration)',
  'function withdraw()',
  'function lockedOf(address user) view returns (uint256)',
  'function lockInfo(address user) view returns (uint256 amount, uint64 unlockAt)',
])

// ── EIP-712 ClaimAccess (proves wallet ownership for the mint) ──
// Distinct domain from governance so a claim signature can never be replayed as a vote.
export const ACCESS_DOMAIN = { name: 'Starchild Access', version: '1', chainId: 8453 } as const
export const CLAIM_ACCESS_TYPES = {
  ClaimAccess: [
    { name: 'wallet', type: 'address' },
    { name: 'nonce', type: 'string' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

// ── Cap mapping (spec §4.5; DAO-tunable). amount(wei) → daily USD epoch cap. ──
export const MIN_LOCK_TOKENS = 10_000_000n
export const MIN_LOCK_WEI = MIN_LOCK_TOKENS * 10n ** 18n
/** Lock duration presets (days). Min 30 — the lock duration IS the access duration. */
export const DURATION_PRESETS = [30, 90, 180, 365] as const

export function capUsdForAmount(amountWei: bigint): number {
  const tokens = amountWei / 10n ** 18n
  if (tokens >= 200_000_000n) return 4.0
  if (tokens >= 50_000_000n) return 1.0
  if (tokens >= 10_000_000n) return 0.25
  return 0
}

export type LockInfo = { amount: bigint; unlockAt: number }

/** Read (amount, unlockAt) for a wallet from the lock contract. */
export async function readLockInfo(wallet: Address): Promise<LockInfo> {
  if (!LOCK_LIVE) return { amount: 0n, unlockAt: 0 }
  const [amount, unlockAt] = (await publicClient.readContract({
    address: STARCHILD_LOCK, abi: LOCK_ABI, functionName: 'lockInfo', args: [wallet],
  })) as [bigint, bigint]
  return { amount, unlockAt: Number(unlockAt) }
}

// ── Client-side actions (browser/wallet only) ──

/** Approve (if needed) then lock `amountWei` for `durationDays`. Resolves when mined. */
export async function approveAndLock(account: Address, amountWei: bigint, durationDays: number): Promise<void> {
  if (!LOCK_LIVE) throw new Error('The lock contract is not deployed yet.')
  const wallet = getWalletClient()
  const allowance = (await publicClient.readContract({
    address: STARCHILD_TOKEN, abi: erc20Abi, functionName: 'allowance', args: [account, STARCHILD_LOCK],
  })) as bigint
  if (allowance < amountWei) {
    const approveHash = await wallet.writeContract({
      account, address: STARCHILD_TOKEN, abi: erc20Abi, functionName: 'approve', args: [STARCHILD_LOCK, amountWei],
    })
    await publicClient.waitForTransactionReceipt({ hash: approveHash })
  }
  const durationSecs = BigInt(durationDays * 24 * 3600)
  const lockHash = await wallet.writeContract({
    account, address: STARCHILD_LOCK, abi: LOCK_ABI, functionName: 'lock', args: [amountWei, durationSecs],
  })
  await publicClient.waitForTransactionReceipt({ hash: lockHash })
}

/** Sign the EIP-712 ClaimAccess message (proves ownership of `account`). */
export async function signClaim(account: Address): Promise<{ nonce: string; deadline: number; signature: Hex }> {
  const wallet = getWalletClient()
  const nonce = crypto.randomUUID()
  const deadline = Math.floor(Date.now() / 1000) + 600 // 10 min
  const signature = await wallet.signTypedData({
    account, domain: ACCESS_DOMAIN, types: CLAIM_ACCESS_TYPES, primaryType: 'ClaimAccess',
    message: { wallet: account, nonce, deadline: BigInt(deadline) },
  })
  return { nonce, deadline, signature }
}

export type ClaimResult = { key: string; expiresAt: string; dailyCapUsd: number }

/** POST the signed claim to the mint backend → returns the minted Venice key. */
export async function claimKey(input: { wallet: Address; nonce: string; deadline: number; signature: Hex }): Promise<ClaimResult> {
  const r = await fetch('/api/access/claim', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { error?: string }).error ?? 'Claim failed')
  return j as ClaimResult
}
