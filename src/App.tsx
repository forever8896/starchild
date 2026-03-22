/**
 * App.tsx — Root layout
 *
 * No sidebar. Full-screen chat with skyline background.
 * Settings accessible via gear icon overlay.
 * Framer-motion cinematic transitions between views.
 * Claymorphism nav buttons (.clay-nav-button).
 */

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
// @ts-ignore
import meditationSrc from './assets/meditation.webm'
import ChatWindow from './components/ChatWindow'
import Settings from './components/Settings'
import Onboarding from './components/Onboarding'
import SkillTree from './components/SkillTree'
import ErrorBoundary from './components/ErrorBoundary'
import { useAppStore } from './store'

// ─── Icons ───────────────────────────────────────────────────────────────────

function GearIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      className="w-[18px] h-[18px]" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      className="w-[18px] h-[18px]" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" />
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

// ─── Ambient particles (chat view only) ──────────────────────────────────────

const PARTICLES = [
  { id: 1, left: '12%',  bottom: '18%', size: 4,  dur: '7s',  delay: '0s',   driftX: '10px',  color: 'rgba(184,160,216,0.5)' },
  { id: 2, left: '30%',  bottom: '10%', size: 3,  dur: '9s',  delay: '2.1s', driftX: '-6px',  color: 'rgba(255,184,140,0.4)' },
  { id: 3, left: '55%',  bottom: '14%', size: 5,  dur: '8s',  delay: '1.3s', driftX: '14px',  color: 'rgba(168,200,232,0.4)' },
  { id: 4, left: '75%',  bottom: '8%',  size: 3,  dur: '11s', delay: '3.7s', driftX: '-10px', color: 'rgba(184,160,216,0.35)' },
  { id: 5, left: '88%',  bottom: '22%', size: 4,  dur: '6.5s',delay: '0.8s', driftX: '8px',   color: 'rgba(168,216,184,0.4)' },
]

