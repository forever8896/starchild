import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { listProposals, addProposal, verifyProposal, tally, type Proposal } from '@/lib/governance'
import { isFounder } from '@/lib/burnGoals'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET — all proposals with live for/against tallies (weighted by current
// $STARCHILD holdings), official flag, and pass status against the threshold.
export async function GET() {
  try {
    const proposals = await listProposals()
    const tallies = await tally(proposals.map((p) => p.id))
    const data = proposals
      .map((p) => {
        const t = tallies[p.id] ?? { support: 0n, against: 0n, voters: 0, againstVoters: 0 }
        let threshold = 0n
        try { threshold = BigInt(p.threshold ?? '0') } catch { threshold = 0n }
        const passed = threshold > 0n && t.support >= threshold && t.support > t.against
        return {
          id: p.id, title: p.title, detail: p.detail, proposer: p.proposer, createdAt: p.createdAt,
          support: t.support.toString(), against: t.against.toString(),
          voters: t.voters, againstVoters: t.againstVoters,
          threshold: threshold.toString(), official: isFounder(p.proposer), passed,
        }
      })
      // official (founder) proposals pinned first, then by support
      .sort((a, b) =>
        (a.official === b.official ? 0 : a.official ? -1 : 1) ||
        (BigInt(b.support) > BigInt(a.support) ? 1 : BigInt(b.support) < BigInt(a.support) ? -1 : 0),
      )
    return NextResponse.json({ proposals: data })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}

// POST — submit a signed proposal. Requires holding ≥10M $STARCHILD, OR the
// founder address (which holds zero by design). An optional threshold (absolute
// $STARCHILD base units of "for" weight) turns it into a pass/fail vote.
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { title, detail, nonce, threshold, proposer, signature } = body ?? {}
    if (!title || !nonce || !proposer || !signature) {
      return NextResponse.json({ error: 'missing fields' }, { status: 400 })
    }
    const v = await verifyProposal({ title, detail: detail ?? '', nonce, threshold: String(threshold ?? '0'), proposer, signature })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    let thresh = '0'
    try { const b = BigInt(threshold ?? '0'); thresh = (b < 0n ? 0n : b).toString() } catch { thresh = '0' }
    const proposal: Proposal = {
      id: crypto.randomUUID(), title: String(title).trim(), detail: String(detail ?? '').trim(),
      proposer: v.proposer, nonce: String(nonce), threshold: thresh,
      signature, createdAt: Date.now(),
    }
    await addProposal(proposal)
    return NextResponse.json({ ok: true, id: proposal.id })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
