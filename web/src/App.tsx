/**
 * App.tsx — web shell root (redesigned per Starchild.dc).
 *
 * The shell is a persistent navigation rail beside a single main stage: the
 * rail (left on wide screens, a bottom bar on narrow ones) switches between
 * Talk (the redesigned ChatView), the Vision Tree, and You (Settings); Your
 * Data and the gated Feedback note open as overlays. Gating still mirrors
 * desktop — we read `onboarding_complete` and hold an invisible frame until it
 * resolves, then render Onboarding or the app. All data and inference flow
 * through the shared `Platform` seam via `usePlatform()`.
 *
 * The desktop keeps the shared `ChatWindow`/top-right controls; this rail and
 * `ChatView` are the web edition's chrome only.
 */

import { useEffect, useState, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../../src/store'
import { usePlatform } from '../../src/platform/usePlatform'
import Meeting from './Meeting'
import ErrorBoundary from '../../src/components/ErrorBoundary'
import NavRail from './NavRail'
import ChatView from './ChatView'
import QuestAcceptScene from './QuestAcceptScene'
import * as sound from './sound'
import {
  FEEDBACK_UNLOCKED_KEY,
  FEEDBACK_SUBMITTED_KEY,
  FEEDBACK_NUDGE_SEEN_KEY,
  FEEDBACK_QUEST_THRESHOLD,
} from './feedback'

// Plane → colour for the quest-accept bloom (mirrors SkillTree's CATEGORIES).
const PLANE_COLOR: Record<string, string> = { body: '#a8d8b8', mind: '#e8d8a8', spirit: '#b8a0d8' }
function questColor(category: string | null): string {
  const c = (category ?? '').toLowerCase()
  return c === 'body' ? PLANE_COLOR.body : c === 'mind' ? PLANE_COLOR.mind : PLANE_COLOR.spirit
}

// Heavy, conditionally-rendered panels — split into their own async chunks so
// they don't weigh down the initial chat/onboarding render.
const SkillTree = lazy(() => import('../../src/components/SkillTree'))
const Settings = lazy(() => import('./Settings'))
const FeedbackForm = lazy(() => import('./FeedbackForm'))

// ─── Responsive breakpoint — the rail becomes a bottom bar below this ────────

function useIsNarrow() {
  const [narrow, setNarrow] = useState(() => {
    try { return window.matchMedia('(max-width: 820px)').matches } catch { return false }
  })
  useEffect(() => {
    let mq: MediaQueryList
    try { mq = window.matchMedia('(max-width: 820px)') } catch { return }
    const onChange = () => setNarrow(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow
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
  const treeIntro = useAppStore((s) => s.treeIntro)
  const setTreeIntro = useAppStore((s) => s.setTreeIntro)
  const setShowQuestOffer = useAppStore((s) => s.setShowQuestOffer)
  const narrow = useIsNarrow()

  // Gated feedback (the first usage of the incentive fund). Unlocks after three
  // completed quests; `feedbackNudge` is the one-time prompt at that moment.
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedbackUnlocked, setFeedbackUnlocked] = useState(false)
  const [feedbackNudge, setFeedbackNudge] = useState(false)
  // The quest-accept cinematic (overlaid as the tree mounts beneath it).
  const [acceptScene, setAcceptScene] = useState<{ title: string; color: string } | null>(null)

  // Warm the E2EE trial handshake + enclave early (during intro/onboarding) so
  // the first message doesn't wait on the attestation round-trip or a cold
  // enclave. Best-effort, web-only.
  useEffect(() => {
    void import('../../src/platform/web').then((m) => m.warmTrialE2ee?.()).catch(() => {})
  }, [])

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
        let unlocked = (await platform.getSetting(FEEDBACK_UNLOCKED_KEY)) === 'true'
        if (!unlocked) {
          const completed = await platform.getQuests('completed')
          unlocked = completed.length >= FEEDBACK_QUEST_THRESHOLD
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

  // A soft tick on every button press. Also serves as the WebAudio unlock — the
  // audio context resumes on this first user gesture, so later cue sounds play.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest('button, [role="button"], a') as HTMLButtonElement | null
      if (el && !el.disabled) sound.click()
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [])

  // A quest is accepted → play the vow, carry the user to the tree, and lay the
  // accept cinematic over it; it fades to reveal the tree with its new fruit.
  useEffect(() => {
    return platform.subscribe('quest-accepted', (payload) => {
      const quest = (payload as { quest?: { title?: string; category?: string | null } } | undefined)?.quest
      sound.questAccept()
      setCurrentView('tree')
      setAcceptScene({ title: quest?.title || 'A new quest', color: questColor(quest?.category ?? null) })
      window.setTimeout(() => setAcceptScene(null), 2600)
    })
  }, [platform, setCurrentView])

  // The vision crystallizes → the wide, magical rise.
  useEffect(() => {
    return platform.subscribe('vision-crystallized', () => sound.crystallize())
  }, [platform])

  // Surface the accept/decline UI when the Starchild offers a quest, pulling the
  // user back to chat so the offer is visible.
  useEffect(() => {
    return platform.subscribe('quest-offered', () => {
      setShowQuestOffer(true)
      if (useAppStore.getState().currentView !== 'chat') setCurrentView('chat')
    })
  }, [platform, setShowQuestOffer, setCurrentView])

  // Feedback unlocks once the human has completed FEEDBACK_QUEST_THRESHOLD (3)
  // quests — enough of the experience to have something worth saying. On each
  // completion, check the total; when it reaches the threshold, flip it live +
  // persist and raise the one-time nudge (unless already seen or already sent).
  useEffect(() => {
    return platform.subscribe('quest-completed', () => {
      sound.questComplete()
      void (async () => {
        const completed = await platform.getQuests('completed')
        if (completed.length < FEEDBACK_QUEST_THRESHOLD) return
        await platform.setSetting(FEEDBACK_UNLOCKED_KEY, 'true')
        setFeedbackUnlocked(true)
        const [nudgeSeen, submitted] = await Promise.all([
          platform.getSetting(FEEDBACK_NUDGE_SEEN_KEY),
          platform.getSetting(FEEDBACK_SUBMITTED_KEY),
        ])
        if (nudgeSeen !== 'true' && submitted !== 'true') { sound.unlock(); setFeedbackNudge(true) }
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
        <Meeting />
      </ErrorBoundary>
    )
  }

  const activeNav = showFeedback ? 'feedback' : currentView

  return (
    <ErrorBoundary>
      {/* Shell: rail + main stage. Rail sits left on wide screens, bottom on narrow. */}
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: narrow ? 'column-reverse' : 'row',
          background: 'radial-gradient(125% 105% at 50% -12%, #2c2444 0%, #1c1730 44%, #100c1c 100%)',
        }}
      >
        <NavRail
          active={activeNav}
          narrow={narrow}
          feedbackUnlocked={feedbackUnlocked}
          onNav={(v) => setCurrentView(v)}
          onOpenFeedback={openFeedback}
        />

        <main style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
          <AnimatePresence mode="wait">
            {currentView === 'tree' ? (
              <motion.div
                key="tree"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: 'easeInOut' }}
                className="absolute inset-0"
              >
                <ErrorBoundary>
                  <Suspense fallback={null}>
                    <SkillTree
                      showIntro={treeIntro}
                      showLogo={false}
                      onBack={() => { setTreeIntro(false); setCurrentView('chat') }}
                    />
                  </Suspense>
                </ErrorBoundary>
              </motion.div>
            ) : currentView === 'settings' ? (
              <motion.div
                key="settings"
                initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="absolute inset-0"
              >
                <ErrorBoundary>
                  <Suspense fallback={null}>
                    <Settings onClose={() => setCurrentView('chat')} />
                  </Suspense>
                </ErrorBoundary>
              </motion.div>
            ) : (
              <motion.div
                key="chat"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: 'easeInOut' }}
                className="absolute inset-0"
              >
                <ChatView narrow={narrow} />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Quest-accept cinematic — overlays the tree as it mounts, then fades. */}
      <AnimatePresence>
        {acceptScene && <QuestAcceptScene key="accept-scene" title={acceptScene.title} color={acceptScene.color} />}
      </AnimatePresence>

      {/* Feedback form — gated; the first usage of the incentive fund. */}
      {showFeedback && (
        <Suspense fallback={null}>
          <FeedbackForm onClose={() => setShowFeedback(false)} />
        </Suspense>
      )}

      {/* One-time nudge when feedback unlocks (three completed quests). */}
      <AnimatePresence>
        {feedbackNudge && currentView === 'chat' && !showFeedback && (
          <motion.div
            key="feedback-nudge"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-2xl"
            style={{ backgroundColor: 'var(--bg-card)', border: '1.5px solid var(--outline)', maxWidth: 'calc(100vw - 32px)' }}
          >
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Three quests done. Care to help shape Starchild?
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
    </ErrorBoundary>
  )
}
