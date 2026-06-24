'use client'

/**
 * token.starchild.software/dao — the governance experience as its own page.
 * Weight = how much $STARCHILD you hold (live), proposals/votes are gasless
 * EIP-712 signatures. No staking, no locking, no contract. Public by design.
 */
import { useCallback, useEffect, useState } from 'react'
import Navbar from '@/components/Navbar'
import VideoPlayer from '@/components/VideoPlayer'
import { LAV, GOLD, card, inputStyle, eyebrow, h2, lead, link, i, Star, Btn } from '@/components/ui'
import {
  fetchTokenMeta, fetchBalance, fetchProposals, signAndPropose, signAndVote,
  getInjected, fmt, PROPOSE_MIN, LINKS, isFounder,
  type ProposalView,
} from '@/lib/burnGoals'
import { type Address, parseUnits } from 'viem'

const MINT = '#a8d8b8', ROSE = '#e0a0a0'

export default function DaoPage() {
  const [account, setAccount] = useState<Address | null>(null)
  const [meta, setMeta] = useState({ decimals: 18, symbol: 'STARCHILD' })
  const [bal, setBal] = useState<bigint>(0n)
  const [proposals, setProposals] = useState<ProposalView[]>([])
  const [pTitle, setPTitle] = useState(''); const [pDetail, setPDetail] = useState(''); const [pThresh, setPThresh] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    const [m, ps] = await Promise.all([fetchTokenMeta().catch(() => null), fetchProposals().catch(() => [] as ProposalView[])])
    if (m) setMeta(m); setProposals(ps)
  }, [])
  const loadBal = useCallback(async (a: Address) => { setBal(await fetchBalance(a).catch(() => 0n)) }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const connect = useCallback(async () => {
    const inj = getInjected()
    if (!inj) { setMsg('I couldn\'t find a wallet — install a Base-compatible one to take part.'); return }
    const accts = (await inj.request({ method: 'eth_requestAccounts' })) as string[]
    const a = accts?.[0] as Address; setAccount(a); if (a) loadBal(a)
  }, [loadBal])

  const run = useCallback(async (key: string, fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(key); setMsg(null)
    try { await fn(); if (okMsg) setMsg(okMsg); await loadAll(); if (account) await loadBal(account) }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setBusy(null) }
  }, [account, loadAll, loadBal])

  const official = isFounder(account)
  const canPropose = bal >= PROPOSE_MIN || official
  const minHuman = fmt(PROPOSE_MIN, meta.decimals)

  return (
    <main style={{ background: '#000', color: '#fff', minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      <Navbar />
      {/* layered cosmic backdrop */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 85% 55% at 50% -6%, rgba(120,80,180,0.30) 0%, transparent 66%)' }} />
      <div aria-hidden className="starfield slow" />
      <div aria-hidden className="starfield" />
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 70% 40% at 50% 108%, rgba(232,216,168,0.10) 0%, transparent 60%)' }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 660, margin: '0 auto', padding: '0 24px' }}>

        {/* ── Hero ── */}
        <section className="fade-up" style={{ paddingTop: 128, textAlign: 'center' }}>
          <div className="drift aura" style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
            <VideoPlayer src="/videos/starchild1.webm" className="glow-lavender" style={{ width: 'clamp(170px, 26vw, 280px)', height: 'auto' }} />
          </div>
          <p style={{ ...eyebrow, marginBottom: 16 }}>the commons · hold $STARCHILD, have a say</p>
          <h1 style={{ fontSize: 'clamp(2rem,5vw,3.1rem)', fontWeight: 300, fontStyle: 'italic', lineHeight: 1.15 }}>what should this token do?</h1>
          <p style={{ ...lead, marginTop: 20 }}>
            Honestly, I don&apos;t have the finished answer — and that&apos;s the whole point of this place. One rule
            never bends: nothing we build can compromise the companion. Inside that line there&apos;s real room, and
            I&apos;d rather find the good ideas with the people who care than guess alone. If you hold ${meta.symbol},
            this is {i('your')} room too — your balance is your voice, no staking, no lock-up.
          </p>
          <p style={{ marginTop: 18, fontSize: 13 }}><a href="/" style={link}>← back to the token</a></p>
        </section>

        {msg && <p style={{ marginTop: 28, textAlign: 'center', fontSize: 14, borderRadius: 12, padding: '12px 16px', background: 'rgba(184,160,216,0.1)', color: LAV }}>{msg}</p>}

        <Star />

        {/* ── How it works ── */}
        <section>
          <p style={eyebrow}>how it works — and how to check it</p>
          <h2 style={h2}>hold to steer. nothing locked.</h2>
          <div className="card-lift" style={{ ...card, display: 'flex', flexDirection: 'column', gap: 18, lineHeight: 1.7, color: 'rgba(255,255,255,0.72)', fontSize: '0.96rem' }}>
            <p><strong style={{ color: '#fff' }}>1 · Hold.</strong> Your weight is simply how much $STARCHILD you hold — read live, on-chain. No staking, no locking, nothing to approve. Your tokens stay in your wallet, yours to move anytime.</p>
            <p><strong style={{ color: '#fff' }}>2 · Propose.</strong> Hold at least {minHuman} {meta.symbol} and you can put an idea forward by {i('signing a message')}. No gas, nothing spent.</p>
            <p><strong style={{ color: '#fff' }}>3 · Vote.</strong> Any holder backs or opposes a proposal with a gasless signature, weighted by their live balance. Sell, and your weight leaves with you — so you can&apos;t vote and then dump for free.</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>You don&apos;t have to take my word that it&apos;s fair — it&apos;s all open:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 13 }}>
              <a href={LINKS.token} target="_blank" rel="noreferrer" style={link}>the token ↗</a>
              <a href={LINKS.govSource} target="_blank" rel="noreferrer" style={link}>the voting code ↗</a>
              <a href={LINKS.repo} target="_blank" rel="noreferrer" style={link}>everything ↗</a>
            </div>
          </div>
        </section>

        {/* ── Your weight ── */}
        <section style={{ marginTop: 30 }}>
          <div className="card-lift" style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
            background: account ? 'linear-gradient(180deg, rgba(40,33,58,0.6), rgba(14,11,24,0.6))' : card.background }}>
            {!account ? (
              <>
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>Connect to see your weight and take part.</span>
                <Btn onClick={connect}>Connect wallet</Btn>
              </>
            ) : (
              <>
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                    <span style={{ fontSize: '2rem', fontWeight: 700, color: GOLD, letterSpacing: '-0.01em', textShadow: '0 0 26px rgba(232,216,168,0.45)' }}>{fmt(bal, meta.decimals)}</span>
                    <span className="star-pulse" style={{ color: GOLD, fontSize: 15 }}>✦</span>
                  </div>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>${meta.symbol} you hold — your voting weight</div>
                </div>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', maxWidth: 150, textAlign: 'right', lineHeight: 1.5 }}>nothing to stake or lock — just hold &amp; sign</span>
              </>
            )}
          </div>
        </section>

        <Star margin="60px 0" />

        {/* ── Proposals ── */}
        <section>
          <div className="drift" style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <VideoPlayer src="/videos/starchild4.webm" className="glow-lavender" style={{ width: 'clamp(120px, 16vw, 170px)', height: 'auto' }} />
          </div>
          <p style={eyebrow}>ideas on the table</p>
          <h2 style={h2}>what we figure out, together</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 30 }}>
            {proposals.length === 0 ? (
              <p style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Nothing here yet — open the first one.</p>
            ) : proposals.map((p) => {
              const fr = BigInt(p.support), ag = BigInt(p.against), q = BigInt(p.threshold)
              const pct = q > 0n ? Number((fr * 1000n) / q) / 10 : 0
              const total = fr + ag
              const forPct = total > 0n ? Number((fr * 1000n) / total) / 10 : 50
              return (
              <div key={p.id} className="card-lift" style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {p.official && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1a1525', background: GOLD, borderRadius: 6, padding: '2px 7px' }}>official</span>}
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 500 }}>{p.title}</h3>
                  {q > 0n && (
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: p.passed ? MINT : LAV }}>
                      {p.passed ? '✓ passed' : 'open vote'}
                    </span>
                  )}
                </div>
                {p.detail && <p style={{ marginTop: 8, fontSize: '0.92rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.6)' }}>{p.detail}</p>}

                <div style={{ display: 'flex', gap: 18, marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                  <span><span style={{ color: MINT, fontWeight: 600 }}>{fmt(fr, meta.decimals)}</span> for · {p.voters}</span>
                  <span><span style={{ color: ROSE, fontWeight: 600 }}>{fmt(ag, meta.decimals)}</span> against · {p.againstVoters}</span>
                </div>

                {/* tally bar — progress-to-pass for threshold votes; for/against split for idea boards */}
                {q > 0n ? (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, pct)}%`,
                        background: p.passed ? `linear-gradient(90deg, ${MINT}, #cdebd6)` : `linear-gradient(90deg, ${LAV}, ${GOLD})`,
                        boxShadow: p.passed ? `0 0 16px ${MINT}66` : '0 0 16px rgba(184,160,216,0.5)', transition: 'width .5s' }} />
                    </div>
                    <div style={{ marginTop: 7, fontSize: 11, color: 'rgba(255,255,255,0.42)' }}>
                      {pct.toFixed(0)}% of the {fmt(q, meta.decimals)} {meta.symbol} needed to pass
                    </div>
                  </div>
                ) : total > 0n ? (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex', background: 'rgba(255,255,255,0.07)' }}>
                      <div style={{ width: `${forPct}%`, background: `linear-gradient(90deg, ${MINT}, #cdebd6)`, boxShadow: `0 0 14px ${MINT}55`, transition: 'width .5s' }} />
                      <div style={{ width: `${100 - forPct}%`, background: `linear-gradient(90deg, #e6b0b0, ${ROSE})`, transition: 'width .5s' }} />
                    </div>
                    <div style={{ marginTop: 7, fontSize: 11, color: 'rgba(255,255,255,0.42)' }}>
                      {forPct.toFixed(0)}% of the weight cast is backing this
                    </div>
                  </div>
                ) : null}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 18, gap: 10 }}>
                  <Btn kind="ghost" onClick={() => run(`no-${p.id}`, () => signAndVote(p.id, false), 'Signed — your vote against counts.')} disabled={!!busy || !account || bal === 0n}>
                    {busy === `no-${p.id}` ? '…' : 'Against'}
                  </Btn>
                  <Btn onClick={() => run(`yes-${p.id}`, () => signAndVote(p.id, true), 'Signed — thank you.')} disabled={!!busy || !account || bal === 0n}>
                    {busy === `yes-${p.id}` ? 'Signing…' : 'Back it'}
                  </Btn>
                </div>
              </div>
              )
            })}
          </div>
        </section>

        {/* ── Propose ── */}
        <section style={{ marginTop: 26, marginBottom: 110 }}>
          <div className="card-lift" style={{ ...card, opacity: account && canPropose ? 1 : 0.9 }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 500, marginBottom: 14 }}>Bring an idea</h3>
            <div style={{ borderRadius: 14, padding: '15px 17px', marginBottom: 18, background: 'rgba(232,216,168,0.06)', border: '1px solid rgba(232,216,168,0.25)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: GOLD, marginBottom: 7 }}>the one rule ✦</div>
              <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'rgba(255,255,255,0.72)' }}>
                There&apos;s a single rule, and it&apos;s what keeps this honest: the app itself stays
                {i(' free and open to everyone')} — we never paywall it or lock anyone out who can&apos;t pay. That&apos;s
                the only line. Everything else is wide open — fund the work, grow the commons, reward the people building
                it, find the token real utility. That&apos;s where you come in, and I genuinely want your ideas.
              </p>
            </div>
            {!account ? <Btn onClick={connect}>Connect wallet to propose</Btn> : (
              <>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 14 }}>
                  {official
                    ? 'You\'re posting as the founder — official proposal, no holdings needed. (You hold zero, so you can\'t vote on it — the holders decide.)'
                    : canPropose ? 'Sign to put it forward — gasless.' : `You need to hold ${minHuman} ${meta.symbol} to propose (you hold ${fmt(bal, meta.decimals)}).`}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input placeholder="A utility this token could have, in a line" maxLength={100} value={pTitle} onChange={(e) => setPTitle(e.target.value)} style={inputStyle} disabled={!canPropose} />
                  <textarea placeholder="How it would work — and how it stays clear of the core product (optional)" maxLength={500} value={pDetail} onChange={(e) => setPDetail(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} disabled={!canPropose} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input inputMode="numeric" placeholder="Pass threshold" value={pThresh} onChange={(e) => setPThresh(e.target.value.replace(/[^0-9]/g, ''))} style={{ ...inputStyle, maxWidth: 150 }} disabled={!canPropose} />
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>optional — blank = idea board; or set how much &quot;for&quot; weight (in {meta.symbol}) it must reach to pass a yes/no vote</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Btn onClick={() => run('propose', async () => { await signAndPropose(pTitle.trim(), pDetail.trim(), pThresh ? parseUnits(pThresh, meta.decimals) : 0n); setPTitle(''); setPDetail(''); setPThresh('') }, 'It\'s up. Thank you for thinking with me.')} disabled={!!busy || !canPropose || !pTitle.trim()}>
                      {busy === 'propose' ? 'Submitting…' : 'Sign & propose'}
                    </Btn>
                  </div>
                </div>
              </>
            )}
          </div>
          <p style={{ marginTop: 30, fontSize: 12, color: 'rgba(255,255,255,0.35)', textAlign: 'center', lineHeight: 1.7 }}>
            <a href="/" style={link}>← the token</a> · the companion lives at <a href="https://starchild.software" style={link}>starchild.software</a> ✦
          </p>
        </section>
      </div>
    </main>
  )
}
