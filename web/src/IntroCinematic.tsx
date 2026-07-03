/**
 * IntroCinematic.tsx — the app's opening moment: the Starchild's genesis.
 *
 * A scored, full-screen cinematic (Venice, built from our own character): a star
 * ignites, energy gathers, the eyes form, the Starchild assembles. Because it has
 * SOUND, browsers won't autoplay it — so it opens on a poster and the first tap
 * (a user gesture) starts it with audio. Plays once per browser session, then
 * fades into the app. Mounted beside <App/> so it overlays everything and stays
 * decoupled from onboarding/chat state.
 */
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import introWebm from '../../src/assets/intro.webm'
import introMp4 from '../../src/assets/intro.mp4'
import introPoster from '../../src/assets/intro-poster.jpg'

const SEEN_KEY = 'starchild_intro_seen'

export default function IntroCinematic() {
  const [show, setShow] = useState(() => {
    try {
      return sessionStorage.getItem(SEEN_KEY) !== '1'
    } catch {
      return true
    }
  })
  const [started, setStarted] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  function dismiss() {
    try {
      sessionStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* private mode — fine */
    }
    setShow(false)
  }

  function begin() {
    if (started) return
    setStarted(true)
    const v = videoRef.current
    if (!v) return
    v.muted = false
    v.currentTime = 0
    const p = v.play()
    // If sound playback is refused, fall back to muted so it still plays.
    if (p && p.catch) p.catch(() => { v.muted = true; v.play().catch(() => {}) })
  }

  // Safety net: once playing, never trap the user if `ended` misfires.
  useEffect(() => {
    if (!started) return
    const t = setTimeout(() => dismiss(), 20000)
    return () => clearTimeout(t)
  }, [started])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="intro"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.1, ease: 'easeInOut' }}
          onClick={started ? undefined : begin}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            cursor: started ? 'default' : 'pointer',
          }}
          aria-label={started ? 'Starchild intro' : 'Tap to begin'}
        >
          <video
            ref={videoRef}
            playsInline
            preload="auto"
            poster={introPoster}
            onEnded={dismiss}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          >
            <source src={introWebm} type="video/webm" />
            <source src={introMp4} type="video/mp4" />
          </video>

          {/* Soft radial vignette — draws the eye to the centre (from Starchild.dc). */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background: 'radial-gradient(circle at 50% 50%, transparent 40%, rgba(0,0,0,0.5) 100%)',
            }}
          />

          {!started && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.35, 0.8, 0.35] }}
              transition={{ opacity: { delay: 0.9, duration: 3.2, repeat: Infinity, ease: 'easeInOut' } }}
              style={{
                position: 'absolute',
                bottom: '13%',
                fontSize: 12.5,
                letterSpacing: '0.34em',
                textTransform: 'uppercase',
                fontWeight: 400,
                color: 'rgba(255,255,255,0.8)',
                pointerEvents: 'none',
                textShadow: '0 0 20px rgba(0,0,0,0.6)',
              }}
            >
              tap to begin
            </motion.span>
          )}

          {started && (
            <motion.button
              onClick={(e) => { e.stopPropagation(); dismiss() }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              transition={{ delay: 2.4, duration: 1.6 }}
              whileHover={{ opacity: 0.85 }}
              style={{
                position: 'absolute',
                bottom: 22,
                right: 24,
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.7)',
                fontSize: 11,
                fontWeight: 400,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
              aria-label="Skip intro"
            >
              skip
            </motion.button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
