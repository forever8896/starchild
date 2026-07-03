import { NextResponse } from 'next/server'
import { STARCHILD_TOKEN } from '@/lib/burnGoals'
import { getBurns, refreshBurns, type CachedBurn } from '@/lib/burnsCache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// fetch JSON with a hard timeout so a slow upstream can't hang the function
async function fetchJson(url: string, ms = 7000): Promise<unknown | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal, headers: { accept: 'application/json' } })
    return r.ok ? await r.json() : null
  } catch { return null } finally { clearTimeout(t) }
}

// Live price (DexScreener, CORS-open + reliable) + the founder's burn txns
// (from the on-chain Upstash index — explorers block Vercel's IPs).
export async function GET() {
  const out: {
    price: string | null; marketCap: number | null; liquidity: number | null
    volume24h: number | null; chartUrl: string | null; burns: CachedBurn[]
  } = { price: null, marketCap: null, liquidity: null, volume24h: null, chartUrl: null, burns: [] }

  const dex = await fetchJson(`https://api.dexscreener.com/latest/dex/tokens/${STARCHILD_TOKEN}`)
  // The burn ledger is a best-effort Redis read — never let it blank the price/stats.
  await refreshBurns().catch(() => {})

  const pairs: Array<Record<string, unknown>> = (dex as { pairs?: Array<Record<string, unknown>> })?.pairs ?? []
  const p = pairs.sort((a, b) => (((b.liquidity as { usd?: number })?.usd ?? 0) - ((a.liquidity as { usd?: number })?.usd ?? 0)))[0]
  if (p) {
    out.price = (p.priceUsd as string) ?? null
    out.marketCap = (p.marketCap as number) ?? (p.fdv as number) ?? null
    out.liquidity = ((p.liquidity as { usd?: number })?.usd) ?? null
    out.volume24h = ((p.volume as { h24?: number })?.h24) ?? null
    out.chartUrl = (p.url as string) ?? null
  }

  out.burns = await getBurns().catch(() => [])
  return NextResponse.json(out)
}
