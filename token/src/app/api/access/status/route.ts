import { NextRequest, NextResponse } from 'next/server'
import { type Address } from 'viem'
import { Redis } from '@upstash/redis'
import { capUsdForAmount, readLockInfo, LOCK_LIVE } from '@/lib/access'

/**
 * GET /api/access/status?wallet=0x…  →  the wallet's current lock + whether a key
 * is issued for that exact lock. Read-only; used by the /access page UI.
 */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet') as Address | null
  if (!wallet) return NextResponse.json({ error: 'wallet required' }, { status: 400 })

  const { amount, unlockAt } = await readLockInfo(wallet)

  let hasKey = false
  if (LOCK_LIVE && process.env.UPSTASH_REDIS_REST_URL) {
    const r = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! })
    const existing = await r.get<{ unlockAt: number }>(`access:key:${wallet.toLowerCase()}`)
    hasKey = !!existing && existing.unlockAt === unlockAt
  }

  return NextResponse.json({
    lockLive: LOCK_LIVE,
    amount: amount.toString(),
    unlockAt,
    dailyCapUsd: capUsdForAmount(amount),
    hasKey,
  })
}