function AmbientParticles() {
  return (
    <>
      {PARTICLES.map((p) => (
        <span
          key={p.id}
          className="ambient-particle"
          style={{
            left: p.left,
            bottom: p.bottom,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            '--drift-dur': p.dur,
            '--drift-delay': p.delay,
            '--drift-x': p.driftX,
          } as React.CSSProperties}
        />
      ))}
    </>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────

function MusicToggle() {
  const bgMusicMuted = useAppStore((s) => s.bgMusicMuted)
  const setBgMusicMuted = useAppStore((s) => s.setBgMusicMuted)

  const handleToggle = () => {
    let audio = (window as any).__bgMusic as HTMLAudioElement | undefined
    if (!audio) {
      // Create if it doesn't exist yet
      audio = new Audio(meditationSrc)
      audio.loop = true
      ;(window as any).__bgMusic = audio
    }
    if (bgMusicMuted) {
      audio.volume = 0.18
      audio.play().catch(() => {})
    } else {
      audio.pause()
    }
    setBgMusicMuted(!bgMusicMuted)
  }

  return (
    <motion.button
      onClick={handleToggle}
      className="clay-nav-button w-9 h-9"
      style={{ color: bgMusicMuted ? 'var(--text-muted)' : 'var(--accent-lavender)' }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label={bgMusicMuted ? 'Unmute music' : 'Mute music'}
      title={bgMusicMuted ? 'Unmute music' : 'Mute music'}

    >
      {/* Music note icon — distinct from speaker/TTS controls */}
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
        className="w-[18px] h-[18px]" aria-hidden="true"
        style={{ opacity: bgMusicMuted ? 0.5 : 1 }}
      >
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    </motion.button>
  )
}

export default function App() {
  const currentView = useAppStore((s) => s.currentView)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const onboardingComplete = useAppStore((s) => s.onboardingComplete)
  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete)
  const onboardingChecked = useAppStore((s) => s.onboardingChecked)
  const setOnboardingChecked = useAppStore((s) => s.setOnboardingChecked)

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const value = await invoke<string | null>('get_setting', { key: 'onboarding_complete' })
        if (!cancelled) {
          setOnboardingComplete(value === 'true')
          setOnboardingChecked(true)
        }
      } catch {
        if (!cancelled) setOnboardingChecked(true)
      }
    }
    check()
    return () => { cancelled = true }
  }, [setOnboardingComplete, setOnboardingChecked])

  // Start background music on first user interaction (for returning users)
  const startBgMusic = useCallback(() => {
    if ((window as any).__bgMusic) return
    const bgMuted = useAppStore.getState().bgMusicMuted
    const audio = new Audio(meditationSrc)
    audio.loop = true
    audio.volume = bgMuted ? 0 : 0.35
    if (bgMuted) {
      // Create but don't play — ready for unmute
      ;(window as any).__bgMusic = audio
    } else {
      audio.play().catch(() => {})
      ;(window as any).__bgMusic = audio
    }
    // Only need first interaction
    document.removeEventListener('click', startBgMusic)
    document.removeEventListener('keydown', startBgMusic)
  }, [])

  useEffect(() => {
    if (!onboardingComplete) return
    // For returning users: start music on first click/keypress
    document.addEventListener('click', startBgMusic, { once: true })
    document.addEventListener('keydown', startBgMusic, { once: true })
    return () => {
      document.removeEventListener('click', startBgMusic)
      document.removeEventListener('keydown', startBgMusic)
    }
  }, [onboardingComplete, startBgMusic])

  // Track whether this is the FIRST skill tree reveal (from Crystallize — shows video intro)
  const [isFirstTreeReveal, setIsFirstTreeReveal] = useState(false)

  // Reveal the skill tree when the backend emits 'reveal-skill-tree'
  // (fired after Crystallize phase completes — video intro plays only this time)
  useEffect(() => {
    let unlisten: (() => void) | null = null
    let revealTimer: ReturnType<typeof setTimeout> | null = null

    listen('reveal-skill-tree', () => {
      setIsFirstTreeReveal(true) // this is the cinematic first reveal
      const checkAndReveal = () => {
        const ttsAudio = (window as any).__ttsAudio as HTMLAudioElement | undefined
        if (ttsAudio && !ttsAudio.ended && !ttsAudio.paused) {
          ttsAudio.addEventListener('ended', () => {
            revealTimer = setTimeout(() => setCurrentView('tree'), 1500)
          }, { once: true })
        } else {
          revealTimer = setTimeout(() => setCurrentView('tree'), 3000)
        }
      }
      setTimeout(checkAndReveal, 500)
    }).then((fn) => { unlisten = fn })

    return () => {
      unlisten?.()
      if (revealTimer) clearTimeout(revealTimer)
    }
  }, [setCurrentView])

  // Auto-switch to tree view on quest celebration (brief, no video)
  useEffect(() => {
    let unlisten: (() => void) | null = null
    listen('quest-celebration', () => {
      setIsFirstTreeReveal(false)
      setCurrentView('tree')
      // Auto-return to chat after 4s
      setTimeout(() => setCurrentView('chat'), 4000)
    }).then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  }, [setCurrentView])

  // Loading — invisible hold while we check onboarding state
  if (!onboardingChecked) {
    return <div className="w-screen h-screen" style={{ backgroundColor: 'var(--bg-deep)' }} />
  }

  // First-run onboarding — wraps both onboarding and main app in AnimatePresence
  // so the transition from onboarding → chat is a cinematic crossfade
  if (!onboardingComplete) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="onboarding"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05, filter: 'blur(12px)' }}
          transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-screen h-screen"
        >
          <Onboarding />
        </motion.div>
      </AnimatePresence>
    )
  }

  return (
    <motion.div
      className="relative w-screen h-screen overflow-hidden noise-overlay"
      style={{ backgroundColor: 'var(--bg-deep)' }}
      initial={{ opacity: 0, scale: 0.95, filter: 'blur(8px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: 1.0, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {/* Ambient particles — only visible behind chat view */}
      <AnimatePresence>
        {currentView === 'chat' && (
          <motion.div
            key="particles"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-0 z-0 overflow-hidden pointer-events-none"
          >
            <AmbientParticles />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top-right nav buttons */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2.5">
        {/* Music toggle */}
        <MusicToggle />

        {/* Skill Tree button */}
        <motion.button
          onClick={() => {
            setIsFirstTreeReveal(false) // manual nav → no video intro
            setCurrentView(currentView === 'tree' ? 'chat' : 'tree')
          }}
          className="clay-nav-button w-9 h-9"
          style={{ color: 'var(--accent-gold)' }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-label="Your Journey"
          title="Your Journey"
        >
          <TreeIcon />
        </motion.button>

        {/* Settings / Back gear */}
        <motion.button
          onClick={() => setCurrentView(currentView === 'settings' ? 'chat' : 'settings')}
          className="clay-nav-button w-9 h-9"
          style={{
            color: currentView === 'settings' ? 'var(--accent-lavender)' : 'var(--text-muted)',
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-label={currentView === 'settings' ? 'Back to chat' : 'Settings'}
          title={currentView === 'settings' ? 'Back to chat' : 'Settings'}
        >
          {currentView === 'settings' ? <BackIcon /> : <GearIcon />}
        </motion.button>
      </div>

      {/* Main content — animated view transitions */}
      <AnimatePresence mode="wait">
        {currentView === 'tree' && (
          <motion.div
            key="tree"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
            className="absolute inset-0"
          >
            <ErrorBoundary><SkillTree onBack={() => { setIsFirstTreeReveal(false); setCurrentView('chat') }} showIntro={isFirstTreeReveal} /></ErrorBoundary>
          </motion.div>
        )}

        {currentView === 'settings' && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="w-full h-full"
          >
            <ErrorBoundary><Settings /></ErrorBoundary>
          </motion.div>
        )}

        {currentView === 'chat' && (
          <motion.div
            key="chat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full h-full"
          >
            <ErrorBoundary><ChatWindow /></ErrorBoundary>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
