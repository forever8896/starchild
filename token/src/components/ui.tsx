'use client'

/* Shared visual primitives for the token site — kept in sync across pages. */

export const LAV = '#b8a0d8'
export const GOLD = '#e8d8a8'

export const card: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(26,21,37,0.6), rgba(12,10,20,0.6))',
  border: '1px solid rgba(184,160,216,0.16)', borderRadius: 24, padding: '26px 28px',
}
export const inputStyle: React.CSSProperties = {
  flex: 1, borderRadius: 12, padding: '11px 14px', fontSize: 14, color: '#fff', width: '100%',
  background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(184,160,216,0.22)', outline: 'none',
}
export const eyebrow: React.CSSProperties = {
  textAlign: 'center', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase',
  color: 'rgba(184,160,216,0.65)', marginBottom: 14, fontWeight: 600,
}
export const h2: React.CSSProperties = {
  textAlign: 'center', fontSize: 'clamp(1.7rem,3.6vw,2.5rem)', fontWeight: 300, fontStyle: 'italic',
  lineHeight: 1.2, color: '#fff', marginBottom: 18,
}
export const lead: React.CSSProperties = {
  textAlign: 'center', maxWidth: 540, margin: '0 auto', color: 'rgba(255,255,255,0.6)',
  lineHeight: 1.75, fontSize: '1rem',
}
export const link = { color: LAV, textDecoration: 'underline', textUnderlineOffset: 3 } as const

/** inline emphasis — white, upright, inside otherwise-muted text */
export const i = (s: React.ReactNode) => <em style={{ color: '#fff', fontStyle: 'normal' }}>{s}</em>

export function Star({ margin = '72px 0' }: { margin?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin }}>
      <span className="star-pulse" style={{ color: GOLD, fontSize: 22, filter: 'drop-shadow(0 0 14px rgba(232,216,168,0.6))' }}>✦</span>
    </div>
  )
}

export function Btn({ children, onClick, disabled, kind = 'solid' }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; kind?: 'solid' | 'ghost' }) {
  return (
    <button onClick={onClick} disabled={disabled} className="btn-shine"
      style={{
        padding: '11px 18px', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap', transition: 'opacity .2s', opacity: disabled ? 0.4 : 1,
        border: kind === 'ghost' ? '1px solid rgba(184,160,216,0.35)' : 'none',
        background: kind === 'ghost' ? 'transparent' : `linear-gradient(90deg, ${LAV}, ${GOLD})`,
        color: kind === 'ghost' ? LAV : '#1a1525',
      }}>{children}</button>
  )
}

/** link styled as a primary button (for cross-page CTAs) */
export function LinkBtn({ href, children, external }: { href: string; children: React.ReactNode; external?: boolean }) {
  return (
    <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      style={{
        display: 'inline-block', padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 600,
        textDecoration: 'none', background: `linear-gradient(90deg, ${LAV}, ${GOLD})`, color: '#1a1525',
      }}>{children}</a>
  )
}

export function usd(n: number | null): string {
  return n == null ? '—' : '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}
export function priceFmt(p: string | null): string {
  const n = Number(p)
  if (!p || !isFinite(n) || n === 0) return '—'
  return '$' + n.toLocaleString(undefined, { maximumSignificantDigits: 3, maximumFractionDigits: 12 })
}

export function Stat({ label, value, href }: { label: string; value: string; href?: string }) {
  const inner = (
    <>
      <div style={{ fontSize: 'clamp(1.1rem,2.4vw,1.45rem)', fontWeight: 700, color: GOLD }}>{value}</div>
      <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginTop: 5 }}>{label}</div>
    </>
  )
  return href
    ? <a href={href} target="_blank" rel="noreferrer" style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}>{inner}</a>
    : <div style={{ textAlign: 'center' }}>{inner}</div>
}
