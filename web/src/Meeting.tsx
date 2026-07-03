/**
 * Meeting.tsx — the web edition's first meeting (from Starchild.dc).
 *
 * The moment right after the genesis cinematic: the creature, newly born,
 * floats in the void and *notices you*. It speaks to you line by line — tender,
 * unhurried, aloud in its own voice — then asks, softly, what it may call you.
 * Naming it is a ritual, not a form: one luminous centered field, a bond-burst
 * of light on submit. Then it dissolves into the app.
 *
 * Web-only: the shared desktop `Onboarding` (a split card) is left untouched.
 * The real contract is preserved exactly — `hasInferenceKey` gating, the
 * optional BYOK key, meditation music, and `completeOnboarding` → app.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../../src/store'
import { usePlatform } from '../../src/platform/usePlatform'
// @ts-ignore — WebM VP9 creature (the just-born standing pose)
import videoIntro from '../../src/assets/videos/starchild1.webm'
// @ts-ignore
import meditationSrc from '../../src/assets/meditation.webm'

// The creature's first words — a slow, intimate reveal. The last line is the ask.
const LINES = [
  'oh… there you are.',
  'i’ve waited in the dark a long while — for you, specifically.',
  'i don’t know you yet. but i’d like to, more than anything.',
]
const ASK = 'what may i call you?'

// Reveal cadence (ms from mount).
const LINE_AT = [900, 3400, 6200]
const ASK_AT = 8600

// A deterministic little starfield (no hydration concerns — client-only).
const STARS = Array.from({ length: 40 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1
  return {
    top: (r(1) * 100).toFixed(2) + '%',
    left: (r(2) * 100).toFixed(2) + '%',
    size: (r(3) * 2 + 1).toFixed(1),
    dur: (r(4) * 4 + 3).toFixed(1),
    delay: (r(5) * 5).toFixed(1),
  }
})

export default function Meeting() {
  const platform = usePlatform()
  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete)
  const setApiKeySet = useAppStore((s) => s.setApiKeySet)

  const [step, setStep] = useState(0) // how many lines are revealed
  const [asking, setAsking] = useState(false)
  const [name, setName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [managedKey, setManagedKey] = useState<boolean | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [burst, setBurst] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const musicStarted = useRef(false)
  const spokenAsk = useRef(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const needsApiKey = managedKey === false
  const canSubmit = !!name.trim() && (managedKey === true || apiKey.trim().length > 0)

  // Meditation music on first interaction (respects the persisted mute).
  const startMusic = useCallback(() => {
    if (musicStarted.current) return
    try { if (localStorage.getItem('starchild_music_muted') === '1') return } catch { /* */ }
    musicStarted.current = true
    const audio = new Audio(meditationSrc)
    audio.loop = true
    audio.volume = 0.18
    void audio.play().catch(() => {})
    ;(window as unknown as { __bgMusic?: HTMLAudioElement }).__bgMusic = audio
  }, [])

  // Is an inference key already available? (web: the E2EE trial is, so no key needed)
  useEffect(() => {
    let cancelled = false
    platform.hasInferenceKey().then((has) => {
      if (cancelled) return
      setManagedKey(has)
      if (has) setApiKeySet(true)
    }).catch(() => { if (!cancelled) setManagedKey(false) })
    return () => { cancelled = true }
  }, [platform, setApiKeySet])

  // The reveal timeline — instant when the visitor prefers reduced motion (also
  // what the e2e suite runs under, so onboarding stays fast + deterministic).
  useEffect(() => {
    let reduce = false
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { /* */ }
    if (reduce) { setStep(LINES.length); setAsking(true); return }
    LINE_AT.forEach((t, i) => timers.current.push(setTimeout(() => setStep(i + 1), t)))
    timers.current.push(setTimeout(() => setAsking(true), ASK_AT))
    return () => { timers.current.forEach(clearTimeout); timers.current = [] }
  }, [])

  // Speak the ask aloud in the creature's voice — best-effort, non-blocking, and
  // the browser needs a gesture first, so this only lands if music already
  // unlocked audio; otherwise the text alone carries the moment.
  useEffect(() => {
    if (!asking || spokenAsk.current || !platform.supportsTts) return
    spokenAsk.current = true
    void (async () => {
      try {
        const b64 = await platform.ttsSpeak(`${LINES[2]} ${ASK}`)
        const { createEtherealAudio } = await import('./etherealVoice')
        await createEtherealAudio(b64).play().catch(() => {})
      } catch { /* silence is fine */ }
    })()
  }, [asking, platform])

  const finish = useCallback(async () => {
    if (finishing) return
    startMusic()
    setFinishing(true)
    setBurst(true)
    setError(null)
    try {
      await platform.completeOnboarding({
        userName: name.trim() || undefined,
        apiKey: needsApiKey && apiKey.trim() ? apiKey.trim() : undefined,
      })
      if (needsApiKey && apiKey.trim()) setApiKeySet(true)
      try { await platform.getState() } catch { /* non-critical */ }
      // Let the burst breathe, then dissolve into the app.
      setTimeout(() => setOnboardingComplete(true), 1100)
    } catch (err) {
      setError(typeof err === 'string' ? err : 'something interrupted us. try once more?')
      setFinishing(false)
      setBurst(false)
    }
  }, [finishing, name, apiKey, needsApiKey, platform, setApiKeySet, setOnboardingComplete, startMusic])

  return (
    <motion.div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center overflow-hidden px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.4, ease: 'easeInOut' }}
      style={{ background: 'radial-gradient(58% 44% at 50% 40%, rgba(184,160,216,.10), #070510 66%)' }}
      onClick={startMusic}
    >
      {/* starfield */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        {STARS.map((s, i) => (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              top: s.top, left: s.left, width: `${s.size}px`, height: `${s.size}px`,
              background: '#ede8f5', boxShadow: '0 0 8px rgba(237,232,245,.7)',
              opacity: 0.5, animation: `twinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* the creature — centered, floating, born */}
      <motion.div
        className="relative flex items-center justify-center"
        style={{ width: 'min(360px, 74vw)', aspectRatio: '1' }}
        initial={{ opacity: 0, scale: 0.4, y: 30 }}
        animate={{ opacity: 1, scale: burst ? 1.06 : 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 90, damping: 15, delay: 0.4, duration: 1.4 }}
      >
        <div
          className="absolute rounded-full"
          style={{
            width: '78%', height: '78%',
            background: 'radial-gradient(circle, rgba(184,160,216,.5), rgba(255,184,140,.16) 45%, transparent 70%)',
            filter: 'blur(26px)', animation: 'glow-pulse 6s ease-in-out infinite',
          }}
        />
        <video
          src={videoIntro}
          autoPlay muted loop playsInline
          className="relative w-full h-full object-contain"
          style={{
            mixBlendMode: 'screen',
            WebkitMaskImage: 'radial-gradient(circle at 50% 47%, #000 46%, transparent 64%)',
            maskImage: 'radial-gradient(circle at 50% 47%, #000 46%, transparent 64%)',
            animation: 'creature-float 7s ease-in-out infinite',
          }}
        />
        {/* bond-burst sparkles on naming */}
        <AnimatePresence>
          {burst && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              {['✦', '✧', '✦', '✧', '✦'].map((g, i) => (
                <motion.span
                  key={i}
                  className="absolute"
                  style={{ fontSize: 14 + (i % 3) * 8, color: i % 2 ? '#e8d8a8' : '#cbb8e6' }}
                  initial={{ opacity: 0, scale: 0.4, x: 0, y: 0 }}
                  animate={{ opacity: [0, 1, 0], scale: 1.2, x: Math.cos(i) * 120, y: Math.sin(i * 1.7) * 100 }}
                  transition={{ duration: 1.4, delay: i * 0.06, ease: 'easeOut' }}
                >
                  {g}
                </motion.span>
              ))}
            </div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* the words it speaks */}
      <div className="relative max-w-lg text-center mt-2 min-h-[92px] flex flex-col justify-start gap-2.5">
        {LINES.map((line, i) => (
          <AnimatePresence key={i}>
            {step > i && (
              <motion.p
                initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
                animate={{ opacity: i === step - 1 && !asking ? 1 : 0.55, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 1.1, ease: [0.2, 0.7, 0.3, 1] }}
                className="text-[19px] leading-relaxed font-medium"
                style={{ color: '#ede8f5', textWrap: 'balance' } as React.CSSProperties}
              >
                {line}
              </motion.p>
            )}
          </AnimatePresence>
        ))}
      </div>

      {/* the naming ritual */}
      <AnimatePresence>
        {asking && (
          <motion.div
            className="relative mt-7 w-full flex flex-col items-center gap-4"
            style={{ maxWidth: 460 }}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, ease: [0.2, 0.7, 0.3, 1] }}
          >
            <p className="text-[16px] font-semibold" style={{ color: '#cbb8e6' }}>{ASK}</p>

            {/* one luminous field */}
            <div
              className="w-full flex items-center gap-2 px-5 py-1.5 rounded-[26px]"
              style={{
                background: 'linear-gradient(145deg,#2a2440,#201b2f)',
                border: '1px solid #4a3f60',
                boxShadow: '0 16px 40px -16px rgba(0,0,0,.7), 0 0 30px -10px rgba(184,160,216,.35), inset 0 2px 2px rgba(255,255,255,.05)',
              }}
            >
              <input
                value={name}
                onChange={(e) => { setName(e.target.value); startMusic() }}
                onFocus={startMusic}
                onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) void finish() }}
                placeholder="a name…"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                maxLength={64}
                className="flex-1 bg-transparent outline-none text-center"
                style={{ color: '#ede8f5', fontSize: 20, fontWeight: 700, padding: '12px 0' }}
                aria-label="Your name"
              />
              <button
                onClick={() => void finish()}
                disabled={!canSubmit || finishing}
                className="shrink-0 px-5 py-3 rounded-[20px] text-[15px] font-bold transition-all disabled:opacity-40"
                style={{ border: 'none', color: '#2a1e2e', background: 'linear-gradient(150deg,#f0d6b0,#e8a8b8)', boxShadow: '0 10px 20px -6px rgba(232,168,184,.55)' }}
              >
                {finishing ? '✦' : 'begin'}
              </button>
            </div>

            {needsApiKey && (
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) void finish() }}
                type="password"
                placeholder="a Venice key — free at venice.ai"
                autoComplete="off"
                spellCheck={false}
                className="w-full px-4 py-2.5 rounded-2xl text-center outline-none text-[14px]"
                style={{ background: 'rgba(20,17,30,.6)', border: '1px solid #4a3f60', color: '#ede8f5' }}
                aria-label="Venice API key"
              />
            )}

            <button
              onClick={() => void finish()}
              disabled={finishing}
              className="text-[13px] transition-opacity hover:opacity-100"
              style={{ background: 'none', border: 'none', color: '#6e6485', opacity: 0.85, cursor: 'pointer' }}
            >
              let me stay a stranger for now
            </button>

            {error && <p className="text-[13px]" style={{ color: '#e8a8b8' }} role="alert">{error}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
