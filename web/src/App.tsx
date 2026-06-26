/**
 * App.tsx — web shell root.
 *
 * Mounts the real shared experience: first-run Onboarding, then the live
 * Conversation (ChatWindow). Gating mirrors desktop — we read the
 * `onboarding_complete` setting (IndexedDB on web) and hold an invisible frame
 * until that check resolves, then render Onboarding or the chat. All data and
 * inference flow through the shared `Platform` seam via `usePlatform()`.
 */

import { useEffect } from 'react'
import { useAppStore } from '../../src/store'
import { usePlatform } from '../../src/platform/usePlatform'
import Onboarding from '../../src/components/Onboarding'
import ChatWindow from '../../src/components/ChatWindow'
import ErrorBoundary from '../../src/components/ErrorBoundary'

export default function App() {
  const platform = usePlatform()
  const onboardingComplete = useAppStore((s) => s.onboardingComplete)
  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete)
  const onboardingChecked = useAppStore((s) => s.onboardingChecked)
  const setOnboardingChecked = useAppStore((s) => s.setOnboardingChecked)
  const setStarchildState = useAppStore((s) => s.setStarchildState)

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

  // Invisible hold while we check onboarding state.
  if (!onboardingChecked) {
    return <div style={{ width: '100vw', height: '100vh', backgroundColor: 'var(--bg-deep)' }} />
  }

  return (
    <ErrorBoundary>
      {!onboardingComplete ? (
        <Onboarding />
      ) : (
        <div style={{ width: '100vw', height: '100vh' }}>
          <ChatWindow />
        </div>
      )}
    </ErrorBoundary>
  )
}
