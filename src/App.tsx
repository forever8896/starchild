/**
 * App.tsx — Root layout
 *
 * No sidebar. Full-screen chat with skyline background.
 * Settings accessible via gear icon overlay.
 */

import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import ChatWindow from './components/ChatWindow'
import Settings from './components/Settings'
import Onboarding from './components/Onboarding'
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

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [showSettings, setShowSettings] = useState(false)
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

  if (!onboardingChecked) {
    return <div className="w-screen h-screen" style={{ backgroundColor: 'var(--bg-deep)' }} />
  }

  if (!onboardingComplete) {
    return <Onboarding />
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden noise-overlay" style={{ backgroundColor: 'var(--bg-deep)' }}>
      {/* Settings gear — floating top-right */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        className="absolute top-3 right-3 z-50 flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-200 press-scale backdrop-blur-sm"
        style={{
          color: showSettings ? 'var(--accent-lavender)' : 'var(--text-muted)',
          backgroundColor: showSettings ? 'rgba(48, 41, 69, 0.8)' : 'rgba(26, 21, 37, 0.6)',
          border: '1px solid var(--outline)',
        }}
        aria-label={showSettings ? 'Back to chat' : 'Settings'}
        title={showSettings ? 'Back to chat' : 'Settings'}
      >
        {showSettings ? <BackIcon /> : <GearIcon />}
      </button>

      {/* Main content — full screen */}
      {showSettings ? (
        <div className="w-full h-full animate-in" style={{ animationDuration: '0.2s' }}>
          <Settings />
        </div>
      ) : (
        <ChatWindow />
      )}
    </div>
  )
}
