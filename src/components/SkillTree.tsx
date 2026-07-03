/**
 * SkillTree.tsx — The Vessel
 *
 * A 3×7 alchemical grid visualizing the user's Great Work:
 *   - 3 pillars (Body, Mind, Spirit) as columns
 *   - 7 rings (Calcination → Coagulation) as rows
 *   - 21 cells total, each a (plane × stage) coordinate
 *
 * Cells light up as the user progresses:
 *   - worked: past stages (filled, with checkmark glow)
 *   - active: current stage (pulsing ring)
 *   - unexplored: future stages (dim outline)
 *
 * The Stone (preferential reality) sits at the crown.
 * Quest nodes appear on their plane's current stage cell.
 *
 * Layout (bottom → top):
 *   ★ Your Preferential Reality (the Stone)
 *   │ trunk
 *   ├── Body (mint)    ├── Mind (gold)    ├── Spirit (lavender)
 *   │  Coagulation      │  Coagulation      │  Coagulation
 *   │  Distillation     │  Distillation     │  Distillation
 *   │  Fermentation     │  Fermentation     │  Fermentation
 *   │  Conjunction      │  Conjunction      │  Conjunction
 *   │  Separation       │  Separation       │  Separation
 *   │  Dissolution      │  Dissolution      │  Dissolution
 *   │  Calcination      │  Calcination      │  Calcination
 *   ◇ You Are Here
 */

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { type Quest, type GreatWorkPosition, type Plane, type Stage } from '../store'
import { usePlatform } from '../platform/usePlatform'
import starchildLogo from '../assets/starchild-logo.png'
// @ts-ignore
import videoSkillTree from '../assets/videos/skilltree.webm'
import skilltreeBg from '../assets/skilltree-bg.png'

// ─── Vessel Layout Constants ────────────────────────────────────────────────

const VB_W = 800
const VB_H = 1000

const VISION_Y = 70
const JUNCTION_Y = 220
const CATEGORY_Y = 340
const YOU_Y = 900
const TRUNK_X = VB_W / 2

// 7 stage rows, evenly spaced from CATEGORY_Y + 30 to YOU_Y - 50
const STAGE_ROW_START = CATEGORY_Y + 40
const STAGE_ROW_END = YOU_Y - 60
const STAGE_ROW_SPACING = (STAGE_ROW_END - STAGE_ROW_START) / 6

// The hermetic stage names are the AI's PRIVATE ontology — the user never sees
// "Calcination" (PRD §3). Each maps to an evocative HUMAN label: the shape of
// the inner work, in plain words, as a rising journey of depth.
const STAGES: { key: Stage; label: string; human: string }[] = [
  { key: 'calcination',   label: 'Calcination',   human: 'Facing' },
  { key: 'dissolution',   label: 'Dissolution',   human: 'Releasing' },
  { key: 'separation',    label: 'Separation',    human: 'Discerning' },
  { key: 'conjunction',   label: 'Conjunction',   human: 'Reforming' },
  { key: 'fermentation',  label: 'Fermentation',  human: 'Awakening' },
  { key: 'distillation',  label: 'Distillation',  human: 'Refining' },
  { key: 'coagulation',   label: 'Coagulation',   human: 'Becoming' },
]

const CATEGORIES = [
  { key: 'body' as Plane,   label: 'Body',   color: '#a8d8b8', x: 200 },
  { key: 'mind' as Plane,   label: 'Mind',   color: '#e8d8a8', x: 400 },
  { key: 'spirit' as Plane, label: 'Spirit', color: '#b8a0d8', x: 600 },
] as const

function stageRowY(index: number): number {
  return STAGE_ROW_START + index * STAGE_ROW_SPACING
}

// ─── SVG Helpers ────────────────────────────────────────────────────────────

function GlowFilter({ id, color }: { id: string; color: string }) {
  return (
    <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
      <feFlood floodColor={color} floodOpacity="0.6" result="color" />
      <feComposite in="color" in2="blur" operator="in" result="glow" />
      <feMerge>
        <feMergeNode in="glow" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  )
}

function StarShape({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) {
  const points: string[] = []
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI) / 8 - Math.PI / 2
    const radius = i % 2 === 0 ? r : r * 0.45
    points.push(`${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`)
  }
  return (
    <polygon
      points={points.join(' ')}
      fill={color}
      filter="url(#vision-glow)"
    />
  )
}

