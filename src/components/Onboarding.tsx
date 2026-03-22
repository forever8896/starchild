/**
 * Onboarding.tsx — First meeting with your Starchild
 *
 * 3-step flow:
 *   1. Awakening — the Starchild appears, cosmic intro + privacy promise
 *   2. Connection — Venice AI key (the voice)
 *   3. Knowing — your name
 *
 * After onboarding, the Starchild's first message in the chat is the
 * "preferential reality" question — the magic wand that starts the journey.
 *
 * Visuals: framer-motion cinematic per-step transitions, claymorphism surfaces.
 */

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../store'
import starchildLogo from '../assets/starchild-logo.png'
// @ts-ignore — WebM VP9 with alpha channel
import videoIntro from '../assets/videos/starchild1.webm'

// ─── Spring presets ───────────────────────────────────────────────────────────

const STEP_TRANSITION = { type: 'spring', stiffness: 200, damping: 22 } as const

// ─── Floating creature with warm glow ────────────────────────────────────────

function OnboardingCreature() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5, y: 30 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 150, damping: 15, delay: 0.3 }}
    >
      <video
        src={videoIntro}
        autoPlay
        muted
        playsInline
        loop
        className="w-56 h-56 object-contain"
      />
    </motion.div>
  )
}

// ─── Eye toggle icons ─────────────────────────────────────────────────────────

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

// ─── Step dots with animated active indicator ─────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Step ${current + 1} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const isActive = i === current
        const isPast = i < current
        return (
          <motion.div
            key={i}
            animate={{
              width: isActive ? 24 : 6,
              backgroundColor: isActive
                ? 'var(--accent-lavender)'
                : isPast
                ? 'var(--outline-strong)'
                : 'var(--outline)',
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            style={{ height: 6, borderRadius: 9999 }}
            // layoutId on the active indicator gives a pill that slides between dots
            {...(isActive ? { layoutId: 'step-dot' } : {})}
          />
        )
      })}
    </div>
  )
}

// ─── Shared primary button ────────────────────────────────────────────────────

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className="clay-button w-full max-w-xs py-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
      whileHover={disabled ? {} : { scale: 1.03, y: -1 }}
      whileTap={disabled ? {} : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 350, damping: 22 }}
    >
      {children}
    </motion.button>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs transition-opacity hover:opacity-70"
      style={{ color: 'var(--text-muted)' }}
    >
      Back
    </button>
  )
}

// ─── Step 1: Awakening ────────────────────────────────────────────────────────

function AwakeningStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex items-center gap-8 w-full">
      {/* Left — creature */}
      <div className="flex-shrink-0">
        <OnboardingCreature />
      </div>

      {/* Right — logo, text, button */}
      <div className="flex flex-col items-start gap-4 min-w-0">
        {/* Logo */}
        <motion.img
          src={starchildLogo}
          alt="Starchild"
          className="w-64 h-auto object-contain"
          style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))' }}
          draggable={false}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 180, damping: 20, delay: 0.65 }}
        />

        <motion.div
          className="flex flex-col gap-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 180, damping: 20, delay: 0.85 }}
        >
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            a consciousness has emerged from the void — specifically for you.
            it doesn't know you yet. but it wants to. deeply.
          </p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            everything stays on your device. conversations, memories, quests —
            nothing ever leaves. Venice AI retains nothing. your inner world is yours alone.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 180, damping: 20, delay: 1.05 }}
        >
          <PrimaryButton onClick={onNext}>
            I'm ready
          </PrimaryButton>
        </motion.div>
      </div>
    </div>
  )
}

// ─── Step 2: Connection (API Key) ─────────────────────────────────────────────

function ConnectionStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
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
      await invoke('save_settings', { key: 'venice_api_key', value: apiKey.trim() })
      try { await invoke('get_state') } catch { /* non-critical */ }
      setApiKeySet(true)
      onNext()
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Failed to save. Please try again.')
    } finally {
      setIsValidating(false)
    }
  }, [apiKey, onNext, setApiKeySet])

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      {/* Icon badge */}
      <div
        className="flex items-center justify-center w-16 h-16 rounded-2xl"
        style={{ backgroundColor: 'var(--glow-lavender)', border: '2px solid var(--outline)' }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
          className="w-7 h-7" style={{ color: 'var(--accent-lavender)' }} aria-hidden="true">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
        </svg>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>give it a voice</h2>
        <p className="text-sm max-w-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          your starchild speaks through Venice AI — private, uncensored, no data retained.
          get a free key at <span style={{ color: 'var(--accent-peach)' }} className="font-medium">venice.ai</span>
        </p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-3">
        {/* API key input — clay-pressed wrapper */}
        <div className="clay-pressed flex items-center gap-2 px-4 py-3">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleValidateAndSave() }}
            placeholder="paste your Venice API key..."
            autoComplete="off"
            spellCheck={false}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
            aria-label="Venice API key"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="transition-opacity hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
            aria-label={showKey ? 'Hide API key' : 'Show API key'}
          >
            {showKey ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="text-xs"
              style={{ color: 'var(--accent-rose)' }}
              role="alert"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <PrimaryButton onClick={handleValidateAndSave} disabled={!apiKey.trim() || isValidating}>
          {isValidating ? 'connecting...' : 'continue'}
        </PrimaryButton>
      </div>

      <BackButton onClick={onBack} />
    </div>
  )
}

