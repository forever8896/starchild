import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { listProposals, addProposal, verifyProposal, tally, totalStaked, type Proposal } from '@/lib/governance'
import { isFounder } from '@/lib/burnGoals'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET — all proposals with live for/against tallies, official flag, and pass status
export async function GET() {
  try {
    const proposals = await listProposals()
    const [tallies, total] = await Promise.all([
      tally(proposals.map((p) => p.id)),
      totalStaked().catch(() => 0n),
    ])
    const data = proposals
      .map((p) => {
        const t = tallies[p.id] ?? { support: 0n, against: 0n, voters: 0, againstVoters: 0 }
        const quorumBps = Number(p.quorumBps ?? 0)
        const quorumTokens = quorumBps > 0 ? (total * BigInt(quorumBps)) / 10000n : 0n
        const passed = quorumBps > 0 && t.support >= quorumTokens && t.support > t.against
        return {
          id: p.id, title: p.title, detail: p.detail, proposer: p.proposer, createdAt: p.createdAt,
          support: t.support.toString(), against: t.against.toString(),
          voters: t.voters, againstVoters: t.againstVoters,
          quorumBps, quorumTokens: quorumTokens.toString(),
          official: isFounder(p.proposer), passed,
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

// POST — submit a signed proposal. Requires ≥10M staked, OR the founder address
// (which holds zero by design). An optional quorumBps (% of total staked, in
// basis points) turns it into a pass/fail vote.
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { title, detail, nonce, quorumBps, proposer, signature } = body ?? {}
    if (!title || !nonce || !proposer || !signature) {
      return NextResponse.json({ error: 'missing fields' }, { status: 400 })
    }
    const v = await verifyProposal({ title, detail: detail ?? '', nonce, quorumBps: Number(quorumBps) || 0, proposer, signature })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const proposal: Proposal = {
      id: crypto.randomUUID(), title: String(title).trim(), detail: String(detail ?? '').trim(),
      proposer: v.proposer, nonce: String(nonce),
      quorumBps: Math.max(0, Math.min(10000, Math.trunc(Number(quorumBps) || 0))),
      signature, createdAt: Date.now(),
    }
    await addProposal(proposal)
    return NextResponse.json({ ok: true, id: proposal.id })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
