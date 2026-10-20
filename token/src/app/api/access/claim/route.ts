import { NextRequest, NextResponse } from 'next/server'
import { verifyTypedData, type Address, type Hex } from 'viem'
import { Redis } from '@upstash/redis'
import {
  ACCESS_DOMAIN, CLAIM_ACCESS_TYPES, capUsdForAmount, MIN_LOCK_WEI, readLockInfo,
} from '@/lib/access'

/**
 * POST /api/access/claim  (docs/inference-access-spec.md §4.3)
 * Body: { wallet, nonce, deadline, signature }. Verifies the EIP-712 ClaimAccess
 * signature, reads the lock on-chain, and mints a capped+expiring Venice INFERENCE
 * key with the admin key. Idempotent per (wallet, amount, unlockAt); re-claims after
 * a top-up/extend revoke the old key and mint a new one. The minted key is returned
 * to the holder and never stored client-side by us — they paste it into Starchild,
 * which then talks to Venice directly (E2EE; this backend is never in that path).
 */
const VENICE_KEYS = 'https://api.venice.ai/api/v1/api_keys'

function redis(): Redis {
  return new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! })
}

type StoredKey = { keyId: string; keyString: string; amount: string; unlockAt: number; createdAt: number }

export async function POST(req: NextRequest) {
  const admin = process.env.VENICE_ADMIN_KEY
  if (!admin) {
    return NextResponse.json({ error: 'Access minting is not configured yet (no admin key).' }, { status: 503 })
  }

  let body: { wallet?: Address; nonce?: string; deadline?: number; signature?: Hex }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const { wallet, nonce, deadline, signature } = body
  if (!wallet || !nonce || !deadline || !signature) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const now = Math.floor(Date.now() / 1000)
  if (deadline < now) return NextResponse.json({ error: 'Signature expired — try again.' }, { status: 400 })

  // 1. Verify the claim signature recovers `wallet`.
  const validSig = await verifyTypedData({
    address: wallet, domain: ACCESS_DOMAIN, types: CLAIM_ACCESS_TYPES, primaryType: 'ClaimAccess',
    message: { wallet, nonce, deadline: BigInt(deadline) }, signature,
  }).catch(() => false)
  if (!validSig) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

  const r = redis()

  // 2. Replay protection — a nonce is single-use.
  const nonceKey = `access:nonce:${nonce}`
  if (await r.get(nonceKey)) return NextResponse.json({ error: 'This claim was already used.' }, { status: 409 })

  // 3. Read the lock on-chain (source of truth).
  const { amount, unlockAt } = await readLockInfo(wallet)
  if (amount < MIN_LOCK_WEI) return NextResponse.json({ error: 'Lock is below the minimum.' }, { status: 400 })
  if (unlockAt <= now) return NextResponse.json({ error: 'Lock has expired — extend it and re-claim.' }, { status: 400 })

  const dailyCapUsd = capUsdForAmount(amount)
  const expiresAt = new Date(unlockAt * 1000).toISOString()
  const storeKey = `access:key:${wallet.toLowerCase()}`

  // 4. Idempotency — unchanged lock returns the same key.
  const existing = await r.get<StoredKey>(storeKey)
  if (existing && existing.amount === amount.toString() && existing.unlockAt === unlockAt) {
    await r.set(nonceKey, 1, { ex: 86400 })
    return NextResponse.json({ key: existing.keyString, expiresAt, dailyCapUsd })
  }
  // Lock changed → revoke the stale key before minting a fresh one.
  if (existing?.keyId) {
    await fetch(`${VENICE_KEYS}/${existing.keyId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${admin}` },
    }).catch(() => {})
  }

  // 5. Mint a capped, expiring INFERENCE key.
  const mintRes = await fetch(VENICE_KEYS, {
    method: 'POST',
    headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKeyType: 'INFERENCE',
      description: `starchild-access:${wallet}`.slice(0, 64),
      consumptionLimit: { usd: dailyCapUsd },
      limitPeriod: 'EPOCH', // resets daily at 00:00 UTC
      expiresAt,
    }),
  })
  const mintJson = await mintRes.json().catch(() => ({} as Record<string, unknown>))
  if (!mintRes.ok) {
    const detail = (mintJson as { error?: string }).error ?? mintRes.statusText
    return NextResponse.json({ error: `Mint failed: ${detail}` }, { status: 502 })
  }
  const data = ((mintJson as { data?: Record<string, unknown> }).data ?? mintJson) as Record<string, unknown>
  const keyString = (data.apiKey ?? data.key ?? data.apiKeyString) as string | undefined
  const keyId = (data.id ?? data.apiKeyId ?? data.keyId ?? '') as string
  if (!keyString) return NextResponse.json({ error: 'Mint returned no key.' }, { status: 502 })

  // 6. Persist for idempotency + future revoke; burn the nonce.
  const stored: StoredKey = { keyId, keyString, amount: amount.toString(), unlockAt, createdAt: now }
  await r.set(storeKey, stored)
  await r.set(nonceKey, 1, { ex: 86400 })

  return NextResponse.json({ key: keyString, expiresAt, dailyCapUsd })
}
