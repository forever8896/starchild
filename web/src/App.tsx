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

import { useEffect, useState, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../../src/store'
import { usePlatform } from '../../src/platform/usePlatform'
import Onboarding from '../../src/components/Onboarding'
import ChatWindow from '../../src/components/ChatWindow'
import ErrorBoundary from '../../src/components/ErrorBoundary'
import {
  FEEDBACK_UNLOCKED_KEY,
  FEEDBACK_SUBMITTED_KEY,
  FEEDBACK_NUDGE_SEEN_KEY,
} from './feedback'

// Heavy, conditionally-rendered panels — split into their own async chunks so
// they don't weigh down the initial chat/onboarding render. Each only loads
// when the user actually opens it (Vision Tree, Your Data, Settings, Feedback).
const SkillTree = lazy(() => import('../../src/components/SkillTree'))
const DataSettings = lazy(() => import('./DataSettings'))
const Settings = lazy(() => import('./Settings'))
const FeedbackForm = lazy(() => import('./FeedbackForm'))

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

function FeedbackIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      className="w-[18px] h-[18px]" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
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
  // Gated feedback (the first usage of the incentive fund). Unlocks after the
  // first completed quest; `feedbackNudge` is the one-time prompt at that moment.
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedbackUnlocked, setFeedbackUnlocked] = useState(false)
  const [feedbackNudge, setFeedbackNudge] = useState(false)

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
      try {
        // Feedback unlocks after the first completed quest. Trust the persisted
        // flag; otherwise derive it from whether any completed quest exists
        // (covers data imported from desktop, where no event fired here).
        let unlocked = (await platform.getSetting(FEEDBACK_UNLOCKED_KEY)) === 'true'
        if (!unlocked) {
          const completed = await platform.getQuests('completed')
          unlocked = completed.length > 0
          if (unlocked) await platform.setSetting(FEEDBACK_UNLOCKED_KEY, 'true')
        }
        if (!cancelled) setFeedbackUnlocked(unlocked)
      } catch {
        // No quests yet — feedback stays locked.
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

  // Completing a quest unlocks feedback. Flip it live + persist, and raise the
  // one-time nudge (only if it hasn't been seen and feedback isn't already sent).
  useEffect(() => {
    return platform.subscribe('quest-completed', () => {
      void (async () => {
        await platform.setSetting(FEEDBACK_UNLOCKED_KEY, 'true')
        setFeedbackUnlocked(true)
        const [nudgeSeen, submitted] = await Promise.all([
          platform.getSetting(FEEDBACK_NUDGE_SEEN_KEY),
          platform.getSetting(FEEDBACK_SUBMITTED_KEY),
        ])
        if (nudgeSeen !== 'true' && submitted !== 'true') setFeedbackNudge(true)
      })()
    })
  }, [platform])

  const dismissNudge = () => {
    setFeedbackNudge(false)
    void platform.setSetting(FEEDBACK_NUDGE_SEEN_KEY, 'true')
  }
  const openFeedback = () => {
    dismissNudge()
    setShowFeedback(true)
  }

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
            {feedbackUnlocked && (
              <motion.button
                onClick={openFeedback}
                className="clay-nav-button flex items-center justify-center w-9 h-9 rounded-xl"
                style={{ color: 'var(--accent-rose)' }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                aria-label="Share feedback"
                title="Share feedback"
              >
                <FeedbackIcon />
              </motion.button>
            )}
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
        {showData && (
          <Suspense fallback={null}>
            <DataSettings onClose={() => setShowData(false)} />
          </Suspense>
        )}

        {/* One-time nudge when feedback unlocks (first completed quest). */}
        <AnimatePresence>
          {feedbackNudge && currentView === 'chat' && !showFeedback && (
            <motion.div
              key="feedback-nudge"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-2xl"
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1.5px solid var(--outline)',
                maxWidth: 'calc(100vw - 32px)',
              }}
            >
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                First quest done. Care to help shape Starchild?
              </span>
              <button
                onClick={openFeedback}
                className="px-3 py-1 rounded-lg text-xs font-semibold shrink-0"
                style={{ backgroundColor: 'var(--accent-rose)', color: 'var(--bg-deep)' }}
              >
                Share feedback
              </button>
              <button
                onClick={dismissNudge}
                className="text-xs shrink-0"
                style={{ color: 'var(--text-muted)' }}
                aria-label="Dismiss"
              >
                Later
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Feedback form — gated; the first usage of the incentive fund. */}
        {showFeedback && (
          <Suspense fallback={null}>
            <FeedbackForm onClose={() => setShowFeedback(false)} />
          </Suspense>
        )}

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
                <Suspense fallback={null}>
                  <Settings
                    onClose={() => setCurrentView('chat')}
                    onOpenData={() => setShowData(true)}
                  />
                </Suspense>
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
                <Suspense fallback={null}>
                  <SkillTree onBack={() => setCurrentView('chat')} />
                </Suspense>
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
