/**
 * QuestSuggestions.tsx — Starchild-generated quest suggestions
 *
 * Fetches personalized quest ideas from the AI based on the knowing profile,
 * displays them with rationale, and lets the user accept them with one click.
 */

import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

// ─── Types ──────────────────────────────────────────────────────────────────

interface QuestSuggestion {
  title: string
  description: string
  category: string
  quest_type: string
  xp_reward: number
  rationale: string
}

const CATEGORY_ACCENT_COLORS: Record<string, string> = {
  body: 'var(--accent-mint)',
  purpose: 'var(--accent-sky)',
  mind: 'var(--accent-gold)',
  heart: 'var(--accent-rose)',
  spirit: 'var(--accent-lavender)',
}

// ─── Suggestion Card ────────────────────────────────────────────────────────

function SuggestionCard({
  suggestion,
  onAccept,
  accepting,
}: {
  suggestion: QuestSuggestion
  onAccept: () => void
  accepting: boolean
}) {
  const accentColor = CATEGORY_ACCENT_COLORS[suggestion.category] ?? 'var(--text-muted)'

  return (
    <div
      className="p-3.5 rounded-2xl transition-all hover:scale-[1.01]"
      style={{ backgroundColor: 'var(--bg-card)', border: '1.5px solid var(--outline)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{suggestion.title}</span>
            <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: accentColor }}>
              {suggestion.category}
            </span>
          </div>
          <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>{suggestion.description}</p>
          <p className="text-[11px] italic leading-relaxed" style={{ color: 'var(--accent-lavender)', opacity: 0.8 }}>
            ✦ {suggestion.rationale}
          </p>
        </div>
        <button
          onClick={onAccept}
          disabled={accepting}
          className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-xl transition-all disabled:opacity-40 press-scale"
          style={{ color: 'var(--accent-lavender)', backgroundColor: 'var(--glow-lavender)', border: '1.5px solid var(--outline)' }}
        >
          {accepting ? '...' : 'Accept'}
        </button>
      </div>
      <div className="flex items-center gap-3 mt-2">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{suggestion.quest_type}</span>
        <span className="text-[10px]" style={{ color: 'var(--accent-lavender)' }}>+{suggestion.xp_reward} XP</span>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function QuestSuggestions({ onQuestCreated }: { onQuestCreated: () => void }) {
  const [suggestions, setSuggestions] = useState<QuestSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [accepting, setAccepting] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)

  const loadSuggestions = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await invoke<QuestSuggestion[]>('suggest_quests')
      setSuggestions(result)
      setHasLoaded(true)
    } catch (err) {
      console.error('Failed to get suggestions:', err)
      setError('Starchild needs to know you better first. Keep chatting!')
      setHasLoaded(true)
    } finally {
      setLoading(false)
    }
  }

  const acceptSuggestion = async (index: number) => {
    const suggestion = suggestions[index]
    if (!suggestion) return

    setAccepting(index)
    try {
      await invoke('create_quest', {
        request: {
          title: suggestion.title,
          description: suggestion.description,
          quest_type: suggestion.quest_type,
          category: suggestion.category,
          xp_reward: suggestion.xp_reward,
          due_at: null,
        },
      })
      // Remove accepted suggestion from list
      setSuggestions((prev) => prev.filter((_, i) => i !== index))
      onQuestCreated()
    } catch (err) {
      console.error('Failed to create quest:', err)
    } finally {
      setAccepting(null)
    }
  }

  // Not loaded yet — show the invoke button
  if (!hasLoaded && !loading) {
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <button
          onClick={loadSuggestions}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all press-scale"
          style={{ color: 'var(--accent-lavender)', backgroundColor: 'var(--glow-lavender)', border: '1.5px solid var(--outline)' }}
        >
          <span className="text-base">✦</span>
          Ask Starchild for quest ideas
        </button>
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Personalized suggestions based on what Starchild knows about you
        </p>
      </div>
    )
  }

  // Loading
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-2 py-6">
        <div className="w-5 h-5 rounded-full animate-spin" style={{ border: '2px solid var(--outline)', borderTopColor: 'var(--accent-lavender)' }} />
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Starchild is thinking about your journey...</p>
      </div>
    )
  }

  // Error
  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{error}</p>
        <button
          onClick={loadSuggestions}
          className="text-xs hover:opacity-70 transition-opacity"
          style={{ color: 'var(--accent-lavender)' }}
        >
          Try again
        </button>
      </div>
    )
  }

  // No suggestions left (all accepted)
  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>All suggestions accepted ✦</p>
        <button
          onClick={loadSuggestions}
          className="text-xs hover:opacity-70 transition-opacity"
          style={{ color: 'var(--accent-lavender)' }}
        >
          Ask for more
        </button>
      </div>
    )
  }

  // Show suggestions
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-lavender)' }}>
          ✦ Starchild Suggests
        </h3>
        <button
          onClick={loadSuggestions}
          className="text-[10px] hover:opacity-70 transition-opacity"
          style={{ color: 'var(--text-muted)' }}
        >
          Refresh
        </button>
      </div>
      {suggestions.map((s, i) => (
        <SuggestionCard
          key={`${s.title}-${i}`}
          suggestion={s}
          onAccept={() => acceptSuggestion(i)}
          accepting={accepting === i}
        />
      ))}
    </div>
  )
}