// ─── Animated Path ──────────────────────────────────────────────────────────

function AnimatedPath({
  d,
  color,
  delay,
  duration = 0.8,
  width = 2,
  filter,
  extraOpacity,
}: {
  d: string
  color: string
  delay: number
  duration?: number
  width?: number
  filter?: string
  extraOpacity?: number
}) {
  return (
    <motion.path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      filter={filter}
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: extraOpacity ?? 1 }}
      transition={{
        pathLength: { delay, duration, ease: 'easeOut' },
        opacity: { delay, duration: 0.2 },
      }}
    />
  )
}

// ─── Quest Node ─────────────────────────────────────────────────────────────

// Generate particle positions for celebration burst
function celebrationParticles(cx: number, cy: number) {
  const particles = []
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8 + (Math.random() - 0.5) * 0.3
    const dist = 30 + Math.random() * 25
    particles.push({
      tx: cx + Math.cos(angle) * dist,
      ty: cy + Math.sin(angle) * dist,
    })
  }
  return particles
}

function QuestNode({
  cx,
  cy,
  quest,
  color,
  delay,
  celebrating,
  onClick,
}: {
  cx: number
  cy: number
  quest?: Quest
  color: string
  delay: number
  celebrating?: boolean
  onClick?: () => void
}) {
  const status = quest?.status ?? 'locked'
  const isCompleted = status === 'completed'
  const isActive = status === 'active'
  const r = isActive ? 14 : 11

  return (
    <motion.g
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{
        scale: { delay, type: 'spring', stiffness: 200, damping: 15 },
        opacity: { delay, duration: 0.2 },
      }}
      style={{ cursor: quest ? 'pointer' : 'default', transformOrigin: `${cx}px ${cy}px` }}
      onClick={onClick}
    >
      {/* Celebration burst — particles + glow */}
      {celebrating && (
        <>
          {/* Expanding glow ring */}
          <motion.circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={3}
            initial={{ scale: 1, opacity: 0.9 }}
            animate={{ scale: 3.5, opacity: 0 }}
            transition={{ duration: 1, ease: 'easeOut' }}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />
          {/* Particles flying outward */}
          {celebrationParticles(cx, cy).map((p, i) => (
            <motion.circle
              key={`particle-${i}`}
              r={2.5}
              fill={color}
              initial={{ cx, cy, opacity: 1 }}
              animate={{ cx: p.tx, cy: p.ty, opacity: 0 }}
              transition={{ duration: 0.8, delay: i * 0.03, ease: 'easeOut' }}
            />
          ))}
        </>
      )}

      {/* Outer glow ring for active quests — continuous breathe */}
      {isActive && !celebrating && (
        <motion.circle
          cx={cx}
          cy={cy}
          r={r + 6}
          fill="none"
          stroke={color}
          strokeWidth={1}
          animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.08, 0.3] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />
      )}

      {/* Node circle — pulse on celebration */}
      <motion.circle
        cx={cx}
        cy={cy}
        r={r}
        fill={isCompleted || celebrating ? color : 'transparent'}
        stroke={color}
        strokeWidth={isCompleted || celebrating ? 0 : 1.5}
        opacity={quest ? (isCompleted || celebrating ? 1 : isActive ? 0.9 : 0.35) : 0.15}
        animate={celebrating ? { scale: [1, 1.5, 1] } : {}}
        transition={celebrating ? { duration: 0.6, ease: 'easeOut' } : {}}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      />

      {/* Completed checkmark */}
      {(isCompleted || celebrating) && (
        <motion.path
          d={`M${cx - 5},${cy} L${cx - 1},${cy + 4} L${cx + 6},${cy - 4}`}
          fill="none"
          stroke="#1a1525"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={celebrating ? { opacity: 0, pathLength: 0 } : {}}
          animate={celebrating ? { opacity: 1, pathLength: 1 } : {}}
          transition={celebrating ? { duration: 0.4, delay: 0.3 } : {}}
        />
      )}

      {/* Inner dot for active */}
      {isActive && !celebrating && (
        <motion.circle
          cx={cx}
          cy={cy}
          r={4}
          fill={color}
          opacity={0.8}
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />
      )}

      {/* Quest title label */}
      {quest && (isActive || isCompleted) && (
        <text
          x={cx}
          y={cy + r + 18}
          textAnchor="middle"
          fill={color}
          fontSize={11}
          fontFamily="Nunito, sans-serif"
          fontWeight={600}
          opacity={0.85}
        >
          {quest.title.length > 18 ? quest.title.slice(0, 16) + '...' : quest.title}
        </text>
      )}
    </motion.g>
  )
}

