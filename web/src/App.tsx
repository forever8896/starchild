/**
 * App.tsx — web shell root.
 *
 * Mounts the real shared experience: first-run Onboarding, then the live
 * Conversation (ChatWindow) with the Vision Tree (SkillTree) reachable via a
 * toggle. Gating mirrors desktop — we read the `onboarding_complete` setting
 * (IndexedDB on web) and hold an invisible frame until that check resolves,
 * then render Onboarding or the chat. All data and inference flow through the
 * shared `Platform` seam via `usePlatform()`.
 *
 * The Vision Tree shows whatever real data the web shell has (vision statement
 * + quests from IndexedDB) and a graceful empty constellation otherwise — the
 * exact same shared `SkillTree` component the desktop renders.
 */

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../../src/store'
import { usePlatform } from '../../src/platform/usePlatform'
import Onboarding from '../../src/components/Onboarding'
import ChatWindow from '../../src/components/ChatWindow'
import SkillTree from '../../src/components/SkillTree'
import ErrorBoundary from '../../src/components/ErrorBoundary'
import DataSettings from './DataSettings'
import Settings from './Settings'

// ─── Icons ───────────────────────────────────────────────────────────────────

function GearIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      className="w-[18px] h-[18px]" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

function TreeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      className="w-[18px] h-[18px]" aria-hidden="true">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

function DataIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      className="w-[18px] h-[18px]" aria-hidden="true">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </svg>
  )
}

export default function App() {
  const platform = usePlatform()
  const onboardingComplete = useAppStore((s) => s.onboardingComplete)
  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete)
  const onboardingChecked = useAppStore((s) => s.onboardingChecked)
  const setOnboardingChecked = useAppStore((s) => s.setOnboardingChecked)
  const setStarchildState = useAppStore((s) => s.setStarchildState)
  const currentView = useAppStore((s) => s.currentView)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const setShowQuestOffer = useAppStore((s) => s.setShowQuestOffer)
  const [showData, setShowData] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      try {
        const value = await platform.getSetting('onboarding_complete')
        if (!cancelled) setOnboardingComplete(value === 'true')
      } catch {
        // First run / empty store — treat as not onboarded.
      } finally {
        if (!cancelled) setOnboardingChecked(true)
      }
      try {
        const state = await platform.getState()
        if (!cancelled) setStarchildState(state)
      } catch {
        // Non-critical — the creature state initializes lazily.
      }
    }
    bootstrap()
    return () => { cancelled = true }
  }, [platform, setOnboardingComplete, setOnboardingChecked, setStarchildState])

  // Surface the accept/decline UI when the Starchild offers a quest. The web
  // platform emits `quest-offered` from `sendMessage` (mirrors the desktop Tauri
  // event listened for in the desktop `App.tsx`); pull the user back to chat so
  // the offer is visible if they're on the tree/settings.
  useEffect(() => {
    return platform.subscribe('quest-offered', () => {
      setShowQuestOffer(true)
      if (useAppStore.getState().currentView !== 'chat') setCurrentView('chat')
    })
  }, [platform, setShowQuestOffer, setCurrentView])

  // Invisible hold while we check onboarding state.
  if (!onboardingChecked) {
    return <div style={{ width: '100vw', height: '100vh', backgroundColor: 'var(--bg-deep)' }} />
  }

  if (!onboardingComplete) {
    return (
      <ErrorBoundary>
        <Onboarding />
      </ErrorBoundary>
    )
  }

  const showTree = currentView === 'tree'

  return (
    <ErrorBoundary>
      <div className="relative" style={{ width: '100vw', height: '100vh' }}>
        {/* Top-right controls — chat view only; tree & settings carry their own back. */}
        {currentView === 'chat' && (
          <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
            <motion.button
              onClick={() => setShowData(true)}
              className="clay-nav-button flex items-center justify-center w-9 h-9 rounded-xl"
              style={{ color: 'var(--accent-sky)' }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              aria-label="Your Data"
              title="Your Data"
            >
              <DataIcon />
            </motion.button>
            <motion.button
              onClick={() => setCurrentView('settings')}
              className="clay-nav-button flex items-center justify-center w-9 h-9 rounded-xl"
              style={{ color: 'var(--text-muted)' }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              aria-label="Settings"
              title="Settings"
            >
              <GearIcon />
            </motion.button>
            <motion.button
              onClick={() => setCurrentView('tree')}
              className="clay-nav-button flex items-center justify-center w-9 h-9 rounded-xl"
              style={{ color: 'var(--accent-gold)' }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              aria-label="Your Journey"
              title="Your Journey"
            >
              <TreeIcon />
            </motion.button>
          </div>
        )}

        {/* Your Data — encrypted export / import overlay (PRD §5). */}
        {showData && <DataSettings onClose={() => setShowData(false)} />}

        {/* Settings — Venice key (BYOK) + data panel access (PRD §6). */}
        <AnimatePresence>
          {currentView === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, x: 32 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 32 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="absolute inset-0 z-40"
            >
              <ErrorBoundary>
                <Settings
                  onClose={() => setCurrentView('chat')}
                  onOpenData={() => setShowData(true)}
                />
              </ErrorBoundary>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {showTree ? (
            <motion.div
              key="tree"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
              className="absolute inset-0"
            >
              <ErrorBoundary>
                <SkillTree onBack={() => setCurrentView('chat')} />
              </ErrorBoundary>
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
              className="absolute inset-0"
            >
              <ChatWindow />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  )
}
