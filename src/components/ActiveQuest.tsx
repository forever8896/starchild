/**
 * ActiveQuest.tsx — Floating quest card in the chat view
 *
 * Shows the current active quest as a glowing card pinned to the top of chat.
 * User can expand it and mark it complete, which triggers a celebration
 * message from the Starchild.
 */

import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore, type Quest } from '../store'

export default function ActiveQuest({
  onComplete,
}: {
  onComplete: (questTitle: string) => void
}) {
  const [quests, setQuests] = useState<Quest[]>([])
  const [expanded, setExpanded] = useState(false)
  const [completing, setCompleting] = useState(false)
  const setStarchildState = useAppStore((s) => s.setStarchildState)

  // Load active quests
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const result = await invoke<Quest[]>('get_quests', { status: 'active' })
        if (!cancelled) setQuests(result)
      } catch {
        // ignore
      }
    }
    load()
    // Reload every 30s in case quests change
    const interval = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  const handleComplete = useCallback(async (quest: Quest) => {
    setCompleting(true)
    try {
      const result = await invoke<{
        quest: Quest
        starchild_state: { hunger: number; mood: string; energy: number; bond: number; xp: number; level: number }
        levelled_up: boolean
        milestones: string[]
      }>('complete_quest', { id: quest.id })

      setStarchildState(result.starchild_state)
      setQuests((prev) => prev.filter((q) => q.id !== quest.id))
      setExpanded(false)

      // Notify the chat so the Starchild can celebrate — include description so it knows the actual task
      onComplete(quest.description || quest.title)
    } catch (err) {
      console.error('Failed to complete quest:', err)
    } finally {
      setCompleting(false)
    }
  }, [onComplete, setStarchildState])

  if (quests.length === 0) return null

  const quest = quests[0] // Show the most recent active quest

  return (
    <div className="px-4 py-2">
      <div
        className="quest-card-appear glow-border rounded-2xl overflow-hidden cursor-pointer transition-all duration-300"
        style={{
          backgroundColor: 'rgba(48, 41, 69, 0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--outline)',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Header row */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-1">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{
              backgroundColor: 'var(--accent-lavender)',
              boxShadow: '0 0 8px var(--accent-lavender)',
            }}
          />
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-lavender)' }}>
            Active Quest
          </span>
          <div className="flex-1" />
          <span className="text-[10px] font-semibold" style={{ color: 'var(--accent-mint)' }}>
            +{quest.xp_reward} XP
          </span>
          <svg
            className="w-3.5 h-3.5 transition-transform duration-200 shrink-0"
            style={{
              color: 'var(--text-muted)',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>

        {/* Quest title */}
        <div className="px-4 pb-3">
          <p className="text-sm font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>
            {quest.title}
          </p>
          {quest.description && (
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {quest.description}
            </p>
          )}
        </div>

        {/* Expanded — complete button */}
        {expanded && (
          <div className="px-4 pb-4 animate-in" style={{ animationDuration: '0.15s' }}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleComplete(quest)
              }}
              disabled={completing}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 press-scale disabled:opacity-50"
              style={{
                backgroundColor: 'var(--accent-mint)',
                color: '#1a1525',
              }}
            >
              {completing ? 'completing...' : 'i did it ✦'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