// ─── Category Label ─────────────────────────────────────────────────────────

function CategoryLabel({
  x,
  y,
  label,
  color,
  count,
  completed,
  total,
  delay,
}: {
  x: number
  y: number
  label: string
  color: string
  count: number
  completed: number
  total: number
  delay: number
}) {
  const springTransition = {
    type: 'spring' as const,
    stiffness: 180,
    damping: 14,
    delay,
  }

  return (
    <motion.g
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{
        scale: springTransition,
        opacity: { delay, duration: 0.2 },
      }}
      style={{ transformOrigin: `${x}px ${y}px` }}
    >
      {/* Category diamond — rotates in from 45deg */}
      <motion.polygon
        points={`${x},${y - 12} ${x + 12},${y} ${x},${y + 12} ${x - 12},${y}`}
        fill={color}
        opacity={0.9}
        filter={`url(#glow-${label.toLowerCase()})`}
        initial={{ rotate: 45 }}
        animate={{ rotate: 0 }}
        transition={springTransition}
        style={{ transformOrigin: `${x}px ${y}px` }}
      />

      {/* Label text */}
      <text
        x={x}
        y={y - 22}
        textAnchor="middle"
        fill={color}
        fontSize={13}
        fontFamily="Nunito, sans-serif"
        fontWeight={700}
        letterSpacing="0.05em"
      >
        {label.toUpperCase()}
      </text>

      {/* Quest count */}
      {count > 0 && (
        <text
          x={x}
          y={y + 30}
          textAnchor="middle"
          fill={color}
          fontSize={10}
          fontFamily="Nunito, sans-serif"
          opacity={0.5}
        >
          {count} quest{count !== 1 ? 's' : ''}
        </text>
      )}

      {/* Progress arc */}
      {total > 0 && (
        <g>
          <circle
            cx={x}
            cy={y}
            r={18}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            opacity={0.15}
          />
          <motion.circle
            cx={x}
            cy={y}
            r={18}
            fill="none"
            stroke={color}
            strokeWidth={2}
            opacity={0.7}
            strokeLinecap="round"
            initial={{ strokeDasharray: '0 113' }}
            animate={{ strokeDasharray: `${(completed / total) * 113} 113` }}
            transition={{ delay: delay + 0.3, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            style={{
              strokeDashoffset: 28.25,
              transformOrigin: `${x}px ${y}px`,
            }}
          />
        </g>
      )}
    </motion.g>
  )
}

// ─── Vision Crown ───────────────────────────────────────────────────────────

function VisionCrown({ text }: { text: string }) {
  const lines = useMemo(() => {
    if (!text) return ['your preferential reality']
    const words = text.split(' ')
    const result: string[] = []
    let current = ''
    for (const word of words) {
      if ((current + ' ' + word).trim().length > 32) {
        result.push(current.trim())
        current = word
      } else {
        current = current ? current + ' ' + word : word
      }
    }
    if (current.trim()) result.push(current.trim())
    return result.slice(0, 3)
  }, [text])

  const starSpring = {
    type: 'spring' as const,
    stiffness: 120,
    damping: 12,
    delay: 0,
  }

  return (
    <g>
      {/* Ambient glow — fades in over 1s */}
      <motion.circle
        cx={TRUNK_X}
        cy={VISION_Y}
        r={60}
        fill="url(#vision-radial)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ delay: 0, duration: 1 }}
      />

      {/* Ambient glow continuous breathe */}
      <motion.circle
        cx={TRUNK_X}
        cy={VISION_Y}
        r={60}
        fill="url(#vision-radial)"
        animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut', delay: 1 }}
        style={{ transformOrigin: `${TRUNK_X}px ${VISION_Y}px` }}
      />

      {/* Star — springs in from scale 0 */}
      <motion.g
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{
          scale: starSpring,
          opacity: { delay: 0, duration: 0.3 },
        }}
        style={{ transformOrigin: `${TRUNK_X}px ${VISION_Y}px` }}
      >
        <StarShape cx={TRUNK_X} cy={VISION_Y} r={22} color="#e8d8a8" />
      </motion.g>

      {/* Vision text lines — staggered fade-in */}
      {lines.map((line, i) => (
        <motion.text
          key={i}
          x={TRUNK_X}
          y={VISION_Y + 40 + i * 18}
          textAnchor="middle"
          fill="#ede8f5"
          fontSize={12}
          fontFamily="Nunito, sans-serif"
          fontWeight={500}
          fontStyle="italic"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.75 }}
          transition={{ delay: 0.5 + i * 0.15, duration: 0.6 }}
        >
          {line}
        </motion.text>
      ))}
    </g>
  )
}

