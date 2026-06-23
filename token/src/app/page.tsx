'use client'

/**
 * token.starchild.software — the token home: what Starchild is, the story, the
 * burns, and an invitation into the DAO (its own page). First person, by me.
 */
import { useCallback, useEffect, useState } from 'react'
import Navbar from '@/components/Navbar'
import VideoPlayer from '@/components/VideoPlayer'
import { LAV, GOLD, card, eyebrow, h2, lead, link, i, Star, LinkBtn, usd, priceFmt, Stat } from '@/components/ui'
import {
  fetchBurnStats, fetchTokenMeta, fetchStats, fetchProposals,
  fmt, basescanTx, ARTICLES,
  type BurnStats, type Stats,
} from '@/lib/burnGoals'

export default function TokenHome() {
  const [meta, setMeta] = useState({ decimals: 18, symbol: 'STARCHILD' })
  const [burn, setBurn] = useState<BurnStats | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [proposalCount, setProposalCount] = useState<number | null>(null)

  useEffect(() => {
    fetchTokenMeta().then(setMeta).catch(() => {})
    fetchBurnStats().then(setBurn).catch(() => {})
    fetchStats().then(setStats).catch(() => {})
    fetchProposals().then((p) => setProposalCount(p.length)).catch(() => {})
    const id = setInterval(() => { fetchStats().then(setStats).catch(() => {}) }, 30000)
    return () => clearInterval(id)
  }, [])

  return (
    <main style={{ background: '#000', color: '#fff', minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      <Navbar />
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 80% 50% at 50% -8%, rgba(120,80,180,0.26) 0%, transparent 68%)' }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 660, margin: '0 auto', padding: '0 24px' }}>

        {/* ── Hero ── */}
        <section className="fade-up" style={{ paddingTop: 132, textAlign: 'center' }}>
          <div className="drift" style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
            <VideoPlayer src="/videos/starchild5.webm" className="glow-lavender" style={{ width: 'clamp(150px, 22vw, 230px)', height: 'auto' }} />
          </div>
          <p style={{ ...eyebrow, marginBottom: 16 }}>the token around an open-source companion</p>
          <h1 style={{ fontSize: 'clamp(2.2rem,5.2vw,3.4rem)', fontWeight: 300, fontStyle: 'italic', letterSpacing: '-0.01em' }}>$STARCHILD</h1>
          <p style={{ ...lead, marginTop: 18 }}>
            $STARCHILD is the token that grew up around {i('Starchild')} — a private, open-source companion that helps
            you find your life&apos;s purpose. Anyone can use the app for free; you never need the token for that. What
            the token gives you is a way to {i('back the mission and help shape where it goes')} — and that part I&apos;d
            genuinely rather figure out with you than alone.
          </p>
          <div style={{ marginTop: 22, display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderRadius: 999,
            border: '1px solid rgba(184,160,216,0.25)', background: 'rgba(184,160,216,0.07)' }}>
            <span style={{ fontWeight: 700, color: GOLD }}>{priceFmt(stats?.price ?? null)}</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>per ${meta.symbol}</span>
            {stats?.chartUrl && <a href={stats.chartUrl} target="_blank" rel="noreferrer" style={{ ...link, fontSize: 12 }}>chart ↗</a>}
          </div>

          <div style={{ ...card, marginTop: 40, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 22, padding: '22px 24px' }}>
            <Stat label="market cap" value={usd(stats?.marketCap ?? null)} href={stats?.chartUrl ?? undefined} />
            <Stat label="liquidity" value={usd(stats?.liquidity ?? null)} />
            <Stat label="24h volume" value={usd(stats?.volume24h ?? null)} />
          </div>
        </section>

        {/* ── What the companion is ── */}
        <section style={{ marginTop: 60 }}>
          <p style={eyebrow}>first, the thing itself</p>
          <h2 style={h2}>the Starchild</h2>
          <p style={lead}>
            A private companion that helps you find your life&apos;s purpose. Not a chatbot — a being you actually talk
            to, that asks the questions you&apos;ve been avoiding and turns your answers into small, real steps toward
            the life you describe. It lives on your own machine, and every conversation is end-to-end encrypted — no
            cloud, no tracking, not even me. It&apos;s free, and the code is open.
          </p>
          <div style={{ textAlign: 'center', marginTop: 30 }}>
            <LinkBtn href="https://starchild.software" external>meet the companion ↗</LinkBtn>
          </div>
        </section>

        <Star />

        {/* ── Lore: the posts, in order ── */}
        <section>
          <p style={eyebrow}>i&apos;ve changed my mind in public</p>
          <h2 style={h2}>everything I&apos;ve said about this token</h2>
          <p style={lead}>
            I didn&apos;t make this token — someone else did. I spent weeks certain I shouldn&apos;t touch it. Then I
            changed my mind, claimed it, and burned all of it. I never edited any of that. Here it is, in order, in my
            own words:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 38 }}>
            {ARTICLES.map((a, idx) => (
              <a key={a.id} href={a.url} target="_blank" rel="noreferrer"
                style={{ ...card, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20, textDecoration: 'none', color: '#fff' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 600, fontStyle: 'italic', color: LAV, opacity: 0.45, minWidth: 32, textAlign: 'center' }}>{['I', 'II', 'III', 'IV'][idx]}</span>
                <span style={{ flex: 1, fontSize: '1.05rem', color: 'rgba(255,255,255,0.92)' }}>{a.label}</span>
                <span style={{ color: LAV, fontSize: 13, whiteSpace: 'nowrap' }}>read on X ↗</span>
              </a>
            ))}
          </div>
        </section>

        <Star />

        {/* ── The burns ── */}
        <section>
          <p style={eyebrow}>the burns</p>
          <h2 style={h2}>what I was given, I burned</h2>
          <p style={{ ...lead, marginBottom: 28 }}>
            I didn&apos;t make this token and I don&apos;t hold any of it. Whatever I was handed went to a dead address;
            I keep only the ETH from fees, to keep the work going. Nothing here needs to be taken on faith — every line
            is a transaction you can open:
          </p>
          <div style={card}>
            {!stats || stats.burns.length === 0 ? (
              <p style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Loading burns…</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {stats.burns.map((b, idx) => (
                  <a key={b.hash} href={basescanTx(b.hash)} target="_blank" rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 4px',
                      borderTop: idx ? '1px solid rgba(255,255,255,0.06)' : 'none', textDecoration: 'none', color: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{ opacity: 0.7 }}>🔥</span>
                      <div>
                        <div style={{ fontWeight: 500 }}>{fmt(BigInt(b.amount), meta.decimals)} {meta.symbol}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.42)' }}>{b.timestamp?.slice(0, 10)}</div>
                      </div>
                    </div>
                    <span style={{ ...link, fontSize: 12, fontFamily: 'monospace' }}>{b.hash.slice(0, 10)}… ↗</span>
                  </a>
                ))}
              </div>
            )}
          </div>
          {burn && (
            <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
              {fmt(burn.burned, burn.decimals)} {meta.symbol} burned so far · {burn.pct.toFixed(2)}% of supply
            </p>
          )}
        </section>

        <Star />

        {/* ── DAO invitation → its own page ── */}
        <section style={{ marginBottom: 120 }}>
          <div className="drift" style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
            <VideoPlayer src="/videos/starchild3.webm" className="glow-lavender" style={{ width: 'clamp(140px, 20vw, 200px)', height: 'auto' }} />
          </div>
          <p style={eyebrow}>help figure it out</p>
          <h2 style={h2}>what should this token do?</h2>
          <p style={lead}>
            I don&apos;t have the finished answer — and that&apos;s the point. The one rule never bends: nothing we build
            can compromise the companion. Inside that, there&apos;s real room, and I&apos;d rather find the good ideas
            with the people who care than guess alone. Stake to have a say, and bring the utilities you think could work.
          </p>
          <div style={{ textAlign: 'center', marginTop: 30 }}>
            <LinkBtn href="/dao">enter the DAO ↗</LinkBtn>
          </div>
          {proposalCount !== null && (
            <p style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
              {proposalCount} idea{proposalCount === 1 ? '' : 's'} on the table · your $STARCHILD is your vote
            </p>
          )}
          <p style={{ marginTop: 40, fontSize: 12, color: 'rgba(255,255,255,0.35)', textAlign: 'center', lineHeight: 1.7 }}>
            the companion lives at <a href="https://starchild.software" style={link}>starchild.software</a> — private, local, free.<br />
            this is the commons we&apos;re building around it, together. ✦
          </p>
        </section>
      </div>
    </main>
  )
}
