/**
 * AiDisclosure — the "you're talking to an AI" notice.
 *
 * Shared by both shells. WHEN it shows is decided in core (`safety.rs`
 * `ai_disclosure_due`: at the start of every session and at least every three
 * hours, per companion-chatbot laws) and surfaced through `platform.aiDisclosure()`;
 * this component only renders the text it is given.
 */

export default function AiDisclosure({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <div
      role="note"
      aria-label="AI disclosure"
      className="flex items-start gap-3 rounded-[18px] px-4 py-2.5 text-[12.5px] leading-relaxed"
      style={{ background: 'rgba(168,200,232,.08)', border: '1px solid rgba(168,200,232,.3)', color: 'var(--text-secondary)' }}
    >
      <span aria-hidden className="shrink-0" style={{ color: 'var(--accent-sky)' }}>ⓘ</span>
      <span className="flex-1">{text}</span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss AI disclosure"
        className="shrink-0 font-bold hover:opacity-70"
        style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}
      >
        ok
      </button>
    </div>
  )
}