// ─── You Are Here ───────────────────────────────────────────────────────────

function YouMarker() {
  return (
    <motion.g
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{
        scale: { delay: 2.2, type: 'spring', stiffness: 150, damping: 12 },
        opacity: { delay: 2.2, duration: 0.2 },
      }}
      style={{ transformOrigin: `${TRUNK_X}px ${YOU_Y}px` }}
    >
      {/* Ambient glow — breathes continuously */}
      <motion.circle
        cx={TRUNK_X}
        cy={YOU_Y}
        r={24}
        fill="url(#you-radial)"
        animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.6, 0.4] }}
        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
        style={{ transformOrigin: `${TRUNK_X}px ${YOU_Y}px` }}
      />

      {/* Diamond — pulses with subtle scale */}
      <motion.polygon
        points={`${TRUNK_X},${YOU_Y - 14} ${TRUNK_X + 14},${YOU_Y} ${TRUNK_X},${YOU_Y + 14} ${TRUNK_X - 14},${YOU_Y}`}
        fill="#b8a0d8"
        opacity={0.9}
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
        style={{ transformOrigin: `${TRUNK_X}px ${YOU_Y}px` }}
      />

      {/* Label */}
      <text
        x={TRUNK_X}
        y={YOU_Y + 36}
        textAnchor="middle"
        fill="#b8a0d8"
        fontSize={11}
        fontFamily="Nunito, sans-serif"
        fontWeight={700}
        letterSpacing="0.1em"
        opacity={0.7}
      >
        YOU ARE HERE
      </text>
    </motion.g>
  )
}

// ─── Quest Detail Popup ─────────────────────────────────────────────────────

function QuestPopup({
  quest,
  color,
  onClose,
}: {
  quest: Quest
  color: string
  onClose: () => void
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Card */}
      <motion.div
        className="relative z-10 max-w-sm w-full mx-6 p-6 rounded-2xl clay-elevated"
        style={{
          backgroundColor: 'rgba(42, 36, 56, 0.95)',
          border: `1px solid ${color}40`,
          boxShadow: `0 0 40px ${color}20`,
        }}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
          />
          <span
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color }}
          >
            {quest.quest_type} quest
          </span>
          <div className="flex-1" />
          <span className="text-[10px] font-semibold" style={{ color: '#a8d8b8' }}>
            +{quest.xp_reward} XP
          </span>
        </div>

        <h3 className="text-lg font-semibold mb-2" style={{ color: '#ede8f5' }}>
          {quest.title}
        </h3>

        {quest.description && (
          <p className="text-sm leading-relaxed mb-4" style={{ color: '#a89ec0' }}>
            {quest.description}
          </p>
        )}

        <div className="flex items-center gap-3 text-xs" style={{ color: '#6e6485' }}>
          {quest.streak_count > 0 && (
            <span>{quest.streak_count} day streak</span>
          )}
          <span>
            {quest.status === 'completed' ? 'completed' : 'in progress'}
          </span>
        </div>

        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full transition-opacity hover:opacity-70"
          style={{ color: '#6e6485' }}
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
          </svg>
        </button>
      </motion.div>
    </motion.div>
  )
}

// ─── Main SkillTree Component ───────────────────────────────────────────────

