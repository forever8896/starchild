/**
 * CrisisCard — real human help lines, shown when the human's words signal
 * crisis or self-harm.
 *
 * Shared by both shells. The detection and the list of resources come from
 * core (`safety.rs`, via the platform's `crisis-state` event) — this component
 * only renders them. It is deliberately plain: no game styling, no creature, no
 * quest language. Dismissible, because the person is in charge; it returns if
 * the crisis state is raised again.
 */

export interface CrisisResource {
  name: string
  detail: string
  contact: string
  href: string
}

export default function CrisisCard({
  resources,
  onDismiss,
}: {
  resources: CrisisResource[]
  onDismiss: () => void
}) {
  if (resources.length === 0) return null
  return (
    <section
      role="region"
      aria-label="Crisis support"
      className="rounded-[22px] px-5 py-4"
      style={{
        background: 'rgba(232,216,168,.08)',
        border: '1px solid rgba(232,216,168,.35)',
        color: 'var(--text-primary)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="m-0 text-[15px] font-extrabold">You don't have to hold this alone.</p>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            I'm an AI, not a crisis service. These are real people, free and confidential, ready to talk
            right now. If you're in immediate danger, call your local emergency number.
          </p>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Hide crisis support"
          className="shrink-0 text-[18px] leading-none font-bold px-1 hover:opacity-70"
          style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}
        >
          ×
        </button>
      </div>
      <ul className="mt-3 grid gap-2 p-0 m-0" style={{ listStyle: 'none' }}>
        {resources.map((r) => (
          <li key={r.name}>
            <a
              href={r.href}
              target={r.href.startsWith('http') ? '_blank' : undefined}
              rel={r.href.startsWith('http') ? 'noopener noreferrer' : undefined}
              className="flex items-center justify-between gap-3 rounded-[16px] px-4 py-2.5 no-underline"
              style={{ background: 'rgba(28,21,38,.55)', border: '1px solid rgba(74,63,96,.7)', color: 'inherit' }}
            >
              <span className="min-w-0">
                <span className="block text-[14px] font-bold">{r.name}</span>
                <span className="block text-[12px]" style={{ color: 'var(--text-muted)' }}>{r.detail}</span>
              </span>
              <span className="shrink-0 text-[13px] font-extrabold" style={{ color: 'var(--accent-gold)' }}>{r.contact}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
