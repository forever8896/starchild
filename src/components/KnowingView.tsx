/**
 * KnowingView — "what Starchild knows about you": read it, correct it, forget it.
 *
 * Shared by both shells (reached through `platform.getKnowingFacts` /
 * `updateKnowingFact` / `deleteKnowingFact`). The profile is the companion's
 * understanding of you; you should be able to see all of it and have the last
 * word on it. Nothing here leaves the device.
 */
import { useCallback, useEffect, useState } from 'react'
import { usePlatform } from '../platform/usePlatform'
import type { KnowingFact } from '../platform'

/** Display order + labels for the seven knowing dimensions (core `KnowingCategory`). */
const DIMENSIONS: { tag: string; label: string }[] = [
  { tag: 'core_values', label: 'what you value' },
  { tag: 'desires', label: 'what you long for' },
  { tag: 'fears', label: 'what scares you' },
  { tag: 'thinking_patterns', label: 'how you think' },
  { tag: 'relationships', label: 'your people' },
  { tag: 'life_situation', label: 'your life right now' },
  { tag: 'growth_edges', label: 'where you’re growing' },
]

export default function KnowingView() {
  const platform = usePlatform()
  const [facts, setFacts] = useState<KnowingFact[] | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setFacts(await platform.getKnowingFacts())
    } catch {
      setError('couldn’t read what i know right now.')
      setFacts([])
    }
  }, [platform])

  useEffect(() => { void load() }, [load])

  const save = async (id: string) => {
    try {
      await platform.updateKnowingFact(id, draft)
      setEditing(null)
      await load()
    } catch {
      setError('that change didn’t stick — try again?')
    }
  }

  const forget = async (id: string) => {
    try {
      await platform.deleteKnowingFact(id)
      await load()
    } catch {
      setError('i couldn’t forget that — try again?')
    }
  }

  if (facts === null) {
    return <p className="text-[13px] italic" style={{ color: 'var(--text-muted)' }}>remembering…</p>
  }

  if (facts.length === 0) {
    return (
      <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        nothing yet. as we talk, the things you share about yourself gather here — and you can
        correct or remove any of them.
      </p>
    )
  }

  const known = new Set(DIMENSIONS.map((d) => d.tag))
  const groups = [
    ...DIMENSIONS.map((d) => ({ ...d, items: facts.filter((f) => f.category === d.tag) })),
    { tag: 'other', label: 'other things', items: facts.filter((f) => !known.has(f.category)) },
  ].filter((g) => g.items.length > 0)

  return (
    <div className="grid gap-4" aria-label="What Starchild knows about you">
      <p className="m-0 text-[12.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        {facts.length} thing{facts.length === 1 ? '' : 's'} i’ve understood about you. if any of it is wrong, change
        it — your words win. forgetting is permanent.
      </p>
      {groups.map((g) => (
        <section key={g.tag}>
          <h3 className="m-0 mb-1.5 text-[12px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--accent-lavender)' }}>
            {g.label}
          </h3>
          <ul className="m-0 p-0 grid gap-1.5" style={{ listStyle: 'none' }}>
            {g.items.map((f) => (
              <li
                key={f.id}
                className="flex items-start gap-2 rounded-[14px] px-3 py-2"
                style={{ background: 'rgba(28,21,38,.5)', border: '1px solid rgba(74,63,96,.6)' }}
              >
                {editing === f.id ? (
                  <>
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={2}
                      autoFocus
                      aria-label="Correct this"
                      className="flex-1 resize-none bg-transparent outline-none text-[13px]"
                      style={{ color: 'var(--text-primary)' }}
                    />
                    <button onClick={() => void save(f.id)} className="text-[12px] font-bold" style={{ color: 'var(--accent-mint)', background: 'none', border: 'none' }}>
                      save
                    </button>
                    <button onClick={() => setEditing(null)} className="text-[12px]" style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}>
                      cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-[13px] leading-snug" style={{ color: 'var(--text-secondary)' }}>{f.fact}</span>
                    <button
                      onClick={() => { setEditing(f.id); setDraft(f.fact) }}
                      aria-label={`Correct: ${f.fact}`}
                      className="text-[12px] font-bold shrink-0"
                      style={{ color: 'var(--accent-sky)', background: 'none', border: 'none' }}
                    >
                      correct
                    </button>
                    <button
                      onClick={() => void forget(f.id)}
                      aria-label={`Forget: ${f.fact}`}
                      className="text-[12px] font-bold shrink-0"
                      style={{ color: 'var(--accent-rose)', background: 'none', border: 'none' }}
                    >
                      forget
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {error && <p className="m-0 text-[12px]" role="alert" style={{ color: 'var(--accent-rose)' }}>{error}</p>}
    </div>
  )
}
