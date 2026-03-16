/**
 * StarchildAvatar.tsx — Animated Starchild with AI-generated mood images
 *
 * Image selection is mood-driven:
 *   - Ecstatic / Happy  → creatureHappy
 *   - Content           → creatureNeutral
 *   - Restless / Curious → creatureCurious
 *   - Hungry / Starving → creatureCaring
 *
 * Stage system (egg/hatchling/juvenile/adult) is preserved for badge
 * labels and level display only — not for image selection.
 * Mood also affects glow color and animation speed.
 * Idle animations: floating, glowing, pulsing.
 */

import { useAppStore } from '../store'

// ─── Image imports ──────────────────────────────────────────────────────────

import creatureNeutral from '../assets/starchild-neutral.png'
import creatureHappy from '../assets/starchild-happy.png'
import creatureCurious from '../assets/starchild-curious.png'
import creatureCaring from '../assets/starchild-caring.png'

// ─── Types ──────────────────────────────────────────────────────────────────

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

// ─── Mood palettes ──────────────────────────────────────────────────────────

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

function getMoodImage(mood: string): string {
  switch (mood) {
    case 'Ecstatic':
    case 'Happy':
      return creatureHappy
    case 'Restless':
    case 'Curious':
      return creatureCurious
    case 'Hungry':
    case 'Starving':
      return creatureCaring
    case 'Content':
    default:
      return creatureNeutral
  }
}

// Consistent size since all mood images are the same creature
const CREATURE_SIZE = 'h-[80%] max-h-[320px]'

// ─── Stat bar with hover tooltip ─────────────────────────────────────────────

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

// ─── Component ──────────────────────────────────────────────────────────────

export default function StarchildAvatar() {
  const state = useAppStore((s) => s.starchildState)

  const mood   = (state?.mood as Mood) ?? 'Content'
  const hunger = state?.hunger ?? 50
  const level  = state?.level ?? 1
  const xp     = state?.xp ?? 0
  const palette = getPalette(mood)
  const stage  = getStage(level)

  const isStarving = mood === 'Starving'
  const floatDuration = `${3.6 * palette.animSpeed}s`
  const moodImage = getMoodImage(mood)

  return (
    <div className="relative flex flex-col items-center h-full select-none">
      {/* Creature — the living center, takes all available space */}
      <div
        className={`relative flex-1 flex items-center justify-center w-full ${isStarving ? 'creature-pulse' : ''}`}
        style={{
          animation: `creature-float ${floatDuration} ease-in-out infinite, creature-breathe ${Number(floatDuration.replace('s','')) * 1.5}s ease-in-out infinite`,
          transition: 'filter 0.8s ease',
        }}
        aria-label={`Starchild is feeling ${mood}`}
        role="img"
      >
        {/* Ambient glow */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="w-[90%] h-[90%] rounded-full blur-3xl transition-all duration-[2000ms]"
            style={{
              background: `radial-gradient(circle, ${palette.glow} 0%, transparent 60%)`,
              animation: 'glow-pulse 5s ease-in-out infinite',
            }}
          />
        </div>

        {/* Creature image */}
        <img
          src={moodImage}
          alt={`Starchild — ${mood}`}
          className="relative z-10 object-contain transition-all duration-700"
          style={{
            width: '80%',
            maxWidth: '300px',
            filter: `drop-shadow(0 0 20px ${palette.glow}) drop-shadow(0 0 40px ${palette.glow})`,
          }}
          draggable={false}
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
