/**
 * ActiveQuest.tsx — Floating quest card in the chat view
 *
 * Shows the current active quest as a clay-elevated card pinned to the top of chat.
 * User can expand it and mark it complete, which triggers a celebration
 * message from the Starchild.
 *
 * Animated with framer-motion spring physics and claymorphism surfaces.
 */

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useAppStore, type Quest } from '../store'

export default function ActiveQuest({
  onRequestProof,
}: {
  onRequestProof: (quest: Quest) => void
}) {
  const [quests, setQuests] = useState<Quest[]>([])
  const [expanded, setExpanded] = useState(false)

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
    // Reload when quests are accepted or completed
    let ul1: (() => void) | null = null
    let ul2: (() => void) | null = null
    listen('quest-accepted', () => { load() }).then((fn) => { ul1 = fn })
    listen('quest-completed', () => { load() }).then((fn) => { ul2 = fn })
    return () => { cancelled = true; clearInterval(interval); ul1?.(); ul2?.() }
  }, [])

  if (quests.length === 0) return null

  const quest = quests[0] // Show the most recent active quest

  return (
    <div className="px-4 py-2">
      <motion.div
        className="clay-elevated overflow-hidden cursor-pointer"
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        whileHover={{ y: -2 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
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
          <motion.svg
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: 'var(--text-muted)' }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          >
            <path d="M6 9l6 6 6-6" />
          </motion.svg>
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
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="quest-expanded"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              style={{ overflow: 'hidden' }}
            >
              <div className="px-4 pb-4">
                <motion.button
                  onClick={(e) => {
                    e.stopPropagation()
                    setExpanded(false)
                    onRequestProof(quest)
                  }}
                  className="clay-button w-full py-2.5 text-sm font-semibold"
                  style={{
                    background: 'rgba(168, 216, 184, 0.85)',
                    color: '#1a1525',
                  }}
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                >
                  i did it ✦
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
