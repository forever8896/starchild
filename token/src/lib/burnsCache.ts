import { Redis } from '@upstash/redis'
import { createPublicClient, http, parseAbiItem, type Address } from 'viem'
import { base } from 'viem/chains'
import { STARCHILD_TOKEN, DEAD_ADDRESS } from './burnGoals'

/**
 * Persistent burn index in Upstash. Explorers (Blockscout) block Vercel's
 * serverless IPs, so burns are read from chain via drpc (10k-block getLogs
 * chunks) and accumulated in Redis — seeded once, then forward-scanned for new
 * burns. History never disappears; new burns auto-append. Best-effort: if the
 * scan fails, the cached list still serves.
 */
export type CachedBurn = { hash: string; from: string; amount: string; timestamp: string }

const KEY = 'burns', BLOCK = 'burnsLastBlock', TS = 'burnsTs'
const THROTTLE_MS = 10 * 60 * 1000
const ev = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
const client = createPublicClient({ chain: base, transport: http('https://base.drpc.org') })

let _r: Redis | null = null
function redis(): Redis {
  if (!_r) _r = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! })
  return _r
}

export async function getBurns(): Promise<CachedBurn[]> {
  const b = await redis().get<CachedBurn[]>(KEY)
  return (b ?? []).filter((x) => { try { return BigInt(x.amount) >= 10n ** 18n } catch { return false } })
}

// Seed/replace the full index (run once from a non-blocked context).
export async function seedBurns(burns: CachedBurn[], lastBlock: number): Promise<void> {
  await redis().set(KEY, burns)
  await redis().set(BLOCK, lastBlock)
  await redis().set(TS, Date.now())
}

// Forward-scan from the last indexed block; append new burns. Throttled.
export async function refreshBurns(): Promise<void> {
  try {
    const ts = (await redis().get<number>(TS)) ?? 0
    if (Date.now() - ts < THROTTLE_MS) return
    const last = (await redis().get<number>(BLOCK)) ?? 0
    if (!last) return // not seeded — avoid a full-history scan at request time
    const current = Number(await client.getBlockNumber())
    if (current <= last) { await redis().set(TS, Date.now()); return }

    const existing = (await redis().get<CachedBurn[]>(KEY)) ?? []
    const seen = new Set(existing.map((b) => b.hash.toLowerCase()))
    const fresh: CachedBurn[] = []
    let from = last + 1, scanned = last
    for (let i = 0; i < 40 && from <= current; i++) {
      const to = Math.min(from + 9999, current)
      const logs = await client.getLogs({ address: STARCHILD_TOKEN, event: ev, args: { to: DEAD_ADDRESS }, fromBlock: BigInt(from), toBlock: BigInt(to) })
      for (const l of logs) {
        const h = l.transactionHash.toLowerCase()
        if (seen.has(h)) continue
        seen.add(h)
        const blk = await client.getBlock({ blockNumber: l.blockNumber })
        fresh.push({
          hash: l.transactionHash,
          from: l.args.from as Address,
          amount: (l.args.value as bigint).toString(),
          timestamp: new Date(Number(blk.timestamp) * 1000).toISOString(),
        })
      }
      scanned = to; from = to + 1
    }
    if (fresh.length) {
      const merged = [...fresh, ...existing].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      await redis().set(KEY, merged)
    }
    await redis().set(BLOCK, scanned)
    await redis().set(TS, Date.now())
  } catch { /* best-effort — cached list still serves */ }
}