export default function SkillTree({ onBack, showIntro = false }: { onBack: () => void; showIntro?: boolean }) {
  const platform = usePlatform()
  const [quests, setQuests] = useState<Quest[]>([])
  const [preferentialReality, setPreferentialReality] = useState('')
  const [greatWork, setGreatWork] = useState<GreatWorkPosition | null>(null)
  const [selectedQuest, setSelectedQuest] = useState<{ quest: Quest; color: string } | null>(null)
  const [celebratingQuestId, setCelebratingQuestId] = useState<string | null>(null)
  const [celebrationXp, setCelebrationXp] = useState<number | null>(null)

  // Video intro — only plays on first-ever reveal (Crystallize), not on manual nav or quest accept
  const [showVideoIntro, setShowVideoIntro] = useState(showIntro)
  // Cinematic SVG reveal: zoom star → pull back to full tree → auto-dismiss
  const [revealPhase, setRevealPhase] = useState<'star' | 'tree' | 'done'>('star')

  useEffect(() => {
    if (!showVideoIntro) return
    const timer = setTimeout(() => setShowVideoIntro(false), 5200)
    return () => clearTimeout(timer)
  }, [showVideoIntro])

  // Reveal sequence starts after video fades out
  useEffect(() => {
    if (showVideoIntro) return

    if (showIntro) {
      // Cinematic first reveal: zoom star → pull back → auto-dismiss
      const treeTimer = setTimeout(() => setRevealPhase('tree'), 2000)
      const dismissTimer = setTimeout(() => {
        setRevealPhase('done')
        onBack()
      }, 10000)
      return () => { clearTimeout(treeTimer); clearTimeout(dismissTimer) }
    } else {
      // Manual navigation or quest acceptance: show full tree immediately, no auto-dismiss
      setRevealPhase('done')
    }
  }, [showVideoIntro, showIntro, onBack])

  // Load data
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [active, completed] = await Promise.all([
          platform.getQuests('active'),
          platform.getQuests('completed'),
        ])
        if (!cancelled) setQuests([...active, ...completed])
      } catch {
        // ignore — web ships an empty quest set until the quest engine is ported
      }

      try {
        // Prefer the AI-synthesized vision, fall back to raw preferential reality
        const vision = await platform.getSetting('vision_statement')
        if (!cancelled && vision) {
          setPreferentialReality(vision)
        } else {
          const pr = await platform.getSetting('preferential_reality')
          if (!cancelled && pr) setPreferentialReality(pr)
        }
      } catch {
        // ignore
      }

      try {
        const gw = await platform.getGreatWorkPosition()
        if (!cancelled) setGreatWork(gw)
      } catch {
        // Great Work not yet initialized
      }
    }

    load()
    // Reload when quests change (accepted from conversation or completed).
    // On web `subscribe` is a no-op, so these simply never fire — the tree still
    // renders from the initial `load()` with a graceful empty state.
    const unsubAccepted = platform.subscribe('quest-accepted', () => { load() })
    const unsubCelebration = platform.subscribe('quest-celebration', (payload) => {
      load()
      // Trigger celebration animation
      const p = payload as { quest_id: string; xp_reward?: number }
      setCelebratingQuestId(p.quest_id)
      if (p.xp_reward) setCelebrationXp(p.xp_reward)
      setTimeout(() => { setCelebratingQuestId(null); setCelebrationXp(null) }, 3000)
    })
    return () => { cancelled = true; unsubAccepted(); unsubCelebration() }
  }, [platform])

  // Map quests by plane for cell placement
  const questsByPlane = useMemo(() => {
    const grouped: Record<Plane, Quest[]> = { body: [], mind: [], spirit: [] }
    for (const q of quests) {
      const cat = (q.category as Plane) || 'spirit'
      if (grouped[cat]) grouped[cat].push(q)
    }
    return grouped
  }, [quests])

  // Determine cell state from Great Work position
  const cellState = useMemo(() => {
    const states: Record<string, 'worked' | 'active' | 'unexplored'> = {}
    for (const cat of CATEGORIES) {
      const planePos = greatWork?.planes.find((p) => p.plane === cat.key)
      const currentStageIdx = planePos ? STAGES.findIndex((s) => s.key === planePos.stage) : -1
      STAGES.forEach((stage, idx) => {
        const key = `${cat.key}-${stage.key}`
        if (planePos && idx < currentStageIdx) {
          states[key] = 'worked'
        } else if (planePos && idx === currentStageIdx) {
          states[key] = 'active'
        } else {
          states[key] = 'unexplored'
        }
      })
    }
    return states
  }, [greatWork])

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Video intro — plays once then crossfades to SVG tree */}
      <div
        className="absolute inset-0 z-50 transition-opacity duration-1000 ease-in-out"
        style={{
          opacity: showVideoIntro ? 1 : 0,
          pointerEvents: showVideoIntro ? 'auto' : 'none',
          WebkitMaskImage: 'radial-gradient(ellipse 75% 70% at 50% 50%, black 40%, transparent 90%)',
          maskImage: 'radial-gradient(ellipse 75% 70% at 50% 50%, black 40%, transparent 90%)',
        }}
      >
        <video
          src={videoSkillTree}
          autoPlay
          muted
          playsInline
          loop
          className="absolute inset-0 w-full h-full object-contain"
        />
      </div>

      {/* Dedicated skill tree background */}
      <div className="absolute inset-0" aria-hidden="true">
        <img
          src={skilltreeBg}
          alt=""
          className="w-full h-full object-cover opacity-60"
          draggable={false}
        />
      </div>

      {/* Darkening overlay */}
      <div
        className="absolute inset-0 z-[1]"
        style={{
          background: 'radial-gradient(ellipse at center 20%, rgba(26,21,37,0.5) 0%, rgba(26,21,37,0.85) 100%)',
        }}
      />

      {/* Logo */}
      <div className="absolute top-3 left-4 z-40">
        <img
          src={starchildLogo}
          alt="Starchild"
          className="h-28 w-auto object-contain"
          style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.6))' }}
          draggable={false}
        />
      </div>

      {/* Back button — claymorphic with hover/tap spring */}
      <motion.button
        onClick={onBack}
        className="absolute top-3 right-3 z-40 flex items-center justify-center w-9 h-9 rounded-xl clay-nav-button backdrop-blur-sm"
        style={{
          color: 'var(--text-muted)',
          backgroundColor: 'rgba(26, 21, 37, 0.6)',
          border: '1px solid var(--outline)',
        }}
        aria-label="Back to chat"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-[18px] h-[18px]"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </motion.button>

      {/* Title — fade + slide down */}
      <motion.h1
        className="absolute top-5 left-1/2 -translate-x-1/2 z-30 text-center text-sm font-bold uppercase tracking-[0.2em]"
        style={{ color: 'var(--accent-gold)', textShadow: '0 0 20px rgba(232,216,168,0.3)' }}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5, ease: 'easeOut' }}
      >
        Your Journey
      </motion.h1>

      {/* The Tree (SVG) — cinematic zoom reveal */}
      <div
        className="absolute inset-0 z-10 flex items-center justify-center p-4 pt-16"
        style={{
          // Zoom: start zoomed into the star (top center), pull back to full view
          transform: revealPhase === 'star'
            ? 'scale(3) translateY(30%)'
            : 'scale(1) translateY(0%)',
          transformOrigin: '50% 10%',
          transition: 'transform 2.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }}
      >
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="w-full h-full max-w-2xl"
          preserveAspectRatio="xMidYMid meet"
          style={{ overflow: 'visible' }}
        >
          {/* ── Definitions ──────────────────────────────────────────── */}
          <defs>
            <GlowFilter id="vision-glow" color="#e8d8a8" />
            {CATEGORIES.map((cat) => (
              <GlowFilter key={cat.key} id={`glow-${cat.label.toLowerCase()}`} color={cat.color} />
            ))}
            <radialGradient id="vision-radial" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#e8d8a8" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#e8d8a8" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="you-radial" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#b8a0d8" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#b8a0d8" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* ── Trunk — Vision → Junction ────────────────────────────── */}
          <AnimatedPath
            d={`M${TRUNK_X},${VISION_Y + 25} L${TRUNK_X},${JUNCTION_Y}`}
            color="#4a3f60"
            delay={0.3}
            duration={0.6}
            width={2.5}
          />

          {/* ── Trunk — Junction → You ───────────────────────────────── */}
          <AnimatedPath
            d={`M${TRUNK_X},${JUNCTION_Y} L${TRUNK_X},${YOU_Y - 20}`}
            color="#4a3f60"
            delay={0.6}
            duration={1.0}
            width={2}
          />

          {/* ── Branches — Junction → Pillars ─────────────────────────── */}
          {CATEGORIES.map((cat, i) => {
            const midY = JUNCTION_Y + (CATEGORY_Y - JUNCTION_Y) * 0.5
            const planePos = greatWork?.planes.find((p) => p.plane === cat.key)
            const workedCount = planePos?.cells_worked.length ?? 0
            const hasProgress = workedCount > 0
            const growthOpacity = hasProgress ? 0.3 + (workedCount / 7) * 0.7 : 0.15
            const growthWidth = hasProgress ? 1.5 + (workedCount / 7) * 2.0 : 1.5
            const branchPath = `M${TRUNK_X},${JUNCTION_Y} Q${(TRUNK_X + cat.x) / 2},${midY} ${cat.x},${CATEGORY_Y}`

            return (
              <g key={`branch-${cat.key}`}>
                {hasProgress && (
                  <AnimatedPath
                    d={branchPath}
                    color={cat.color}
                    delay={1.2 + i * 0.15}
                    duration={0.5}
                    width={growthWidth + 4}
                    filter={`url(#glow-${cat.label.toLowerCase()})`}
                    extraOpacity={growthOpacity * 0.15}
                  />
                )}
                <AnimatedPath
                  d={branchPath}
                  color={cat.color + (hasProgress ? '' : '60')}
                  delay={1.2 + i * 0.15}
                  duration={0.5}
                  width={growthWidth}
                />
              </g>
            )
          })}

          {/* ── Pillar vertical lines (7 stages) ──────────────────────── */}
          {CATEGORIES.map((cat, catIdx) => (
            <AnimatedPath
              key={`pillar-${cat.key}`}
              d={`M${cat.x},${CATEGORY_Y + 12} L${cat.x},${stageRowY(6)}`}
              color={cat.color + '20'}
              delay={1.8 + catIdx * 0.12}
              duration={0.6}
              width={1}
            />
          ))}

          {/* ── 21 Cells (3 planes × 7 stages) ────────────────────────── */}
          {CATEGORIES.map((cat, catIdx) =>
            STAGES.map((stage, stageIdx) => {
              const cy = stageRowY(stageIdx)
              const key = `${cat.key}-${stage.key}`
              const state = cellState[key] ?? 'unexplored'
              const planeQuests = questsByPlane[cat.key] || []
              // Show quest on the active cell
              const quest = state === 'active' ? planeQuests[0] : undefined
              const isActive = state === 'active'
              const isWorked = state === 'worked'
              const r = isActive ? 14 : 10

              return (
                <motion.g
                  key={`cell-${key}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    scale: { delay: 2.0 + catIdx * 0.1 + stageIdx * 0.08, type: 'spring', stiffness: 200, damping: 15 },
                    opacity: { delay: 2.0 + catIdx * 0.1 + stageIdx * 0.08, duration: 0.2 },
                  }}
                  style={{ cursor: quest ? 'pointer' : 'default', transformOrigin: `${cat.x}px ${cy}px` }}
                  onClick={quest ? () => setSelectedQuest({ quest, color: cat.color }) : undefined}
                >
                  {/* Celebration burst */}
                  {quest?.id === celebratingQuestId && (
                    <>
                      <motion.circle
                        cx={cat.x}
                        cy={cy}
                        r={r}
                        fill="none"
                        stroke={cat.color}
                        strokeWidth={3}
                        initial={{ scale: 1, opacity: 0.9 }}
                        animate={{ scale: 3.5, opacity: 0 }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                        style={{ transformOrigin: `${cat.x}px ${cy}px` }}
                      />
                      {celebrationParticles(cat.x, cy).map((p, i) => (
                        <motion.circle
                          key={`p-${i}`}
                          r={2.5}
                          fill={cat.color}
                          initial={{ cx: cat.x, cy, opacity: 1 }}
                          animate={{ cx: p.tx, cy: p.ty, opacity: 0 }}
                          transition={{ duration: 0.8, delay: i * 0.03, ease: 'easeOut' }}
                        />
                      ))}
                    </>
                  )}

                  {/* Active breathe ring */}
                  {isActive && quest?.id !== celebratingQuestId && (
                    <motion.circle
                      cx={cat.x}
                      cy={cy}
                      r={r + 6}
                      fill="none"
                      stroke={cat.color}
                      strokeWidth={1}
                      animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.08, 0.3] }}
                      transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
                      style={{ transformOrigin: `${cat.x}px ${cy}px` }}
                    />
                  )}

                  {/* Cell circle */}
                  <motion.circle
                    cx={cat.x}
                    cy={cy}
                    r={r}
                    fill={isWorked || quest?.id === celebratingQuestId ? cat.color : 'transparent'}
                    stroke={cat.color}
                    strokeWidth={isWorked ? 0 : 1.5}
                    opacity={isWorked ? 0.9 : isActive ? 0.9 : 0.2}
                  />

                  {/* Worked checkmark */}
                  {isWorked && (
                    <motion.path
                      d={`M${cat.x - 5},${cy} L${cat.x - 1},${cy + 4} L${cat.x + 6},${cy - 4}`}
                      fill="none"
                      stroke="#1a1525"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* Active inner dot */}
                  {isActive && !isWorked && (
                    <motion.circle
                      cx={cat.x}
                      cy={cy}
                      r={4}
                      fill={cat.color}
                      opacity={0.8}
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                      style={{ transformOrigin: `${cat.x}px ${cy}px` }}
                    />
                  )}

                  {/* Quest title on active cell */}
                  {quest && (isActive) && (
                    <text
                      x={cat.x}
                      y={cy + r + 18}
                      textAnchor="middle"
                      fill={cat.color}
                      fontSize={10}
                      fontFamily="Nunito, sans-serif"
                      fontWeight={600}
                      opacity={0.85}
                    >
                      {quest.title.length > 16 ? quest.title.slice(0, 14) + '...' : quest.title}
                    </text>
                  )}

                </motion.g>
              )
            })
          )}

          {/* ── Stage axis (left edge) — the 7 depths, in human words ─────── */}
          {STAGES.map((stage, i) => {
            const cy = stageRowY(i)
            // A row "glows" when any plane currently sits on it.
            const activeHere = CATEGORIES.some((cat) => {
              const pos = greatWork?.planes.find((p) => p.plane === cat.key)
              return pos?.stage === stage.key
            })
            return (
              <motion.g
                key={`axis-${stage.key}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 2.2 + i * 0.06, duration: 0.4 }}
              >
                {/* faint guide dash into the grid */}
                <line
                  x1={92} y1={cy} x2={CATEGORIES[0].x - 26} y2={cy}
                  stroke={activeHere ? '#b8a0d8' : '#4a3f60'}
                  strokeWidth={1}
                  strokeDasharray="2 5"
                  opacity={activeHere ? 0.5 : 0.22}
                />
                <text
                  x={86} y={cy + 4}
                  textAnchor="end"
                  fill={activeHere ? '#cbb8e6' : '#6e6485'}
                  fontSize={12.5}
                  fontFamily="Nunito, sans-serif"
                  fontWeight={activeHere ? 800 : 600}
                  opacity={activeHere ? 1 : 0.6}
                  style={activeHere ? { filter: 'drop-shadow(0 0 6px rgba(184,160,216,0.5))' } : undefined}
                >
                  {stage.human}
                </text>
              </motion.g>
            )
          })}

          {/* ── Vision Crown ──────────────────────────────────────────── */}
          <VisionCrown text={preferentialReality} />

          {/* ── Pillar Labels ─────────────────────────────────────────── */}
          {CATEGORIES.map((cat, i) => {
            const planePos = greatWork?.planes.find((p) => p.plane === cat.key)
            const workedCount = planePos?.cells_worked.length ?? 0
            return (
              <CategoryLabel
                key={`cat-${cat.key}`}
                x={cat.x}
                y={CATEGORY_Y}
                label={cat.label}
                color={cat.color}
                count={workedCount}
                completed={workedCount}
                total={7}
                delay={1.6 + i * 0.15}
              />
            )
          })}

          {/* ── You Are Here ──────────────────────────────────────────── */}
          <YouMarker />
        </svg>
      </div>

      {/* Quest detail popup — AnimatePresence for mount/unmount transitions */}
      <AnimatePresence>
        {selectedQuest && (
          <QuestPopup
            key="quest-popup"
            quest={selectedQuest.quest}
            color={selectedQuest.color}
            onClose={() => setSelectedQuest(null)}
          />
        )}

        {/* XP gain celebration overlay */}
        {celebrationXp && (
          <motion.div
            key="xp-celebration"
            className="fixed inset-0 flex items-center justify-center pointer-events-none z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="text-center"
              initial={{ scale: 0.5, y: 20 }}
              animate={{ scale: 1, y: -40 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            >
              <motion.p
                className="text-4xl font-bold"
                style={{ color: 'var(--accent-mint)', textShadow: '0 0 30px rgba(168,216,184,0.5)' }}
                animate={{ opacity: [1, 1, 0] }}
                transition={{ duration: 2.5, times: [0, 0.6, 1] }}
              >
                +{celebrationXp} XP
              </motion.p>
              <motion.p
                className="text-sm font-medium mt-1"
                style={{ color: 'var(--accent-lavender)' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 2.5, times: [0, 0.3, 1] }}
              >
                quest complete ✦
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
