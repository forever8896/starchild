/**
 * App.tsx — Root layout
 *
 * Usage:
 *   <App /> renders a fixed full-screen layout:
 *   ┌────┬──────────────────────┐
 *   │    │                      │
 *   │ SB │   Active view        │
 *   │    │                      │
 *   └────┴──────────────────────┘
 *   SB = w-16 sidebar with icon nav
 */

import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import ChatWindow from './components/ChatWindow'
import QuestBoard from './components/QuestBoard'
import UserProfile from './components/UserProfile'
import Settings from './components/Settings'
import Onboarding from './components/Onboarding'
import { useAppStore } from './store'

// ─── Nav icon SVGs (inline, no external deps) ────────────────────────────────

function IconChat({ active }: { active: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.5 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-6 h-6"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function IconQuests({ active }: { active: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.5 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-6 h-6"
      aria-hidden="true"
    >
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  )
}

function IconProfile({ active }: { active: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.5 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-6 h-6"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function IconSettings({ active }: { active: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.5 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-6 h-6"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

// ─── Nav item ────────────────────────────────────────────────────────────────

type View = 'chat' | 'quests' | 'profile' | 'settings'

interface NavItemProps {
  view: View
  label: string
  activeView: View
  onClick: (v: View) => void
  icon: (active: boolean) => React.ReactNode
}

function NavItem({ view, label, activeView, onClick, icon }: NavItemProps) {
  const isActive = activeView === view
  return (
    <button
      onClick={() => onClick(view)}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      title={label}
      className={[
        'flex flex-col items-center justify-center w-full h-14 gap-1 rounded-lg transition-colors duration-150',
        isActive
          ? 'text-purple-400 bg-gray-800'
          : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/60',
      ].join(' ')}
    >
      {icon(isActive)}
      <span className="text-[9px] font-medium tracking-wide leading-none">
        {label}
      </span>
    </button>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const activeView = useAppStore((s) => s.activeView)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const onboardingComplete = useAppStore((s) => s.onboardingComplete)
  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete)
  const onboardingChecked = useAppStore((s) => s.onboardingChecked)
  const setOnboardingChecked = useAppStore((s) => s.setOnboardingChecked)

  // Check if onboarding was already completed
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
        // DB not ready yet — treat as not complete
        if (!cancelled) setOnboardingChecked(true)
      }
    }
    check()
    return () => { cancelled = true }
  }, [setOnboardingComplete, setOnboardingChecked])

  // Wait for onboarding check before rendering
  if (!onboardingChecked) {
    return <div className="w-screen h-screen bg-gray-950" />
  }

  // Show onboarding if not complete
  if (!onboardingComplete) {
    return <Onboarding />
  }

  return (
    <div className="flex w-screen h-screen bg-gray-950 overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <nav
        className="flex flex-col items-center w-16 shrink-0 bg-gray-900 border-r border-gray-800 py-3 gap-1"
        aria-label="Main navigation"
      >
        {/* Logo mark */}
        <div className="flex items-center justify-center w-10 h-10 mb-3 rounded-xl bg-purple-600/20 border border-purple-500/30">
          <span className="text-purple-400 text-lg leading-none" aria-hidden="true">
            ✦
          </span>
        </div>

        <NavItem
          view="chat"
          label="Chat"
          activeView={activeView}
          onClick={setActiveView}
          icon={(a) => <IconChat active={a} />}
        />
        <NavItem
          view="quests"
          label="Quests"
          activeView={activeView}
          onClick={setActiveView}
          icon={(a) => <IconQuests active={a} />}
        />
        <NavItem
          view="profile"
          label="Profile"
          activeView={activeView}
          onClick={setActiveView}
          icon={(a) => <IconProfile active={a} />}
        />

        {/* Push settings to bottom */}
        <div className="flex-1" />

        <NavItem
          view="settings"
          label="Settings"
          activeView={activeView}
          onClick={setActiveView}
          icon={(a) => <IconSettings active={a} />}
        />
      </nav>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden">
        {activeView === 'chat' && <ChatWindow />}
        {activeView === 'quests' && <QuestBoard />}
        {activeView === 'profile' && <UserProfile />}
        {activeView === 'settings' && <Settings />}
      </main>
    </div>
  )
}
