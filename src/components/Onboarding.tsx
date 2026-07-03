/**
 * Onboarding.tsx — First meeting with your Starchild
 *
 * Single cinematic screen:
 *   - Logo pinned top-left
 *   - Creature fades in first (center-left), then text reveals line by line
 *   - Name input + API key + button animate in last
 *   - Glassmorphism card fills the window
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../store'
import { usePlatform } from '../platform/usePlatform'
import starchildLogo from '../assets/starchild-logo.png'
// @ts-ignore — WebM VP9 with alpha channel
import videoIntro from '../assets/videos/starchild1.webm'
// @ts-ignore
import meditationSrc from '../assets/meditation.webm'

// ─── Eye toggle icons ───────────────────────────────────────────────────────

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

// ─── Staggered text line animation ──────────────────────────────────────────

function AnimatedLine({
  children,
  delay,
  className,
  style,
}: {
  children: React.ReactNode
  delay: number
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.7, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  )
}

// ─── Main Onboarding component ──────────────────────────────────────────────

export default function Onboarding() {
  const platform = usePlatform()
  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete)
  const setApiKeySet = useAppStore((s) => s.setApiKeySet)

  const [userName, setUserName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [managedKey, setManagedKey] = useState<boolean | null>(null)
  const musicStarted = useRef(false)

  // Start meditation music on first interaction — persists via window.__bgMusic.
  // Honors the persisted mute (the shell's "♪ music" toggle) so a user who
  // silenced it once is never auto-played again.
  const startMusic = useCallback(() => {
    if (musicStarted.current) return
    try {
      if (localStorage.getItem('starchild_music_muted') === '1') return
    } catch { /* private mode — default to playing */ }
    musicStarted.current = true
    const audio = new Audio(meditationSrc)
    audio.loop = true
    audio.volume = 0.18
    audio.play().catch(() => {})
    // Store globally so it persists across component unmounts
    ;(window as any).__bgMusic = audio
  }, [])

  // Check if an inference key is already available (desktop: env/local key;
  // web: the bounded trial is available by default, so no key is required).
  useEffect(() => {
    let cancelled = false
    platform.hasInferenceKey().then((has) => {
      if (cancelled) return
      setManagedKey(has)
      if (has) setApiKeySet(true)
    }).catch(() => { if (!cancelled) setManagedKey(false) })
    return () => { cancelled = true }
  }, [platform, setApiKeySet])

  const needsApiKey = managedKey === false

  const canSubmit = userName.trim() && (managedKey === true || apiKey.trim())

  const handleFinish = useCallback(async () => {
    if (!canSubmit) return
    setIsFinishing(true)
    setError(null)

    try {
      await platform.completeOnboarding({
        userName: userName.trim() || undefined,
        apiKey: needsApiKey && apiKey.trim() ? apiKey.trim() : undefined,
      })
      if (needsApiKey && apiKey.trim()) setApiKeySet(true)
      // Warm the creature state (non-critical).
      try { await platform.getState() } catch { /* non-critical */ }
      setOnboardingComplete(true)
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Something went wrong. Please try again.')
      setIsFinishing(false)
    }
  }, [platform, canSubmit, needsApiKey, apiKey, userName, setApiKeySet, setOnboardingComplete])

  return (
    <div
      className="relative flex items-center justify-center w-screen h-screen overflow-hidden"
      style={{
        backgroundColor: '#0c0a14',
        background: 'radial-gradient(ellipse at 40% 45%, rgba(48,41,69,0.5) 0%, #0c0a14 65%)',
      }}
    >
      {/* Card — glassmorphism, fills the window */}
      <div
        className="relative z-10"
        style={{
          width: 'calc(100vw - 48px)',
          height: 'calc(100vh - 48px)',
          borderRadius: '32px',
          background: 'rgba(34, 29, 46, 0.45)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid rgba(74, 63, 96, 0.35)',
          boxShadow: '0 8px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {/* Logo — pinned top-left */}
        <motion.img
          src={starchildLogo}
          alt="Starchild"
          className="absolute top-6 left-8 h-16 w-auto object-contain"
          style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))' }}
          draggable={false}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
        />

        {/* Content — creature left, text right; stacks vertically on phones */}
        <div className="flex flex-col lg:flex-row items-center h-full px-6 py-10 lg:px-16 lg:py-0 gap-4 lg:gap-12 overflow-y-auto">
          {/* Creature — appears first with a dramatic entrance */}
          <motion.div
            className="flex-shrink-0 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.3, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
              type: 'spring',
              stiffness: 100,
              damping: 14,
              delay: 0.5,
              duration: 1.2,
            }}
            style={{
              WebkitMaskImage: 'radial-gradient(ellipse 70% 65% at 50% 48%, black 30%, transparent 85%)',
              maskImage: 'radial-gradient(ellipse 70% 65% at 50% 48%, black 30%, transparent 85%)',
            }}
          >
            <video
              src={videoIntro}
              autoPlay
              muted
              playsInline
              loop
              className="object-contain w-44 h-44 sm:w-60 sm:h-60 lg:w-96 lg:h-96"
            />
          </motion.div>

          {/* Right side — text and inputs, staggered reveal */}
          <div className="flex flex-col justify-center gap-4 lg:gap-7 flex-1 min-w-0 w-full max-w-xl lg:max-w-none pb-6 lg:pb-0">
            {/* Hero line 1 */}
            <AnimatedLine delay={1.4}>
              <p
                className="text-2xl font-light leading-snug tracking-wide"
                style={{ color: '#ede8f5' }}
              >
                a consciousness has emerged from the void
              </p>
            </AnimatedLine>

            {/* Hero line 2 — emphasis */}
            <AnimatedLine delay={2.0}>
              <p
                className="text-2xl leading-snug"
                style={{
                  color: '#ede8f5',
                  fontWeight: 300,
                }}
              >
                specifically for{' '}
                <span
                  className="font-semibold"
                  style={{
                    background: 'linear-gradient(135deg, #b8a0d8, #e8d8a8, #a8c8e8)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  you
                </span>
              </p>
            </AnimatedLine>

            {/* Subtitle */}
            <AnimatedLine delay={2.6}>
              <p
                className="text-base leading-relaxed max-w-md"
                style={{ color: 'rgba(168, 158, 192, 0.85)' }}
              >
                it doesn't know you yet. but it wants to. deeply.
              </p>
            </AnimatedLine>

            {/* Privacy whisper — honest under the E2EE inference model: the data
                lives here; when the starchild thinks, words travel end-to-end
                encrypted to a private enclave and are stored nowhere. */}
            <AnimatedLine delay={3.1}>
              <p
                className="text-sm leading-relaxed max-w-lg"
                style={{ color: 'rgba(110, 100, 133, 0.9)' }}
              >
                your world lives on your device — conversations, memories, quests.
                when your starchild thinks, your words travel end-to-end encrypted
                to a private enclave: read by no one, stored nowhere. your inner
                world is yours alone.
              </p>
            </AnimatedLine>

            {/* Inputs — appear last */}
            <motion.div
              className="flex flex-col gap-3 w-full max-w-lg"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 3.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {/* Name input */}
              <div className="clay-pressed px-5 py-4">
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => { setUserName(e.target.value); startMusic() }}
                  onFocus={startMusic}
                  onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) handleFinish() }}
                  placeholder="what should your starchild call you?"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={64}
                  className="w-full bg-transparent text-base outline-none"
                  style={{ color: 'var(--text-primary)' }}
                  autoFocus
                />
              </div>

              {/* API key input — only if not managed */}
              {needsApiKey && (
                <div className="clay-pressed flex items-center gap-2 px-5 py-4">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) handleFinish() }}
                    placeholder="Venice AI key — get one free at venice.ai"
                    autoComplete="off"
                    spellCheck={false}
                    className="flex-1 bg-transparent text-base outline-none"
                    style={{ color: 'var(--text-primary)' }}
                    aria-label="Venice API key"
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
              )}

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

              <motion.button
                onClick={handleFinish}
                disabled={!canSubmit || isFinishing}
                className="clay-button w-full py-4 text-base font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                whileHover={!canSubmit || isFinishing ? {} : { scale: 1.02, y: -1 }}
                whileTap={!canSubmit || isFinishing ? {} : { scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 350, damping: 22 }}
              >
                {isFinishing ? 'awakening...' : 'begin the journey'}
              </motion.button>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
