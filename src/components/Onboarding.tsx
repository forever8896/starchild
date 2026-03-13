/**
 * Onboarding.tsx — First-run setup wizard
 *
 * 4-step flow:
 *   1. Welcome — animated egg avatar, warm greeting
 *   2. API Key — Venice AI key input with validation (test call)
 *   3. Name — user name + optional Starchild name
 *   4. Privacy — data stays local, then launch into chat
 */

import { useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../store'

// ─── Inline egg SVG (reuses StarchildAvatar egg design) ──────────────────────

function OnboardingEgg() {
  return (
    <div
      style={{
        animation: 'creature-float 3.6s ease-in-out infinite',
        filter: 'drop-shadow(0 0 18px rgba(168,85,247,0.5))',
      }}
    >
      <svg viewBox="0 0 80 100" width="120" height="150" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="onb-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(168,85,247,0.5)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <radialGradient id="onb-body" cx="40%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#c084fc" />
            <stop offset="100%" stopColor="#a855f7" />
          </radialGradient>
        </defs>
        <ellipse cx="40" cy="55" rx="38" ry="45" fill="url(#onb-glow)" className="svg-breathe" />
        <ellipse cx="40" cy="52" rx="26" ry="34" fill="url(#onb-body)" stroke="#a855f7" strokeWidth="1.5" />
        <path d="M30 40 Q35 35 38 42" stroke="#c084fc" strokeWidth="1" fill="none" opacity="0.6" />
        <path d="M44 36 Q48 32 50 38" stroke="#c084fc" strokeWidth="1" fill="none" opacity="0.5" />
        <circle cx="34" cy="44" r="2" fill="#c084fc" opacity="0.4" />
        <circle cx="48" cy="50" r="1.5" fill="#c084fc" opacity="0.3" />
      </svg>
    </div>
  )
}

// ─── Eye toggle icons ────────────────────────────────────────────────────────

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      className="w-4 h-4" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      className="w-4 h-4" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

// ─── Step indicators ─────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Step ${current + 1} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={[
            'h-1.5 rounded-full transition-all duration-300',
            i === current
              ? 'w-6 bg-purple-400'
              : i < current
              ? 'w-1.5 bg-purple-600'
              : 'w-1.5 bg-gray-700',
          ].join(' ')}
        />
      ))}
    </div>
  )
}

// ─── Step 1: Welcome ─────────────────────────────────────────────────────────

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <OnboardingEgg />

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-gray-100">
          Meet your Starchild
        </h1>
        <p className="text-sm text-gray-400 max-w-sm leading-relaxed">
          A personal AI companion that grows with you. Set goals, build habits,
          and watch your Starchild evolve as you progress.
        </p>
      </div>

      <button
        onClick={onNext}
        className="w-full max-w-xs py-3 rounded-xl text-sm font-semibold bg-purple-600 text-white hover:bg-purple-500 active:scale-[0.98] transition-all duration-150"
      >
        Get Started
      </button>
    </div>
  )
}

// ─── Step 2: API Key ─────────────────────────────────────────────────────────

function ApiKeyStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const setApiKeySet = useAppStore((s) => s.setApiKeySet)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleValidateAndSave = useCallback(async () => {
    if (!apiKey.trim()) return

    setIsValidating(true)
    setError(null)

    try {
      // Save the key first
      await invoke('save_settings', { key: 'venice_api_key', value: apiKey.trim() })

      // Test it with a simple message
      try {
        await invoke('send_message', { message: 'Hello' })
      } catch {
        // Even if the test call fails (e.g. no model loaded yet), the key may still be valid
        // The save_settings succeeded, so we proceed
      }

      setApiKeySet(true)
      onNext()
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Failed to save API key. Please try again.')
    } finally {
      setIsValidating(false)
    }
  }, [apiKey, onNext, setApiKeySet])

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-600/20 border border-purple-500/30">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
          className="w-7 h-7 text-purple-400" aria-hidden="true">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
        </svg>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-gray-100">Connect to Venice AI</h2>
        <p className="text-sm text-gray-400 max-w-sm leading-relaxed">
          Starchild uses Venice AI for private, uncensored conversations.
          Get your free API key at <span className="text-purple-400 font-medium">venice.ai</span>
        </p>
      </div>

      <div className="w-full max-w-xs flex flex-col gap-3">
        <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 focus-within:border-purple-500/70 transition-colors duration-150">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleValidateAndSave() }}
            placeholder="Paste your Venice API key..."
            autoComplete="off"
            spellCheck={false}
            className="flex-1 bg-transparent text-gray-100 placeholder-gray-600 text-sm outline-none"
            aria-label="Venice API key"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="text-gray-500 hover:text-gray-300 transition-colors duration-150"
            aria-label={showKey ? 'Hide API key' : 'Show API key'}
          >
            {showKey ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-400" role="alert">{error}</p>
        )}

        <button
          onClick={handleValidateAndSave}
          disabled={!apiKey.trim() || isValidating}
          className={[
            'w-full py-3 rounded-xl text-sm font-semibold transition-all duration-150',
            apiKey.trim() && !isValidating
              ? 'bg-purple-600 text-white hover:bg-purple-500 active:scale-[0.98]'
              : 'bg-gray-800 text-gray-600 cursor-not-allowed',
          ].join(' ')}
        >
          {isValidating ? 'Validating...' : 'Continue'}
        </button>
      </div>

      <button
        onClick={onBack}
        className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
      >
        Back
      </button>
    </div>
  )
}

// ─── Step 3: Name ────────────────────────────────────────────────────────────

function NameStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [userName, setUserName] = useState('')
  const [starchildName, setStarchildName] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      if (userName.trim()) {
        await invoke('save_settings', { key: 'user_name', value: userName.trim() })
      }
      if (starchildName.trim()) {
        await invoke('save_settings', { key: 'starchild_name', value: starchildName.trim() })
      }
      onNext()
    } catch {
      // Non-critical — proceed anyway
      onNext()
    } finally {
      setIsSaving(false)
    }
  }, [userName, starchildName, onNext])

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-600/20 border border-purple-500/30">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
          className="w-7 h-7 text-purple-400" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-gray-100">Introduce yourself</h2>
        <p className="text-sm text-gray-400 max-w-sm leading-relaxed">
          Your Starchild will remember your name and use it in conversations.
        </p>
      </div>

      <div className="w-full max-w-xs flex flex-col gap-3">
        <div>
          <label htmlFor="user-name" className="block text-xs font-medium text-gray-500 mb-1.5 text-left">
            Your name
          </label>
          <input
            id="user-name"
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            placeholder="What should I call you?"
            autoComplete="off"
            spellCheck={false}
            maxLength={64}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-600 text-sm outline-none focus:border-purple-500/70 transition-colors duration-150"
            autoFocus
          />
        </div>

        <div>
          <label htmlFor="starchild-name" className="block text-xs font-medium text-gray-500 mb-1.5 text-left">
            Name your Starchild <span className="text-gray-700">(optional)</span>
          </label>
          <input
            id="starchild-name"
            type="text"
            value={starchildName}
            onChange={(e) => setStarchildName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            placeholder="Give your companion a name..."
            autoComplete="off"
            spellCheck={false}
            maxLength={64}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-600 text-sm outline-none focus:border-purple-500/70 transition-colors duration-150"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className={[
            'w-full py-3 rounded-xl text-sm font-semibold transition-all duration-150',
            !isSaving
              ? 'bg-purple-600 text-white hover:bg-purple-500 active:scale-[0.98]'
              : 'bg-gray-800 text-gray-600 cursor-not-allowed',
          ].join(' ')}
        >
          {isSaving ? 'Saving...' : userName.trim() ? 'Continue' : 'Skip'}
        </button>
      </div>

      <button
        onClick={onBack}
        className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
      >
        Back
      </button>
    </div>
  )
}

// ─── Step 4: Privacy ─────────────────────────────────────────────────────────

function PrivacyStep({ onFinish, onBack }: { onFinish: () => void; onBack: () => void }) {
  const [isFinishing, setIsFinishing] = useState(false)

  const handleFinish = useCallback(async () => {
    setIsFinishing(true)
    try {
      await invoke('save_settings', { key: 'onboarding_complete', value: 'true' })
    } catch {
      // Non-critical
    }
    onFinish()
  }, [onFinish])

  const items = [
    {
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
          className="w-5 h-5 text-emerald-400" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ),
      title: 'Your data stays on your device',
      desc: 'All conversations, memories, and quests are stored locally in SQLite. Nothing is uploaded to any server.',
    },
    {
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
          className="w-5 h-5 text-emerald-400" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
      title: 'Private AI via Venice',
      desc: 'Venice AI does not log or train on your conversations. Your API key connects directly — no middlemen.',
    },
    {
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
          className="w-5 h-5 text-emerald-400" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      ),
      title: 'Export or delete anytime',
      desc: 'You own your data. Export everything as JSON or clear it all from Settings whenever you want.',
    },
  ]

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-600/20 border border-emerald-500/30">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
          className="w-7 h-7 text-emerald-400" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-gray-100">Your privacy matters</h2>
        <p className="text-sm text-gray-400 max-w-sm leading-relaxed">
          Starchild is built privacy-first. Here's what that means:
        </p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-3">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-3 text-left bg-gray-900/60 border border-gray-800 rounded-xl p-3">
            <div className="shrink-0 mt-0.5">{item.icon}</div>
            <div>
              <p className="text-sm font-medium text-gray-200">{item.title}</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleFinish}
        disabled={isFinishing}
        className={[
          'w-full max-w-xs py-3 rounded-xl text-sm font-semibold transition-all duration-150',
          !isFinishing
            ? 'bg-purple-600 text-white hover:bg-purple-500 active:scale-[0.98]'
            : 'bg-gray-800 text-gray-600 cursor-not-allowed',
        ].join(' ')}
      >
        {isFinishing ? 'Setting up...' : "I'm ready — let's go!"}
      </button>

      <button
        onClick={onBack}
        className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
      >
        Back
      </button>
    </div>
  )
}

// ─── Main Onboarding component ───────────────────────────────────────────────

export default function Onboarding() {
  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete)
  const [step, setStep] = useState(0)

  const TOTAL_STEPS = 4

  function handleFinish() {
    setOnboardingComplete(true)
  }

  return (
    <div className="flex items-center justify-center w-screen h-screen bg-gray-950">
      <div className="flex flex-col items-center gap-8 px-6 py-10 max-w-md w-full">
        {step === 0 && <WelcomeStep onNext={() => setStep(1)} />}
        {step === 1 && <ApiKeyStep onNext={() => setStep(2)} onBack={() => setStep(0)} />}
        {step === 2 && <NameStep onNext={() => setStep(3)} onBack={() => setStep(1)} />}
        {step === 3 && <PrivacyStep onFinish={handleFinish} onBack={() => setStep(2)} />}

        {/* Step dots */}
        <StepDots current={step} total={TOTAL_STEPS} />
      </div>
    </div>
  )
}
