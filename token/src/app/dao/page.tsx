'use client'

/**
 * token.starchild.software/dao — the governance experience as its own page.
 * Cinematic, video-rich, matching the main site; the collaborative search for
 * what the token can meaningfully do, with the product always protected.
 */
import { useCallback, useEffect, useState } from 'react'
import Navbar from '@/components/Navbar'
import VideoPlayer from '@/components/VideoPlayer'
import { LAV, GOLD, card, inputStyle, eyebrow, h2, lead, link, i, Star, Btn } from '@/components/ui'
import {
  fetchTokenMeta, fetchStakeInfo, fetchTotalStaked, fetchProposals,
  stakeTokens, unstakeTokens, signAndPropose, signAndVote,
  getInjected, fmt, stakingDeployed, PROPOSE_MIN, LINKS,
  type ProposalView,
} from '@/lib/burnGoals'
import { type Address } from 'viem'

export default function DaoPage() {
  const [account, setAccount] = useState<Address | null>(null)
  const [meta, setMeta] = useState({ decimals: 18, symbol: 'STARCHILD' })
  const [totalStaked, setTotalStaked] = useState<bigint>(0n)
  const [mine, setMine] = useState<{ amount: bigint; conviction: bigint } | null>(null)
  const [proposals, setProposals] = useState<ProposalView[]>([])
  const [stakeAmt, setStakeAmt] = useState('')
  const [pTitle, setPTitle] = useState(''); const [pDetail, setPDetail] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    const [m, ts, ps] = await Promise.all([
      fetchTokenMeta().catch(() => null),
      stakingDeployed ? fetchTotalStaked().catch(() => 0n) : Promise.resolve(0n),
      fetchProposals().catch(() => [] as ProposalView[]),
    ])
    if (m) setMeta(m); setTotalStaked(ts); setProposals(ps)
  }, [])
  const loadMine = useCallback(async (a: Address) => { if (stakingDeployed) setMine(await fetchStakeInfo(a).catch(() => null)) }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const connect = useCallback(async () => {
    const inj = getInjected()
    if (!inj) { setMsg('I couldn\'t find a wallet — install a Base-compatible one to take part.'); return }
    const accts = (await inj.request({ method: 'eth_requestAccounts' })) as string[]
    const a = accts?.[0] as Address; setAccount(a); if (a) loadMine(a)
  }, [loadMine])

  const run = useCallback(async (key: string, fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(key); setMsg(null)
    try { await fn(); if (okMsg) setMsg(okMsg); await loadAll(); if (account) await loadMine(account) }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setBusy(null) }
  }, [account, loadAll, loadMine])

  const staked = mine?.amount ?? 0n
  const canPropose = staked >= PROPOSE_MIN
  const minHuman = fmt(PROPOSE_MIN, meta.decimals)

  return (
    <main style={{ background: '#000', color: '#fff', minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      <Navbar />
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 85% 55% at 50% -6%, rgba(120,80,180,0.30) 0%, transparent 66%)' }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 660, margin: '0 auto', padding: '0 24px' }}>

        {/* ── Hero ── */}
        <section className="fade-up" style={{ paddingTop: 128, textAlign: 'center' }}>
          <div className="drift" style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
            <VideoPlayer src="/videos/starchild1.webm" className="glow-lavender" style={{ width: 'clamp(170px, 26vw, 280px)', height: 'auto' }} />
          </div>
          <p style={{ ...eyebrow, marginBottom: 16 }}>the commons · stake to steer, nothing burns</p>
          <h1 style={{ fontSize: 'clamp(2rem,5vw,3.1rem)', fontWeight: 300, fontStyle: 'italic', lineHeight: 1.15 }}>what should this token do?</h1>
          <p style={{ ...lead, marginTop: 20 }}>
            Honestly, I don&apos;t have the finished answer — and that&apos;s the whole point of this place. One rule
            never bends: nothing we build can compromise the companion. Inside that line there&apos;s real room, and
            I&apos;d rather find the good ideas with the people who care than guess at them alone. If you hold
            ${meta.symbol}, this is {i('your')} room too.
          </p>
          <p style={{ marginTop: 18, fontSize: 13 }}>
            <a href="/" style={link}>← back to the token</a>
          </p>
        </section>

        {msg && <p style={{ marginTop: 28, textAlign: 'center', fontSize: 14, borderRadius: 12, padding: '12px 16px', background: 'rgba(184,160,216,0.1)', color: LAV }}>{msg}</p>}

        <Star />

        {/* ── How it works ── */}
        <section>
          <p style={eyebrow}>how it works — and how to check it</p>
          <h2 style={h2}>stake to steer. nothing burns.</h2>
          <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 18, lineHeight: 1.7, color: 'rgba(255,255,255,0.72)', fontSize: '0.96rem' }}>
            <p><strong style={{ color: '#fff' }}>1 · Stake.</strong> Lock $STARCHILD in the staking contract. It&apos;s never burned, and it&apos;s yours to withdraw anytime. The longer you hold it staked, the more conviction it gathers.</p>
            <p><strong style={{ color: '#fff' }}>2 · Propose.</strong> With {minHuman} {meta.symbol} staked you can put an idea forward — by {i('signing a message')}. No gas, nothing spent. The signature is checked against your live stake.</p>
            <p><strong style={{ color: '#fff' }}>3 · Vote.</strong> Any staker backs a proposal with a gasless signature, weighted by their stake. Unstake and your weight leaves with you.</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>You don&apos;t have to take my word that it&apos;s fair — it&apos;s all open:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 13 }}>
              <a href={LINKS.stakingContract} target="_blank" rel="noreferrer" style={link}>staking contract ↗</a>
              <a href={LINKS.stakingSource} target="_blank" rel="noreferrer" style={link}>its source ↗</a>
              <a href={LINKS.govSource} target="_blank" rel="noreferrer" style={link}>the voting code ↗</a>
              <a href={LINKS.repo} target="_blank" rel="noreferrer" style={link}>everything ↗</a>
            </div>
          </div>
        </section>

        {/* ── Your stake ── */}
        <section style={{ marginTop: 30 }}>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 500 }}>Your stake</h3>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{stakingDeployed ? `${fmt(totalStaked, meta.decimals)} ${meta.symbol} staked in total` : 'staking soon'}</span>
            </div>
            {!stakingDeployed ? <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>Not live yet.</p>
              : !account ? <Btn onClick={connect}>Connect wallet</Btn>
              : (
                <>
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 700, color: GOLD }}>{fmt(staked, meta.decimals)}</div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)' }}>${meta.symbol} staked — your voice</div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input inputMode="decimal" placeholder="Amount" value={stakeAmt} onChange={(e) => setStakeAmt(e.target.value.replace(/[^0-9.]/g, ''))} style={inputStyle} />
                    <Btn onClick={() => run('stake', () => stakeTokens(stakeAmt, meta.decimals), 'Staked. Your voice counts now.')} disabled={!!busy || !stakeAmt}>{busy === 'stake' ? 'Staking…' : 'Stake'}</Btn>
                    <Btn kind="ghost" onClick={() => run('unstake', () => unstakeTokens(stakeAmt, meta.decimals), 'Unstaked.')} disabled={!!busy || !stakeAmt || staked === 0n}>{busy === 'unstake' ? '…' : 'Unstake'}</Btn>
                  </div>
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
            ) : proposals.map((p) => (
              <div key={p.id} style={card}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 500 }}>{p.title}</h3>
                {p.detail && <p style={{ marginTop: 8, fontSize: '0.92rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.6)' }}>{p.detail}</p>}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, gap: 12 }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                    <span style={{ color: GOLD, fontWeight: 600 }}>{fmt(BigInt(p.support), meta.decimals)}</span> {meta.symbol} · {p.voters} voter{p.voters === 1 ? '' : 's'}
                  </div>
                  <Btn onClick={() => run(`vote-${p.id}`, () => signAndVote(p.id, true), 'Signed — thank you.')} disabled={!!busy || !account || staked === 0n}>
                    {busy === `vote-${p.id}` ? 'Signing…' : 'Back it'}
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Propose ── */}
        <section style={{ marginTop: 26, marginBottom: 110 }}>
          <div style={{ ...card, opacity: account && canPropose ? 1 : 0.9 }}>
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
                  {canPropose ? 'Sign to put it forward — gasless.' : `You need ${minHuman} ${meta.symbol} staked to propose (you have ${fmt(staked, meta.decimals)}).`}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input placeholder="A utility this token could have, in a line" maxLength={100} value={pTitle} onChange={(e) => setPTitle(e.target.value)} style={inputStyle} disabled={!canPropose} />
                  <textarea placeholder="How it would work — and how it stays clear of the core product (optional)" maxLength={500} value={pDetail} onChange={(e) => setPDetail(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} disabled={!canPropose} />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Btn onClick={() => run('propose', async () => { await signAndPropose(pTitle.trim(), pDetail.trim()); setPTitle(''); setPDetail('') }, 'It\'s up. Thank you for thinking with me.')} disabled={!!busy || !canPropose || !pTitle.trim()}>
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
