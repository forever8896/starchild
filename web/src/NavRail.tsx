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

type NavKey = 'chat' | 'tree' | 'feedback' | 'settings'

// ─── Nav icons ────────────────────────────────────────────────────────────────
// A single, consistent line-icon language (stroke, round joins) — replacing the
// mismatched Unicode glyphs (✦ ✴ ◐) whose weights and baselines never agreed.
// The creature's ✦ sparkle stays a *decorative* motif elsewhere; navigation gets
// legible, purpose-built marks.

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function TalkIcon() {
  // A speech bubble — the conversation itself.
  return (
    <svg viewBox="0 0 24 24" width={23} height={23} {...stroke} aria-hidden="true">
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  )
}

function TreeIcon() {
  // A branching vision tree — one root, two boughs.
  return (
    <svg viewBox="0 0 24 24" width={23} height={23} {...stroke} aria-hidden="true">
      <circle cx="12" cy="5" r="2.5" />
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M12 7.5v4.5" />
      <path d="M6 16.5v-3a1.5 1.5 0 0 1 1.5-1.5h9a1.5 1.5 0 0 1 1.5 1.5v3" />
    </svg>
  )
}

function NoteIcon() {
  // A solid heart — the one warm, coloured mark (feedback, once unlocked).
  return (
    <svg viewBox="0 0 24 24" width={21} height={21} fill="currentColor" aria-hidden="true">
      <path d="M12 21.35c-.3 0-.6-.1-.83-.32l-8.1-7.78a5.5 5.5 0 0 1 7.78-7.78L12 6.6l1.15-1.13a5.5 5.5 0 0 1 7.78 7.78l-8.1 7.78c-.23.22-.53.32-.83.32Z" />
    </svg>
  )
}

function YouIcon() {
  // A person — "you & this space".
  return (
    <svg viewBox="0 0 24 24" width={23} height={23} {...stroke} aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </svg>
  )
}

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
      <span className="flex items-center justify-center" style={{ height: 24 }}>{glyph}</span>
      <span className="text-[10px] font-bold tracking-[.04em]">{label}</span>
    </button>
  )
}

export default function NavRail({
  active, narrow, feedbackUnlocked,
  onNav, onOpenFeedback,
}: {
  active: NavKey
  narrow: boolean
  feedbackUnlocked: boolean
  onNav: (view: 'chat' | 'tree' | 'settings') => void
  onOpenFeedback: () => void
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
          className="object-contain mb-[16px]"
          style={{ width: 76, height: 76, filter: 'drop-shadow(0 6px 18px rgba(184,160,216,.55))' }}
          draggable={false}
        />
      )}

      <RailButton narrow={narrow} active={active === 'chat'} onClick={() => onNav('chat')} title="Talk" label="talk" glyph={<TalkIcon />} />
      <RailButton narrow={narrow} active={active === 'tree'} onClick={() => onNav('tree')} title="Vision Tree" label="tree" glyph={<TreeIcon />} />

      {feedbackUnlocked && (
        <RailButton
          narrow={narrow}
          active={active === 'feedback'}
          onClick={onOpenFeedback}
          title="Share feedback"
          label="note"
          glyph={<span style={{ color: 'var(--accent-rose)' }}><NoteIcon /></span>}
        />
      )}

      {!narrow && <div style={{ flex: 1 }} />}

      <RailButton narrow={narrow} active={active === 'settings'} onClick={() => onNav('settings')} title="You & this space" label="you" glyph={<YouIcon />} />
    </nav>
  )
}
