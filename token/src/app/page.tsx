'use client'

/**
 * token.starchild.software — the token home, redesigned from Starchild.dc.
 * Same live data as before (price/stats, burns, fund + holdings balances,
 * the posts, the fee split), now in the cosmic-cathedral visual language.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatUnits } from 'viem'
import { CosmicBg, SiteNav, DISP, MONO, LAV, GOLD, LILAC } from '@/components/cosmic'
import { usd, priceFmt } from '@/components/ui'
import {
  fetchBurnStats, fetchTokenMeta, fetchStats, fetchBalance,
  fmt, basescanTx, ARTICLES, LINKS, STARCHILD_TOKEN,
  INCENTIVE_FUND, INCENTIVE_FUND_ENS, FOUNDER_HOLDINGS, FOUNDER_HOLDINGS_ENS,
  type BurnStats, type Stats,
} from '@/lib/burnGoals'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
const SHORT_CA = `${STARCHILD_TOKEN.slice(0, 6)}…${STARCHILD_TOKEN.slice(-4)}`

// Twitter snowflake → real post month (no fake dates).
function postDate(id: string): string {
  try {
    const ms = Number((BigInt(id) >> 22n) + 1288834974657n)
    return new Date(ms).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toLowerCase()
  } catch {
    return ''
  }
}
function usdOf(bal: bigint | null, decimals: number, priceStr?: string | null): string {
  if (bal == null || !priceStr) return '—'
  const p = Number(priceStr)
  if (!isFinite(p) || p <= 0) return '—'
  return usd(Number(formatUnits(bal, decimals)) * p)
}

const eyebrow: React.CSSProperties = { fontFamily: MONO, fontSize: 12, letterSpacing: '.3em', textTransform: 'uppercase', color: LAV }
const heading: React.CSSProperties = { fontFamily: DISP, fontWeight: 200, lineHeight: 1.08, letterSpacing: '-.015em' }
const ital: React.CSSProperties = { fontStyle: 'italic', color: LILAC }
const videoMask: React.CSSProperties = { WebkitMaskImage: 'radial-gradient(circle at 50% 47%,#000 56%,transparent 80%)', maskImage: 'radial-gradient(circle at 50% 47%,#000 56%,transparent 80%)' }

export default function TokenHome() {
  const [meta, setMeta] = useState({ decimals: 18, symbol: 'STARCHILD' })
  const [burn, setBurn] = useState<BurnStats | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [fundBal, setFundBal] = useState<bigint | null>(null)
  const [holdBal, setHoldBal] = useState<bigint | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchTokenMeta().then(setMeta).catch(() => {})
    fetchBurnStats().then(setBurn).catch(() => {})
    fetchStats().then(setStats).catch(() => {})
    fetchBalance(INCENTIVE_FUND).then(setFundBal).catch(() => {})
    fetchBalance(FOUNDER_HOLDINGS).then(setHoldBal).catch(() => {})
    const id = setInterval(() => { fetchStats().then(setStats).catch(() => {}) }, 30000)
    return () => clearInterval(id)
  }, [])

  function copyCA() {
    try { navigator.clipboard.writeText(STARCHILD_TOKEN) } catch { /* clipboard unavailable */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const price = priceFmt(stats?.price ?? null)
  const posts = ARTICLES.map((a, i) => ({ n: ROMAN[i] ?? String(i + 1), title: a.label, date: postDate(a.id), url: a.url }))
  const burns = stats?.burns ?? []

  return (
    <main style={{ position: 'relative', minHeight: '100vh', background: '#000', color: '#fff', overflowX: 'hidden' }}>
      <CosmicBg />
      <SiteNav />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* ── HERO ── */}
        <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '140px clamp(20px,5vw,64px) 80px' }}>
          <div style={{ position: 'relative', width: 'min(420px,72vw)', aspectRatio: '1', marginBottom: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div aria-hidden style={{ position: 'absolute', inset: '-18%', borderRadius: '50%', background: 'radial-gradient(circle,rgba(120,80,180,0.55) 0%,rgba(120,80,180,0.18) 42%,transparent 70%)', filter: 'blur(28px)', animation: 'breathe 7s ease-in-out infinite' }} />
            <div aria-hidden style={{ position: 'absolute', inset: '-4%', borderRadius: '50%', background: 'conic-gradient(from 0deg,transparent,rgba(184,160,216,0.22),transparent 40%,rgba(232,216,168,0.18),transparent 75%)', filter: 'blur(10px)', animation: 'spinAura 26s linear infinite' }} />
            <video src="/videos/starchild1.webm" poster="/poster1.png" autoPlay muted loop playsInline preload="auto" aria-label="the starchild, floating" style={{ position: 'relative', width: '90%', aspectRatio: '1', objectFit: 'contain', animation: 'drift 8s ease-in-out infinite', ...videoMask }} />
          </div>
          <div style={{ ...eyebrow, letterSpacing: '.32em', marginBottom: 22 }}>a quiet light, building in public</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/starchild-logo.png" alt="$STARCHILD" style={{ width: 'min(540px,84vw)', height: 'auto', marginBottom: 24, filter: 'drop-shadow(0 0 44px rgba(120,80,180,0.55))' }} />
          <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: '.34em', color: GOLD, marginBottom: 26 }}>$STARCHILD · ON BASE</div>
          <p style={{ maxWidth: 560, fontSize: 'clamp(16px,2vw,19px)', lineHeight: 1.75, color: 'rgba(255,255,255,0.66)', marginBottom: 40 }}>
            {"a private, open-source ai companion that helps you find your purpose. it runs on your machine, encrypted, free, no account. i didn't make a token — it grew up around the mission. this is how you back it, and help shape it."}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 30 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '11px 20px', borderRadius: 100, background: 'linear-gradient(160deg,rgba(232,216,168,0.1),rgba(12,10,20,0.5))', border: '1px solid rgba(232,216,168,0.22)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: GOLD, boxShadow: `0 0 8px ${GOLD}`, animation: 'twinkle 2.4s ease-in-out infinite' }} />
              <span style={{ fontFamily: MONO, fontSize: 15, color: GOLD }}>{price}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>per ${meta.symbol}</span>
            </div>
            {stats?.chartUrl && (
              <a href={stats.chartUrl} target="_blank" rel="noreferrer" className="navlink" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 100, border: '1px solid rgba(184,160,216,0.22)', fontSize: 13.5, color: 'rgba(255,255,255,0.72)' }}>view chart →</a>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1, borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(184,160,216,0.14)', background: 'rgba(184,160,216,0.12)', marginBottom: 30, maxWidth: 620 }}>
            {[['market cap', usd(stats?.marketCap ?? null)], ['liquidity', usd(stats?.liquidity ?? null)], ['24h volume', usd(stats?.volume24h ?? null)]].map(([label, val]) => (
              <div key={label} style={{ flex: 1, minWidth: 150, padding: '22px 28px', background: 'linear-gradient(160deg,rgba(184,160,216,0.05),rgba(12,10,20,0.55))', textAlign: 'center' }}>
                <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.18em', textTransform: 'uppercase', color: LAV, marginBottom: 10 }}>{label}</div>
                <div style={{ fontFamily: DISP, fontWeight: 300, fontSize: 26, color: GOLD }}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, padding: '7px 7px 7px 18px', borderRadius: 100, background: 'rgba(12,10,20,0.6)', border: '1px solid rgba(184,160,216,0.16)' }}>
            <span style={{ fontFamily: MONO, fontSize: 13, color: 'rgba(255,255,255,0.78)' }}>{SHORT_CA}</span>
            <span onClick={copyCA} style={{ cursor: 'pointer', fontFamily: MONO, fontSize: 12, padding: '7px 14px', borderRadius: 100, background: 'rgba(184,160,216,0.12)', color: copied ? GOLD : 'rgba(255,255,255,0.6)', transition: '.3s' }}>{copied ? 'copied ✓' : 'copy'}</span>
            <a href={LINKS.token} target="_blank" rel="noreferrer" className="link-hov" style={{ fontFamily: MONO, fontSize: 12, padding: '7px 14px', borderRadius: 100, color: 'rgba(255,255,255,0.6)' }}>basescan ↗</a>
          </div>
        </section>

        <StarDivider />

        {/* ── the companion ── */}
        <section id="starchild" className="reveal" style={{ maxWidth: 1100, margin: '0 auto', padding: '110px clamp(20px,5vw,64px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 'clamp(36px,5vw,72px)', alignItems: 'center' }}>
          <div>
            <div style={{ ...eyebrow, marginBottom: 22 }}>the starchild</div>
            <h2 style={{ ...heading, fontSize: 'clamp(34px,5vw,58px)', marginBottom: 26 }}>a companion that helps you find <span style={ital}>your purpose</span></h2>
            <p style={{ fontSize: 17, lineHeight: 1.75, color: 'rgba(255,255,255,0.66)', marginBottom: 18 }}>{"it asks the questions a good friend would, and listens. it runs entirely on your machine — end-to-end encrypted, no account, no cloud, free for everyone. open source, forever."}</p>
            <p style={{ fontSize: 17, lineHeight: 1.75, color: 'rgba(255,255,255,0.66)', marginBottom: 34 }}>{"the app never needs the token. the token is just how people who believe in this keep it alive."}</p>
            <a href="https://starchild.software" target="_blank" rel="noreferrer" className="btn-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '15px 30px', borderRadius: 100, background: 'linear-gradient(160deg,rgba(184,160,216,0.22),rgba(184,160,216,0.08))', border: '1px solid rgba(184,160,216,0.35)', fontSize: 15, color: '#fff' }}>open the companion →</a>
          </div>
          <div style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 24, overflow: 'hidden', border: '1px solid rgba(184,160,216,0.16)', animation: 'driftSlow 9s ease-in-out infinite' }}>
            <video src="/videos/starchild4.webm" autoPlay muted loop playsInline preload="auto" aria-label="the starchild" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 130%,rgba(120,80,180,0.4),transparent 55%)', mixBlendMode: 'screen' }} />
          </div>
        </section>

        {/* ── the diary ── */}
        <section id="posts" className="reveal" style={{ maxWidth: 1100, margin: '0 auto', padding: '90px clamp(20px,5vw,64px)' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <div style={{ ...eyebrow, marginBottom: 20 }}>a public diary</div>
            <h2 style={{ ...heading, fontSize: 'clamp(32px,5vw,56px)' }}>everything i&apos;ve said about <span style={ital}>this token</span></h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(330px,1fr))', gap: 18 }}>
            {posts.map((p) => (
              <a key={p.url} href={p.url} target="_blank" rel="noreferrer" className="card-glow lift" style={{ display: 'flex', gap: 22, alignItems: 'flex-start', padding: '28px 30px', borderRadius: 24, background: 'linear-gradient(160deg,rgba(184,160,216,0.07),rgba(12,10,20,0.5))', border: '1px solid rgba(184,160,216,0.14)' }}>
                <span style={{ fontFamily: DISP, fontWeight: 200, fontStyle: 'italic', fontSize: 30, color: GOLD, lineHeight: 1, minWidth: 48 }}>{p.n}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 17, lineHeight: 1.4, color: '#fff', marginBottom: 10 }}>{p.title}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: MONO, fontSize: 11.5, color: 'rgba(255,255,255,0.45)' }}>{p.date}<span style={{ color: LAV }}>read on x ↗</span></span>
                </span>
              </a>
            ))}
          </div>
        </section>

        {/* ── the burns ── */}
        <section id="burns" className="reveal" style={{ maxWidth: 920, margin: '0 auto', padding: '90px clamp(20px,5vw,64px)' }}>
          <div style={{ textAlign: 'center', marginBottom: 50 }}>
            <div style={{ ...eyebrow, marginBottom: 20 }}>on-chain, verifiable</div>
            <h2 style={{ ...heading, fontSize: 'clamp(32px,5vw,56px)', marginBottom: 28 }}>the <span style={ital}>burns</span></h2>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: 'rgba(255,255,255,0.6)', maxWidth: 520, margin: '0 auto 28px' }}>{"for months i burned every fee. each one is a real transaction — you never have to take my word for it."}</p>
            <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 14, padding: '18px 32px', borderRadius: 20, background: 'linear-gradient(160deg,rgba(232,216,168,0.08),rgba(12,10,20,0.5))', border: '1px solid rgba(232,216,168,0.2)' }}>
              <span style={{ fontFamily: DISP, fontWeight: 200, fontSize: 46, color: GOLD, lineHeight: 1 }}>{burn ? burn.pct.toFixed(2) + '%' : '—'}</span>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>of supply burned · {burn ? fmt(burn.burned, burn.decimals) : '—'} tokens</span>
            </div>
          </div>
          <div style={{ borderRadius: 24, overflow: 'hidden', border: '1px solid rgba(184,160,216,0.14)', background: 'linear-gradient(160deg,rgba(184,160,216,0.04),rgba(12,10,20,0.4))' }}>
            {burns.length === 0 ? (
              <p style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.4)', padding: '32px' }}>loading burns…</p>
            ) : burns.map((b) => (
              <a key={b.hash} href={basescanTx(b.hash)} target="_blank" rel="noreferrer" className="row-hov" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '20px clamp(20px,4vw,34px)', borderBottom: '1px solid rgba(184,160,216,0.08)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ color: GOLD, fontSize: 13, animation: 'pulseStar 6s ease-in-out infinite' }}>✦</span>
                  <span style={{ fontFamily: MONO, fontSize: 16, color: GOLD }}>{fmt(BigInt(b.amount), meta.decimals)}</span>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>$STARCHILD</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                  <span style={{ fontFamily: MONO, fontSize: 12.5, color: 'rgba(255,255,255,0.5)' }}>{b.timestamp?.slice(0, 10)}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: LAV }}>tx ↗</span>
                </span>
              </a>
            ))}
          </div>
        </section>

        {/* ── the incentive fund ── */}
        <section id="turn" className="reveal" style={{ maxWidth: 1000, margin: '0 auto', padding: '90px clamp(20px,5vw,64px)' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ ...eyebrow, marginBottom: 20 }}>the incentive fund</div>
            <h2 style={{ ...heading, fontSize: 'clamp(32px,5vw,56px)', marginBottom: 24 }}>the fees fund the people who <span style={ital}>make this better</span></h2>
            <p style={{ fontSize: 16, lineHeight: 1.75, color: 'rgba(255,255,255,0.6)', maxWidth: 580, margin: '0 auto' }}>{"a public fund that rewards the people who help shape starchild — feedback first. seeded with my own tokens, grown by buybacks from the fees, every payout on-chain and watchable."}</p>
          </div>

          <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto 44px', borderRadius: 24, overflow: 'hidden', border: '1px solid rgba(184,160,216,0.18)', boxShadow: '0 30px 90px -34px rgba(120,80,180,0.55)' }}>
            <video src="/incentive-fund.mp4" poster="/incentive-fund-poster.jpg" autoPlay muted loop playsInline preload="auto" aria-label="the incentive fund" style={{ display: 'block', width: '100%', height: 'auto' }} />
          </div>

          <div style={{ maxWidth: 560, margin: '0 auto 34px' }}>
            <WalletCard accent="lav" label="the incentive fund" ens={INCENTIVE_FUND_ENS} bal={fundBal} decimals={meta.decimals} usdStr={usdOf(fundBal, meta.decimals, stats?.price)} links={[['the safe ↗', LINKS.fundSafe], ['basescan ↗', LINKS.fund]]} />
          </div>

          {/* current fee structure — subject to change */}
          <div style={{ maxWidth: 560, margin: '0 auto', borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(184,160,216,0.16)', background: 'linear-gradient(160deg,rgba(184,160,216,0.05),rgba(12,10,20,0.45))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 22px', borderBottom: '1px solid rgba(184,160,216,0.1)' }}>
              <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: LAV }}>current fee structure</span>
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: 'rgba(255,255,255,0.4)' }}>subject to change</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '18px 22px', borderBottom: '1px solid rgba(184,160,216,0.08)', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: MONO, fontSize: 14, color: '#fff' }}>ETH <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>· from trading fees</span></span>
              <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <FeePill color={LILAC}>70% funding</FeePill>
                <FeePill color={LILAC}>30% incentive fund</FeePill>
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '18px 22px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: MONO, fontSize: 14, color: '#fff' }}>$STARCHILD <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>· received on sells</span></span>
              <FeePill color={GOLD}>burned</FeePill>
            </div>
          </div>

          <div style={{ marginTop: 34, display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 12, alignItems: 'center', fontSize: 13.5, color: 'rgba(255,255,255,0.5)' }}>
            <span>and i hold openly, no hidden wallets:</span>
            <a href={LINKS.holdings} target="_blank" rel="noreferrer" className="link-hov" style={{ fontFamily: MONO, fontSize: 13, color: GOLD }}>{FOUNDER_HOLDINGS_ENS} ↗</a>
            <span style={{ fontFamily: MONO, fontSize: 12.5, color: LILAC }}>◇ {holdBal != null ? fmt(holdBal, meta.decimals) : '—'} $STARCHILD</span>
          </div>
        </section>

        {/* ── into the forum ── */}
        <section className="reveal" style={{ maxWidth: 980, margin: '0 auto', padding: '90px clamp(20px,5vw,64px) 40px' }}>
          <div style={{ position: 'relative', borderRadius: 32, overflow: 'hidden', border: '1px solid rgba(184,160,216,0.2)', background: 'linear-gradient(160deg,rgba(184,160,216,0.1),rgba(12,10,20,0.6))', padding: 'clamp(40px,6vw,72px)', textAlign: 'center' }}>
            <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 0%,rgba(120,80,180,0.32),transparent 60%)' }} />
            <div style={{ position: 'relative', width: 130, height: 130, margin: '0 auto 32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div aria-hidden style={{ position: 'absolute', inset: '-30%', borderRadius: '50%', background: 'radial-gradient(circle,rgba(120,80,180,0.5),transparent 70%)', filter: 'blur(20px)', animation: 'breathe 7s ease-in-out infinite' }} />
              <video src="/videos/starchild3.webm" poster="/poster3.png" autoPlay muted loop playsInline preload="auto" aria-label="the starchild" style={{ position: 'relative', width: 128, height: 128, objectFit: 'contain', animation: 'drift 8s ease-in-out infinite', ...videoMask }} />
            </div>
            <h2 style={{ position: 'relative', ...heading, fontSize: 'clamp(30px,5vw,52px)', lineHeight: 1.1, marginBottom: 22 }}>i think out loud.<br /><span style={ital}>you weigh in.</span></h2>
            <p style={{ position: 'relative', fontSize: 16, lineHeight: 1.75, color: 'rgba(255,255,255,0.62)', maxWidth: 480, margin: '0 auto 36px' }}>{"a forum, not a DAO — too early for that. i post what i'm working through; you reply. every voice shows the $STARCHILD it holds."}</p>
            <Link href="/forum" className="btn-cta" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 10, padding: '16px 34px', borderRadius: 100, background: 'linear-gradient(160deg,rgba(184,160,216,0.3),rgba(184,160,216,0.12))', border: '1px solid rgba(184,160,216,0.45)', fontSize: 15.5, color: '#fff' }}>join the forum →</Link>
          </div>
        </section>

        {/* ── footer ── */}
        <footer style={{ maxWidth: 1100, margin: '40px auto 0', padding: '60px clamp(20px,5vw,64px) 80px', borderTop: '1px solid rgba(184,160,216,0.08)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: GOLD, fontSize: 16, animation: 'pulseStar 5s ease-in-out infinite' }}>✦</span>
              <span style={{ fontFamily: DISP, fontWeight: 300, fontSize: 16 }}>$STARCHILD</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 22, fontSize: 13.5, color: 'rgba(255,255,255,0.55)' }}>
              <a href={LINKS.x} target="_blank" rel="noreferrer" className="link-hov">@Starchild_app ↗</a>
              <a href={LINKS.xFounder} target="_blank" rel="noreferrer" className="link-hov">@KilianSolutions ↗</a>
            </div>
          </div>
          <div style={{ marginTop: 28, fontFamily: MONO, fontSize: 11.5, color: 'rgba(255,255,255,0.32)', wordBreak: 'break-all' }}>contract · {STARCHILD_TOKEN}</div>
        </footer>
      </div>
    </main>
  )
}

