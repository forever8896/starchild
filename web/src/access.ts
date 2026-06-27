/**
 * Token utility on web (PRD §6.2 · docs/inference-access-spec.md):
 * lock $STARCHILD → claim a minted, capped, expiring Venice inference key.
 *
 * The minted key is a normal Venice key stored in the SAME slot as BYOK
 * (`venice_api_key`); conversation then runs client↔Venice E2EE — the mint
 * backend is never in the conversation path. Locked tokens still vote.
 *
 * SCAFFOLD: the on-chain steps (connect/lock) are stubbed pending a wallet lib
 * (viem + an injected Base provider) and the StarchildLock deploy address; the
 * claim POST is wired against the token-site mint endpoint, which still needs a
 * Venice admin key on the backend (the one external dependency).
 */

/** StarchildLock on Base. TODO: set after deploy (contracts/src/StarchildLock.sol). */
export const STARCHILD_LOCK_ADDRESS = '0x0000000000000000000000000000000000000000' as const
/** Token-site mint endpoint (verifies the lock on-chain, mints a scoped key). */
export const CLAIM_ENDPOINT = 'https://token.starchild.software/api/access/claim'

export type LockParams = { amountTokens: string; durationDays: number }
export type ClaimInput = { wallet: `0x${string}`; nonce: string; deadline: string; signature: `0x${string}` }
export type MintedKey = { key: string; expiresAt: string }

/** Connect a Base wallet (injected provider). TODO: wire viem/wagmi. */
export async function connectWallet(): Promise<`0x${string}`> {
  throw new Error('connectWallet: scaffold — wire viem + injected Base provider')
}

/** Lock $STARCHILD via StarchildLock.lock(amount, duration). TODO: viem writeContract. */
export async function lockTokens(_wallet: `0x${string}`, _params: LockParams): Promise<`0x${string}`> {
  throw new Error('lockTokens: scaffold — wire StarchildLock.lock(amount, duration) via viem')
}

/** Claim a minted Venice key for a locked wallet (EIP-712 signed proof of ownership). */
export async function claimAccessKey(input: ClaimInput): Promise<MintedKey> {
  const r = await fetch(CLAIM_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!r.ok) throw new Error((await r.json().catch(() => ({})) as { error?: string }).error ?? 'claim failed')
  return (await r.json()) as MintedKey
}

/**
 * Full "unlock free private access" flow → returns a Venice key the caller saves
 * via platform.setSetting('venice_api_key', key). SCAFFOLD: connect + lock + sign
 * are stubbed; claim is wired. Build order: connect → lock → sign EIP-712 → claim.
 */
export async function unlockFreeAccess(_params: LockParams): Promise<MintedKey> {
  throw new Error('unlockFreeAccess: scaffold — implement connect → lock → sign → claimAccessKey')
}
