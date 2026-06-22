import { NextResponse } from 'next/server'
import { verifyVote, recordVote } from '@/lib/governance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST — submit a signed vote (weight = your live staked balance)
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { proposalId, support, voter, signature } = body ?? {}
    if (!proposalId || typeof support !== 'boolean' || !voter || !signature) {
      return NextResponse.json({ error: 'missing fields' }, { status: 400 })
    }
    const v = await verifyVote({ proposalId, support, voter, signature })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    await recordVote(proposalId, v.voter, support)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
