import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { listProposals, addProposal, verifyProposal, tally, type Proposal } from '@/lib/governance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET — all proposals with live stake-weighted support tallies
export async function GET() {
  try {
    const proposals = await listProposals()
    const tallies = await tally(proposals.map((p) => p.id))
    const data = proposals
      .map((p) => ({
        id: p.id, title: p.title, detail: p.detail, proposer: p.proposer, createdAt: p.createdAt,
        support: (tallies[p.id]?.support ?? 0n).toString(), voters: tallies[p.id]?.voters ?? 0,
      }))
      .sort((a, b) => (BigInt(b.support) > BigInt(a.support) ? 1 : BigInt(b.support) < BigInt(a.support) ? -1 : 0))
    return NextResponse.json({ proposals: data })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}

// POST — submit a signed proposal (requires ≥ 10,000,000 $STARCHILD staked)
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { title, detail, nonce, proposer, signature } = body ?? {}
    if (!title || !nonce || !proposer || !signature) {
      return NextResponse.json({ error: 'missing fields' }, { status: 400 })
    }
    const v = await verifyProposal({ title, detail: detail ?? '', nonce, proposer, signature })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const proposal: Proposal = {
      id: crypto.randomUUID(), title: String(title).trim(), detail: String(detail ?? '').trim(),
      proposer: v.proposer, nonce: String(nonce), signature, createdAt: Date.now(),
    }
    await addProposal(proposal)
    return NextResponse.json({ ok: true, id: proposal.id })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
