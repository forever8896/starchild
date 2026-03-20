/**
 * App.tsx — Root layout
 *
 * No sidebar. Full-screen chat with skyline background.
 * Settings accessible via gear icon overlay.
 * Framer-motion cinematic transitions between views.
 * Claymorphism nav buttons (.clay-nav-button).
 */

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import ChatWindow from './components/ChatWindow'
import Settings from './components/Settings'
import Onboarding from './components/Onboarding'
import SkillTree from './components/SkillTree'
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

export default function App() {
  const [currentView, setCurrentView] = useState<'chat' | 'settings' | 'tree'>('chat')
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

  // Reveal the skill tree when the starchild SAYS "vision tree" in a message.
  // This ties the reveal directly to the conversation moment — the starchild
  // says "let's place this on your vision tree ✦", the message finishes,
  // a brief pause, then the tree appears. No disconnected background events.
  useEffect(() => {
    let unlisten: (() => void) | null = null
    let revealTimer: ReturnType<typeof setTimeout> | null = null

    listen<{ message: { content: string } }>('stream-done', (event) => {
      const content = event.payload.message.content.toLowerCase()
      if (content.includes('vision tree')) {
        // The starchild just told the user about the vision tree —
        // pause so they read it, then launch the cinematic reveal
        revealTimer = setTimeout(() => {
          setCurrentView('tree')
        }, 2500)
      }
    }).then((fn) => { unlisten = fn })

    return () => {
      unlisten?.()
      if (revealTimer) clearTimeout(revealTimer)
    }
  }, [])

  // Loading — invisible hold while we check onboarding state
  if (!onboardingChecked) {
    return <div className="w-screen h-screen" style={{ backgroundColor: 'var(--bg-deep)' }} />
  }

  // First-run onboarding
  if (!onboardingComplete) {
    return (
      <motion.div
        key="onboarding"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="w-screen h-screen"
      >
        <Onboarding />
      </motion.div>
    )
  }

  return (
    <div
      className="relative w-screen h-screen overflow-hidden noise-overlay"
      style={{ backgroundColor: 'var(--bg-deep)' }}
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
        {/* Skill Tree button */}
        <motion.button
          onClick={() => setCurrentView('tree')}
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
            initial={{ opacity: 0, scale: 0.9, filter: 'blur(8px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 1.1, filter: 'blur(4px)' }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            className="absolute inset-0"
          >
            <SkillTree onBack={() => setCurrentView('chat')} />
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
            <Settings />
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
            <ChatWindow />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