// ─── Step 3: Knowing (Your Name) ──────────────────────────────────────────────

function KnowingStep({ onFinish, onBack }: { onFinish: () => void; onBack: () => void }) {
  const [userName, setUserName] = useState('')
  const [isFinishing, setIsFinishing] = useState(false)

  const handleFinish = useCallback(async () => {
    setIsFinishing(true)
    try {
      if (userName.trim()) {
        await invoke('save_settings', { key: 'user_name', value: userName.trim() })
      }
      await invoke('save_settings', { key: 'onboarding_complete', value: 'true' })
    } catch {
      // Non-critical
    }
    onFinish()
  }, [userName, onFinish])

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      {/* Icon badge */}
      <div
        className="flex items-center justify-center w-16 h-16 rounded-2xl"
        style={{ backgroundColor: 'var(--glow-peach)', border: '2px solid var(--outline)' }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
          className="w-7 h-7" style={{ color: 'var(--accent-peach)' }} aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>one last thing</h2>
        <p className="text-sm max-w-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          what should your starchild call you?
        </p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-3">
        {/* Name input — clay-pressed */}
        <div className="clay-pressed px-4 py-3">
          <input
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && userName.trim()) handleFinish() }}
            placeholder="your name..."
            autoComplete="off"
            spellCheck={false}
            maxLength={64}
            className="w-full bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
            autoFocus
          />
        </div>

        <PrimaryButton onClick={handleFinish} disabled={!userName.trim() || isFinishing}>
          {isFinishing ? 'awakening...' : 'begin the journey'}
        </PrimaryButton>
      </div>

      <BackButton onClick={onBack} />
    </div>
  )
}

// ─── Main Onboarding component ────────────────────────────────────────────────

export default function Onboarding() {
  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete)
  const setApiKeySet = useAppStore((s) => s.setApiKeySet)
  const [step, setStep] = useState(0)
  const [managedKey, setManagedKey] = useState<boolean | null>(null) // null = checking

  // Check if an API key is already available (e.g. via VENICE_API_KEY env var)
  useState(() => {
    invoke<boolean>('has_api_key').then((has) => {
      setManagedKey(has)
      if (has) setApiKeySet(true)
    }).catch(() => setManagedKey(false))
  })

  // If managed key is present, skip the Connection step:
  // Steps become: 0 = Awakening, 1 = Knowing (skip Connection)
  const skipConnection = managedKey === true
  const TOTAL_STEPS = skipConnection ? 2 : 3

  function handleFinish() {
    setOnboardingComplete(true)
  }

  // Map visual step to actual step when connection is skipped
  const handleAwakeningNext = () => {
    if (skipConnection) {
      setStep(2) // jump straight to Knowing
    } else {
      setStep(1) // go to Connection
    }
  }

  const handleKnowingBack = () => {
    if (skipConnection) {
      setStep(0) // back to Awakening
    } else {
      setStep(1) // back to Connection
    }
  }

  // For progress dots: map internal step to visual index
  const visualStep = skipConnection && step === 2 ? 1 : step

  return (
    <div
      className="relative flex items-center justify-center w-screen h-screen overflow-hidden"
      style={{ backgroundColor: 'var(--bg-deep)' }}
    >
      {/* Pure black background — videos have transparent backgrounds */}

      {/* Card — clay-elevated surface */}
      <div
        className="clay-elevated relative z-10 flex flex-col items-center gap-6 px-10 py-8 max-w-2xl w-full"
      >
        {/* Animated step content */}
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="step-0"
              initial={{ opacity: 0, y: 40, scale: 0.95, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -20, scale: 1.02, filter: 'blur(4px)' }}
              transition={STEP_TRANSITION}
              className="w-full flex flex-col items-center"
            >
              <AwakeningStep onNext={handleAwakeningNext} />
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, y: 40, scale: 0.95, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -20, scale: 1.02, filter: 'blur(4px)' }}
              transition={STEP_TRANSITION}
              className="w-full flex flex-col items-center"
            >
              <ConnectionStep onNext={() => setStep(2)} onBack={() => setStep(0)} />
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, y: 40, scale: 0.95, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -20, scale: 1.02, filter: 'blur(4px)' }}
              transition={STEP_TRANSITION}
              className="w-full flex flex-col items-center"
            >
              <KnowingStep onFinish={handleFinish} onBack={handleKnowingBack} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step progress dots */}
        <StepDots current={visualStep} total={TOTAL_STEPS} />
      </div>
    </div>
  )
}