function StarDivider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '0 clamp(20px,5vw,64px)' }}>
      <div style={{ height: 1, flex: 1, maxWidth: 200, background: 'linear-gradient(90deg,transparent,rgba(184,160,216,0.3))' }} />
      <span style={{ color: GOLD, fontSize: 18, animation: 'pulseStar 5s ease-in-out infinite' }}>✦</span>
      <div style={{ height: 1, flex: 1, maxWidth: 200, background: 'linear-gradient(90deg,rgba(184,160,216,0.3),transparent)' }} />
    </div>
  )
}

function FeePill({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ fontFamily: MONO, fontSize: 13, padding: '7px 14px', borderRadius: 100, border: '1px solid rgba(184,160,216,0.18)', color }}>{children}</span>
}

function WalletCard({ accent, label, ens, bal, decimals, usdStr, links }: {
  accent: 'lav' | 'gold'; label: string; ens: string; bal: bigint | null; decimals: number; usdStr: string; links: [string, string][]
}) {
  const isLav = accent === 'lav'
  return (
    <div className={isLav ? 'card-glow' : 'gold-glow'} style={{ position: 'relative', padding: '34px 32px', borderRadius: 24, overflow: 'hidden', transition: '.35s', background: isLav ? 'linear-gradient(160deg,rgba(184,160,216,0.08),rgba(12,10,20,0.55))' : 'linear-gradient(160deg,rgba(232,216,168,0.07),rgba(12,10,20,0.55))', border: `1px solid ${isLav ? 'rgba(184,160,216,0.18)' : 'rgba(232,216,168,0.18)'}` }}>
      <div aria-hidden style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: isLav ? 'radial-gradient(circle,rgba(120,80,180,0.4),transparent 70%)' : 'radial-gradient(circle,rgba(180,150,90,0.3),transparent 70%)', filter: 'blur(20px)', animation: 'breatheSlow 8s ease-in-out infinite' }} />
      <div style={{ position: 'relative' }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: isLav ? LAV : GOLD, marginBottom: 16 }}>{label}</div>
        <div style={{ fontFamily: MONO, fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 26, wordBreak: 'break-all' }}>{ens}</div>
        <div style={{ fontFamily: DISP, fontWeight: 200, fontSize: 38, color: GOLD, lineHeight: 1 }}>{bal != null ? fmt(bal, decimals) : '—'}</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 8, marginBottom: 26 }}>$STARCHILD · ≈ {usdStr}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {links.map(([text, href]) => (
            <a key={text} href={href} target="_blank" rel="noreferrer" className="navlink" style={{ fontFamily: MONO, fontSize: 12, padding: '9px 16px', borderRadius: 100, border: `1px solid ${isLav ? 'rgba(184,160,216,0.3)' : 'rgba(232,216,168,0.3)'}`, color: 'rgba(255,255,255,0.78)' }}>{text}</a>
          ))}
        </div>
      </div>
    </div>
  )
}
