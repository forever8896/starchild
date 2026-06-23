import { NextResponse } from 'next/server'
import { verifyVote, recordVote, getVote } from '@/lib/governance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST — submit a signed vote (weight = your live $STARCHILD balance).
// One vote per wallet, counted once at your live balance. Re-submitting the SAME
// stance is rejected (there's nothing to re-cast); voting the other way changes it.
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { proposalId, support, voter, signature } = body ?? {}
    if (!proposalId || typeof support !== 'boolean' || !voter || !signature) {
      return NextResponse.json({ error: 'missing fields' }, { status: 400 })
    }
    const v = await verifyVote({ proposalId, support, voter, signature })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const current = await getVote(proposalId, v.voter)
    const next = support ? '1' : '0'
    if (current === next) {
      // already voted this way — voting again never adds weight (balance is read live)
      return NextResponse.json(
        { error: `You've already voted ${support ? 'for' : 'against'} this. Your live $STARCHILD balance is always counted, so there's nothing to re-cast.`, alreadyVoted: true },
        { status: 409 },
      )
    }

    await recordVote(proposalId, v.voter, support)
    return NextResponse.json({ ok: true, changed: current !== null })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
