'use client'

/**
 * cosmic.tsx — shared chrome for the redesigned token site (from Starchild.dc).
 * The fixed starfield + cosmic backdrop, the top nav, and the design's type +
 * colour constants. Both the landing and the forum render over `<CosmicBg/>`.
 */

import Link from 'next/link'

export const DISP = "'Albert Sans', sans-serif"
export const MONO = "'JetBrains Mono', monospace"
export const LAV = '#b8a0d8'
export const GOLD = '#e8d8a8'
export const LILAC = '#cbb8e6'
export const GREEN = '#9ed8a8'

// Deterministic starfield — a seeded PRNG so the server and client render the
// exact same field (no hydration mismatch from Math.random).
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const STAR_COLORS = ['#ffffff', '#cbb8e6', '#e8d8a8', '#b8a0d8']
const STARS = (() => {
  const r = mulberry32(20260630)
  return Array.from({ length: 70 }, () => ({
    top: (r() * 100).toFixed(2) + '%',
    left: (r() * 100).toFixed(2) + '%',
    size: (r() * 2 + 1).toFixed(1) + 'px',
    color: STAR_COLORS[Math.floor(r() * STAR_COLORS.length)],
    dur: (r() * 4 + 3).toFixed(1) + 's',
    delay: (r() * 5).toFixed(1) + 's',
  }))
})()

export function CosmicBg() {
  return (
    <>
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: 'radial-gradient(120% 80% at 50% -10%,#13101f 0%,#06050a 45%,#000 100%)' }} />
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: "url('/cosmic_bg.png') center/cover", opacity: 0.1, mixBlendMode: 'screen' }} />
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {STARS.map((s, i) => (
          <div key={i} style={{ position: 'absolute', top: s.top, left: s.left, width: s.size, height: s.size, borderRadius: '50%', background: s.color, boxShadow: `0 0 6px ${s.color}`, opacity: 0.4, animation: `twinkle ${s.dur} ease-in-out infinite`, animationDelay: s.delay }} />
        ))}
      </div>
    </>
  )
}

export function SiteNav() {
  const linkStyle: React.CSSProperties = { fontSize: 13.5, color: 'rgba(255,255,255,0.62)' }
  return (
    <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px clamp(20px,5vw,64px)', backdropFilter: 'blur(14px)', background: 'linear-gradient(180deg,rgba(6,5,10,0.85),rgba(6,5,10,0.2))', borderBottom: '1px solid rgba(184,160,216,0.08)' }}>
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/starchild-logo.png" alt="$STARCHILD" style={{ height: 46, width: 'auto', display: 'block', filter: 'drop-shadow(0 0 16px rgba(120,80,180,0.5))' }} />
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(14px,2.4vw,30px)' }}>
        <Link href="/#posts" className="navlink" style={linkStyle}>the diary</Link>
        <Link href="/#burns" className="navlink" style={linkStyle}>the burns</Link>
        <Link href="/#turn" className="navlink" style={linkStyle}>the turn</Link>
        <Link href="/forum" className="dao-pill" style={{ padding: '8px 16px', borderRadius: 100, border: '1px solid rgba(184,160,216,0.28)', color: LAV }}>the forum →</Link>
      </div>
    </nav>
  )
}
