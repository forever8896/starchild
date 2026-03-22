/**
 * StarchildAvatar.tsx — Video-driven Starchild avatar
 *
 * Videos change based on mood/state:
 *   - Default/idle: starchild2.mp4 (breathing loop)
 *   - Happy/Ecstatic: starchild4.mp4 (celebration)
 *   - Curious/Restless: starchild3.mp4 (curious)
 *   - Hungry/Starving/Caring: starchild5.mp4 (caring)
 *   - First appearance: starchild1.mp4 (intro, plays once then switches to idle)
 *
 * All videos loop except the intro (starchild1) which plays once.
 * Transitions between videos use a crossfade.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { useAppStore } from '../store'

// ─── Video imports ────────────────────────────────────────────────────────────

// @ts-ignore — WebM VP9 with alpha channel (transparent background)
import videoIntro from '../assets/videos/starchild1.webm'
// @ts-ignore
import videoIdle from '../assets/videos/starchild2.webm'
// @ts-ignore
import videoCurious from '../assets/videos/starchild3.webm'
// @ts-ignore
import videoCelebrate from '../assets/videos/starchild4.webm'
// @ts-ignore
import videoCaring from '../assets/videos/starchild5.webm'

// ─── Types ───────────────────────────────────────────────────────────────────

type Mood = 'Ecstatic' | 'Happy' | 'Content' | 'Restless' | 'Hungry' | 'Starving'
type Stage = 'egg' | 'hatchling' | 'juvenile' | 'adult'

interface MoodPalette {
  primary: string
  secondary: string
  glow: string
  label: string
  bar: string
  animSpeed: number
}

// ─── Mood palettes ────────────────────────────────────────────────────────────

const MOOD_PALETTES: Record<string, MoodPalette> = {
  Ecstatic: { primary: '#4ade80', secondary: '#86efac', glow: 'rgba(74,222,128,0.6)',  label: 'Ecstatic', bar: 'bg-green-500',   animSpeed: 0.7 },
  Happy:    { primary: '#34d399', secondary: '#6ee7b7', glow: 'rgba(52,211,153,0.5)',  label: 'Happy',    bar: 'bg-emerald-500', animSpeed: 0.85 },
  Content:  { primary: '#a78bfa', secondary: '#c4b5fd', glow: 'rgba(167,139,250,0.5)', label: 'Content',  bar: 'bg-purple-500',  animSpeed: 1.0 },
  Restless: { primary: '#facc15', secondary: '#fde047', glow: 'rgba(250,204,21,0.45)', label: 'Restless', bar: 'bg-yellow-500',  animSpeed: 1.2 },
  Hungry:   { primary: '#fb923c', secondary: '#fdba74', glow: 'rgba(251,146,60,0.5)',  label: 'Hungry',   bar: 'bg-orange-500',  animSpeed: 1.4 },
  Starving: { primary: '#f87171', secondary: '#fca5a5', glow: 'rgba(248,113,113,0.6)', label: 'Starving', bar: 'bg-red-500',     animSpeed: 1.6 },
}

const DEFAULT_PALETTE = MOOD_PALETTES.Content

function getPalette(mood: string): MoodPalette {
  return MOOD_PALETTES[mood] ?? DEFAULT_PALETTE
}

function getStage(level: number): Stage {
  if (level <= 1) return 'egg'
  if (level <= 3) return 'hatchling'
  if (level <= 6) return 'juvenile'
  return 'adult'
}

function getStageLabel(stage: Stage): string {
  return { egg: 'Egg', hatchling: 'Hatchling', juvenile: 'Juvenile', adult: 'Adult' }[stage]
}

function getMoodVideo(mood: string): string {
  switch (mood) {
    case 'Ecstatic':
    case 'Happy':
      return videoCelebrate
    case 'Restless':
    case 'Curious':
      return videoCurious
    case 'Hungry':
    case 'Starving':
      return videoCaring
    case 'Content':
    default:
      return videoIdle
  }
}

// ─── Stat bar with hover tooltip ──────────────────────────────────────────────

function StatMini({
  label,
  value,
  max,
  color,
  tooltip,
}: {
  label: string
  value: number
  max: number
  color: string
  tooltip: string
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className="group relative w-full" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      {/* Hover tooltip — positioned above, clamped within bounds */}
      <div
        className="absolute bottom-full left-0 right-0 mb-1 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30"
      >
        <div
          className="px-2.5 py-1 rounded-lg text-[10px] max-w-[200px] text-center leading-snug"
          style={{
            backgroundColor: 'rgba(48, 41, 69, 0.95)',
            border: '1px solid var(--outline)',
            color: 'var(--text-secondary)',
          }}
        >
          {tooltip}
        </div>
      </div>
      {/* Label row */}
      <div className="flex justify-between text-[10px] mb-0.5 px-0.5">
        <span style={{ color: 'var(--text-secondary)', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>{label}</span>
        <span style={{ color, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>{Math.round(pct)}%</span>
      </div>
      {/* Bar */}
      <div
        className="h-1.5 w-full rounded-full overflow-hidden"
        style={{ backgroundColor: 'rgba(74, 63, 96, 0.5)' }}
      >
        <div
          className="h-full rounded-full bar-fill"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function StarchildAvatar() {
  const state = useAppStore((s) => s.starchildState)

  const mood   = (state?.mood as Mood) ?? 'Content'
  const hunger = state?.hunger ?? 50
  const level  = state?.level ?? 1
  const xp     = state?.xp ?? 0
  const palette = getPalette(mood)
  const stage  = getStage(level)

  const [hasPlayedIntro, setHasPlayedIntro] = useState(
    () => localStorage.getItem('starchild_intro_played') === 'true'
  )

  // Front and back video refs for crossfade
  const frontRef = useRef<HTMLVideoElement>(null)
  const backRef  = useRef<HTMLVideoElement>(null)

  // Which layer is currently "front" (visible)
  const [frontIsA, setFrontIsA] = useState(true)
  const videoARef = useRef<HTMLVideoElement>(null)
  const videoBRef = useRef<HTMLVideoElement>(null)

  // activeVideo is the src currently playing on the front layer
  const [activeVideo, setActiveVideo] = useState<string>(
    () => hasPlayedIntro ? videoIdle : videoIntro
  )
  const [frontOpacity, setFrontOpacity] = useState(1)

  // Whether the front video should loop
  const isIntro = activeVideo === videoIntro
  const shouldLoop = !isIntro

  // Switch video: load in back layer, fade front out, swap
  const switchTo = useCallback((src: string) => {
    const front = frontIsA ? videoARef.current : videoBRef.current
    const back  = frontIsA ? videoBRef.current : videoARef.current
    if (!front || !back) return

    back.src = src
    back.loop = src !== videoIntro
    back.style.opacity = '0'
    back.load()

    const onPlaying = () => {
      back.removeEventListener('playing', onPlaying)
      // Fade out front
      front.style.transition = 'opacity 0.7s ease'
      front.style.opacity = '0'
      back.style.transition = 'opacity 0.7s ease'
      back.style.opacity = '1'
      // After transition, swap roles
      setTimeout(() => {
        front.style.transition = ''
        setFrontIsA(prev => !prev)
        setActiveVideo(src)
      }, 720)
    }

    back.addEventListener('playing', onPlaying)
    back.play().catch(() => {})
  }, [frontIsA])

  // On mood change (only after intro)
  useEffect(() => {
    if (!hasPlayedIntro) return
    const target = getMoodVideo(mood)
    if (target !== activeVideo) {
      switchTo(target)
    }
  }, [mood, hasPlayedIntro]) // intentionally omit switchTo/activeVideo to avoid loops

  // Handle intro end — switch to idle and mark played
  const handleVideoEnded = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (e.currentTarget.src && e.currentTarget.src.includes(videoIntro.split('/').pop()!)) {
      setHasPlayedIntro(true)
      localStorage.setItem('starchild_intro_played', 'true')
      switchTo(videoIdle)
    }
  }, [switchTo])

  // Initial mount: set up the front video
  useEffect(() => {
    const front = frontIsA ? videoARef.current : videoBRef.current
    if (!front) return
    front.src = activeVideo
    front.loop = activeVideo !== videoIntro
    front.style.opacity = '1'
    front.load()
    front.play().catch(() => {})
  }, []) // run once on mount only

  // Determine which ref is front and which is back for rendering
  const frontVideoRef = frontIsA ? videoARef : videoBRef
  const backVideoRef  = frontIsA ? videoBRef : videoARef

  return (
    <div className="relative flex flex-col items-center h-full select-none">
      {/* Video creature */}
      <div
        className="relative flex-1 flex items-center justify-center w-full overflow-hidden"
        aria-label={`Starchild is feeling ${mood}`}
        role="img"
        style={{
          WebkitMaskImage: 'radial-gradient(ellipse 48% 45% at 50% 48%, black 20%, transparent 75%)',
          maskImage: 'radial-gradient(ellipse 48% 45% at 50% 48%, black 20%, transparent 75%)',
        }}
      >
        {/* Back layer (loading next video) */}
        <video
          ref={backVideoRef}
          autoPlay={false}
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-contain z-10"
          style={{ opacity: 0 }}
        />
        {/* Front layer (currently visible) */}
        <video
          ref={frontVideoRef}
          autoPlay
          muted
          playsInline
          loop={shouldLoop}
          onEnded={isIntro ? handleVideoEnded : undefined}
          className="absolute inset-0 w-full h-full object-contain z-20"
          style={{
            opacity: 1,
            maxWidth: '500px',
            margin: '0 auto',
          }}
        />
      </div>

      {/* Level badge + stats — anchored at bottom */}
      <div className="flex flex-col items-center gap-2 w-full px-5 pb-5 z-20 mt-auto">
        {/* Level + mood badge */}
        <div
          className="flex items-center gap-2 px-3 py-1 rounded-full backdrop-blur-sm"
          style={{ backgroundColor: 'rgba(48, 41, 69, 0.6)', border: '1px solid var(--outline)' }}
        >
          <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--accent-lavender)' }}>
            Lv {level}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--outline-strong)' }}>·</span>
          <span style={{ color: palette.primary }} className="text-[10px] font-medium">
            {palette.label}
          </span>
        </div>
        {/* Stat bars */}
        <div className="flex flex-col gap-1.5 w-full">
          <StatMini
            label="Nourishment"
            value={hunger}
            max={100}
            color={palette.primary}
            tooltip="How well-fed your Starchild feels — chat and complete quests to nourish it"
          />
          <StatMini
            label="XP"
            value={xp}
            max={level * 100}
            color="var(--accent-lavender)"
            tooltip={`${xp} / ${level * 100} XP — complete quests to level up your Starchild`}
          />
        </div>
      </div>
    </div>
  )
}
