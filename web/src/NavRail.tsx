/**
 * NavRail.tsx — the persistent navigation for the redesigned web shell.
 *
 * From Starchild.dc: a slim vertical rail on wide screens (logo up top, the
 * destinations stacked, "you" pinned to the foot) that becomes a bottom bar on
 * narrow ones. It replaces the old floating top-right icon cluster. Only real
 * destinations are wired — Talk (chat), Tree (the vision tree), and You
 * (settings) — plus Feedback (shown only once unlocked) and Your Data, which
 * open as overlays.
 */

import starchildLogo from '../../src/assets/starchild-logo.png'

type NavKey = 'chat' | 'tree' | 'feedback' | 'data' | 'settings'

function RailButton({
  active, onClick, title, glyph, label, narrow,
}: {
  active?: boolean
  onClick: () => void
  title: string
  glyph: React.ReactNode
  label: string
  narrow: boolean
}) {
  const base: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
    width: narrow ? 58 : 64, padding: '10px 0', borderRadius: 20, cursor: 'pointer',
    transition: 'all .18s ease', border: '1px solid transparent', background: 'transparent',
    color: 'var(--text-muted)',
  }
  const on: React.CSSProperties = active ? {
    borderColor: 'rgba(184,160,216,.55)',
    color: 'var(--text-primary)',
    background: 'linear-gradient(150deg,rgba(184,160,216,.28),rgba(184,160,216,.12))',
    boxShadow: '0 8px 18px -8px rgba(184,160,216,.55), inset 0 2px 2px rgba(255,255,255,.1)',
  } : {}
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-current={active ? 'page' : undefined}
      style={{ ...base, ...on }}
      className="nav-rail-btn"
    >
      <span className="text-[21px] leading-none">{glyph}</span>
      <span className="text-[10px] font-bold tracking-[.04em]">{label}</span>
    </button>
  )
}

export default function NavRail({
  active, narrow, feedbackUnlocked,
  onNav, onOpenFeedback, onOpenData,
}: {
  active: NavKey
  narrow: boolean
  feedbackUnlocked: boolean
  onNav: (view: 'chat' | 'tree' | 'settings') => void
  onOpenFeedback: () => void
  onOpenData: () => void
}) {
  const wrap: React.CSSProperties = narrow
    ? {
        flex: '0 0 auto', width: '100%', display: 'flex', flexDirection: 'row',
        alignItems: 'center', justifyContent: 'space-around', gap: 2, padding: '8px 10px',
        background: 'linear-gradient(0deg,rgba(34,29,46,.92),rgba(20,17,30,.82))',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(74,63,96,.6)', zIndex: 30,
      }
    : {
        flex: '0 0 auto', width: 96, display: 'flex', flexDirection: 'column',
        alignItems: 'center', padding: '22px 0 20px', gap: 6,
        background: 'linear-gradient(180deg,rgba(34,29,46,.72),rgba(20,17,30,.72))',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderRight: '1px solid rgba(74,63,96,.6)', zIndex: 30,
      }

  return (
    <nav style={wrap} aria-label="Primary">
      {!narrow && (
        <img
          src={starchildLogo}
          alt="Starchild"
          className="object-contain mb-[18px]"
          style={{ width: 52, height: 52, filter: 'drop-shadow(0 4px 12px rgba(184,160,216,.5))' }}
          draggable={false}
        />
      )}

      <RailButton narrow={narrow} active={active === 'chat'} onClick={() => onNav('chat')} title="Talk" label="talk" glyph="✦" />
      <RailButton narrow={narrow} active={active === 'tree'} onClick={() => onNav('tree')} title="Vision Tree" label="tree" glyph="✴" />

      {feedbackUnlocked && (
        <RailButton
          narrow={narrow}
          active={active === 'feedback'}
          onClick={onOpenFeedback}
          title="Share feedback"
          label="note"
          glyph={<span style={{ color: 'var(--accent-rose)' }}>♡</span>}
        />
      )}

      {!narrow && <div style={{ flex: 1 }} />}

      <RailButton narrow={narrow} active={active === 'data'} onClick={onOpenData} title="Your Data" label="data" glyph="❍" />
      <RailButton narrow={narrow} active={active === 'settings'} onClick={() => onNav('settings')} title="Settings" label="you" glyph="◐" />
    </nav>
  )
}
