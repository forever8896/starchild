import { reseedStep, seedBurns, type CachedBurn } from '@/lib/burnsCache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST: seed the index directly with a pre-scanned list (for when scanning from
// Vercel is throttled by free-tier RPC limits). Body: { burns: CachedBurn[], lastBlock }.
export async function POST(req: Request) {
  const url = new URL(req.url)
  if (!process.env.BURN_RESEED_SECRET || url.searchParams.get('secret') !== process.env.BURN_RESEED_SECRET) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const body = (await req.json()) as { burns?: CachedBurn[]; lastBlock?: number }
    if (!Array.isArray(body.burns) || typeof body.lastBlock !== 'number') {
      return Response.json({ error: 'expected { burns: [...], lastBlock: number }' }, { status: 400 })
    }
    const clean = body.burns.filter((b) => b && b.hash && b.amount && b.from && b.timestamp)
    await seedBurns(clean, body.lastBlock)
    return Response.json({ ok: true, count: clean.length, lastBlock: body.lastBlock })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}

// Admin: resumable full re-seed of the on-chain burn index. Idempotent — it only
// rebuilds a public-data index, never touches funds. Protected by BURN_RESEED_SECRET.
//
// Usage: GET /api/burns/reseed?secret=…&from=<block>&reset=1   (start a fresh rebuild)
//        GET /api/burns/reseed?secret=…                        (continue) until {done:true}
export async function GET(req: Request) {
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret')
  if (!process.env.BURN_RESEED_SECRET || secret !== process.env.BURN_RESEED_SECRET) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const fromRaw = url.searchParams.get('from')
    const from = fromRaw ? Number(fromRaw) : undefined
    const reset = url.searchParams.get('reset') === '1'
    const r = await reseedStep({ from, reset })
    return Response.json(r)
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
