import { Redis } from '@upstash/redis'
import { createPublicClient, http, parseAbiItem, type Address } from 'viem'
import { base } from 'viem/chains'
import { STARCHILD_TOKEN, DEAD_ADDRESS } from './burnGoals'

/**
 * Persistent burn index in Upstash. Explorers (Blockscout) block Vercel's
 * serverless IPs, so burns are read from chain via an RPC that permits wide
 * getLogs ranges, accumulated in Redis — seeded once, then forward-scanned for
 * new burns. History never disappears; new burns auto-append. Best-effort: if
 * the scan fails, the cached list still serves.
 *
 * NOTE: drpc's free tier now caps eth_getLogs at a 10-block range, which silently
 * broke the old 10k-chunk scan (the index froze). We use Tenderly's public Base
 * gateway, which permits large ranges; override with BASE_RPC_URL if needed.
 */
export type CachedBurn = { hash: string; from: string; amount: string; timestamp: string }

const KEY = 'burns', BLOCK = 'burnsLastBlock', TS = 'burnsTs'
const THROTTLE_MS = 10 * 60 * 1000
const CHUNK = 100_000 // getLogs window — Tenderly permits this; drpc free tier caps at 10
const ev = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
const RPC_URL = process.env.BASE_RPC_URL ?? 'https://base.gateway.tenderly.co'
const client = createPublicClient({ chain: base, transport: http(RPC_URL) })

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
      const to = Math.min(from + CHUNK - 1, current)
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

/**
 * Resumable full re-seed. Not throttled. Scans a window forward from the stored
 * cursor (or `from` on reset), appending any burns missing from the index. Call
 * repeatedly until `done`. Use `reset` once with `from` = a block safely before
 * the token existed to rebuild the whole index (fixes an incomplete seed).
 */
export async function reseedStep(opts: { from?: number; reset?: boolean; chunks?: number } = {}): Promise<{ scannedTo: number; current: number; count: number; done: boolean }> {
  const current = Number(await client.getBlockNumber())
  let last: number
  if (opts.reset) {
    last = (opts.from ?? 0) - 1
    await redis().set(KEY, [])
    await redis().set(BLOCK, last)
  } else {
    last = (await redis().get<number>(BLOCK)) ?? (opts.from ?? 0) - 1
  }

  const existing = (await redis().get<CachedBurn[]>(KEY)) ?? []
  if (current <= last) return { scannedTo: last, current, count: existing.length, done: true }

  const seen = new Set(existing.map((b) => b.hash.toLowerCase()))
  const fresh: CachedBurn[] = []
  let from = last + 1, scanned = last
  const maxChunks = opts.chunks ?? 15
  for (let i = 0; i < maxChunks && from <= current; i++) {
    const to = Math.min(from + CHUNK - 1, current)
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
  const merged = [...fresh, ...existing].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  await redis().set(KEY, merged)
  await redis().set(BLOCK, scanned)
  await redis().set(TS, Date.now())
  return { scannedTo: scanned, current, count: merged.length, done: scanned >= current }
}
