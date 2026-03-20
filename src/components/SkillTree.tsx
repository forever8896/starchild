/**
 * SkillTree.tsx — The Constellation Map
 *
 * A living, animated skill tree that visualizes the user's journey
 * from where they are to their preferential reality (vision).
 *
 * The vision appears first at the crown, then branches materialize
 * downward — each one a domain of growth. Quest nodes light up
 * along the branches as the user progresses.
 *
 * Layout (bottom → top):
 *   ◇ You Are Here
 *   │ trunk
 *   ├── Body (mint)
 *   ├── Purpose (sky)
 *   ├── Mind (gold)
 *   ├── Heart (rose)
 *   └── Spirit (lavender)
 *   │ trunk
 *   ★ Your Preferential Reality
 *
 * Animations: framer-motion (pathLength for lines, spring pops for nodes)
 * All elements animate on mount — no `revealed` toggle needed.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { invoke } from '@tauri-apps/api/core'
import { type Quest } from '../store'
import starchildLogo from '../assets/starchild-logo.png'
// @ts-ignore
import videoSkillTree from '../assets/videos/skilltree.mp4'
import skilltreeBg from '../assets/skilltree-bg.png'

// ─── Tree Layout Constants ──────────────────────────────────────────────────

const VB_W = 800
const VB_H = 1000

const VISION_Y = 70
const JUNCTION_Y = 220
const CATEGORY_Y = 340
const QUEST_T1_Y = 470
const QUEST_T2_Y = 590
const QUEST_T3_Y = 700
const YOU_Y = 900
const TRUNK_X = VB_W / 2

const CATEGORIES = [
  { key: 'health',        label: 'Body',    color: '#a8d8b8', x: 100 },
  { key: 'career',        label: 'Purpose', color: '#a8c8e8', x: 250 },
  { key: 'learning',      label: 'Mind',    color: '#e8d8a8', x: 400 },
  { key: 'relationships', label: 'Heart',   color: '#e8a8b8', x: 550 },
  { key: 'creative',      label: 'Spirit',  color: '#b8a0d8', x: 700 },
] as const

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

function QuestNode({
  cx,
  cy,
  quest,
  color,
  delay,
  onClick,
}: {
  cx: number
  cy: number
  quest?: Quest
  color: string
  delay: number
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
      {/* Outer glow ring for active quests — continuous breathe */}
      {isActive && (
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

      {/* Node circle */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={isCompleted ? color : 'transparent'}
        stroke={color}
        strokeWidth={isCompleted ? 0 : 1.5}
        opacity={quest ? (isCompleted ? 1 : isActive ? 0.9 : 0.35) : 0.15}
      />

      {/* Completed checkmark */}
      {isCompleted && (
        <path
          d={`M${cx - 5},${cy} L${cx - 1},${cy + 4} L${cx + 6},${cy - 4}`}
          fill="none"
          stroke="#1a1525"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Inner dot for active */}
      {isActive && (
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

interface JourneyProof {
  user_hash: string
  journey_root: string
  quest_count: number
  streak: number
  anchored: boolean
  last_anchor_tx: string | null
}

export default function SkillTree({ onBack }: { onBack: () => void }) {
  const [quests, setQuests] = useState<Quest[]>([])
  const [preferentialReality, setPreferentialReality] = useState('')
  const [selectedQuest, setSelectedQuest] = useState<{ quest: Quest; color: string } | null>(null)
  const [journeyProof, setJourneyProof] = useState<JourneyProof | null>(null)
  const [isAnchoring, setIsAnchoring] = useState(false)
  const [anchorResult, setAnchorResult] = useState<string | null>(null)

  // Video intro state — plays skilltree.mp4 then crossfades to SVG tree
  const [showVideoIntro, setShowVideoIntro] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)

  const dismissVideo = useCallback(() => {
    setShowVideoIntro(false)
  }, [])

  // Fallback: if video fails to play or onEnded never fires, dismiss after 8s
  useEffect(() => {
    if (!showVideoIntro) return
    const fallback = setTimeout(dismissVideo, 8000)
    return () => clearTimeout(fallback)
  }, [showVideoIntro, dismissVideo])

  // Try to force-play the video (autoPlay can silently fail)
  useEffect(() => {
    if (!showVideoIntro || !videoRef.current) return
    videoRef.current.play().catch(() => {
      // autoplay blocked — skip straight to SVG tree
      dismissVideo()
    })
  }, [showVideoIntro, dismissVideo])

  // Load data
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [active, completed] = await Promise.all([
          invoke<Quest[]>('get_quests', { status: 'active' }),
          invoke<Quest[]>('get_quests', { status: 'completed' }),
        ])
        if (!cancelled) setQuests([...active, ...completed])
      } catch {
        // ignore
      }

      try {
        // Prefer the AI-synthesized vision, fall back to raw preferential reality
        const vision = await invoke<string | null>('get_setting', { key: 'vision_statement' })
        if (!cancelled && vision) {
          setPreferentialReality(vision)
        } else {
          const pr = await invoke<string | null>('get_setting', { key: 'preferential_reality' })
          if (!cancelled && pr) setPreferentialReality(pr)
        }
      } catch {
        // ignore
      }

      // Load journey proof / attestation status
      try {
        const proof = await invoke<JourneyProof>('get_journey_proof')
        if (!cancelled) setJourneyProof(proof)
      } catch {
        // ignore — attestation features may not be available
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  const handleAnchorJourney = async () => {
    setIsAnchoring(true)
    setAnchorResult(null)
    try {
      const txHash = await invoke<string>('anchor_journey_onchain')
      setAnchorResult(txHash)
      // Refresh the proof
      const proof = await invoke<JourneyProof>('get_journey_proof')
      setJourneyProof(proof)
    } catch (err) {
      setAnchorResult(`error: ${err}`)
    } finally {
      setIsAnchoring(false)
    }
  }

  // Group quests by category
  const questsByCategory = useMemo(() => {
    const grouped: Record<string, Quest[]> = {}
    for (const cat of CATEGORIES) {
      grouped[cat.key] = quests
        .filter((q) => q.category === cat.key)
        .slice(0, 3)
    }
    return grouped
  }, [quests])

  // Compute branch progress
  const branchProgress = useMemo(() => {
    const progress: Record<string, { completed: number; total: number; ratio: number }> = {}
    for (const cat of CATEGORIES) {
      const catQuests = quests.filter((q) => q.category === cat.key)
      const completed = catQuests.filter((q) => q.status === 'completed').length
      const total = catQuests.length
      progress[cat.key] = {
        completed,
        total,
        ratio: total > 0 ? completed / total : 0,
      }
    }
    return progress
  }, [quests])

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* ── Video intro layer — plays skilltree.mp4 then crossfades to SVG ── */}
      <AnimatePresence>
        {showVideoIntro && (
          <motion.div
            key="tree-video-intro"
            className="absolute inset-0 z-50"
            style={{ backgroundColor: '#000' }}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: 'easeInOut' }}
          >
            <video
              ref={videoRef}
              src={videoSkillTree}
              autoPlay
              muted
              playsInline
              onEnded={dismissVideo}
              onError={dismissVideo}
              onStalled={() => {
                // Video got stuck — skip to SVG after 2s grace period
                setTimeout(dismissVideo, 2000)
              }}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* The Tree (SVG) */}
      <div className="absolute inset-0 z-10 flex items-center justify-center p-4 pt-16">
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

          {/* ── Phase 2: Trunk — Vision → Junction ───────────────────── */}
          <AnimatedPath
            d={`M${TRUNK_X},${VISION_Y + 25} L${TRUNK_X},${JUNCTION_Y}`}
            color="#4a3f60"
            delay={0.3}
            duration={0.6}
            width={2.5}
          />

          {/* ── Phase 2: Trunk — Junction → You ──────────────────────── */}
          <AnimatedPath
            d={`M${TRUNK_X},${JUNCTION_Y} L${TRUNK_X},${YOU_Y - 20}`}
            color="#4a3f60"
            delay={0.6}
            duration={1.0}
            width={2}
          />

          {/* ── Phase 3: Branches — Junction → Category nodes ─────────── */}
          {CATEGORIES.map((cat, i) => {
            const midY = JUNCTION_Y + (CATEGORY_Y - JUNCTION_Y) * 0.5
            const progress = branchProgress[cat.key]
            const hasQuests = progress && progress.total > 0
            const growthOpacity = hasQuests
              ? 0.3 + progress.ratio * 0.7
              : 0.15
            const growthWidth = hasQuests
              ? 1.5 + progress.ratio * 2.0
              : 1.5
            const branchPath = `M${TRUNK_X},${JUNCTION_Y} Q${(TRUNK_X + cat.x) / 2},${midY} ${cat.x},${CATEGORY_Y}`

            return (
              <g key={`branch-${cat.key}`}>
                {/* Branch glow layer (progress-driven opacity + width) */}
                {hasQuests && (
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
                {/* Main branch */}
                <AnimatedPath
                  d={branchPath}
                  color={cat.color + (hasQuests ? '' : '60')}
                  delay={1.2 + i * 0.15}
                  duration={0.5}
                  width={growthWidth}
                />
              </g>
            )
          })}

          {/* ── Quest connection lines ────────────────────────────────── */}
          {CATEGORIES.map((cat, catIdx) => {
            const tiers = [QUEST_T1_Y, QUEST_T2_Y, QUEST_T3_Y]
            const lines: React.ReactElement[] = []

            lines.push(
              <AnimatedPath
                key={`qline-${cat.key}-0`}
                d={`M${cat.x},${CATEGORY_Y + 12} L${cat.x},${tiers[0]}`}
                color={cat.color + '30'}
                delay={2.0 + catIdx * 0.12}
                duration={0.4}
                width={1}
              />
            )

            for (let t = 0; t < 2; t++) {
              lines.push(
                <AnimatedPath
                  key={`qline-${cat.key}-${t + 1}`}
                  d={`M${cat.x},${tiers[t] + 14} L${cat.x},${tiers[t + 1]}`}
                  color={cat.color + '20'}
                  delay={2.3 + catIdx * 0.12 + t * 0.15}
                  duration={0.3}
                  width={1}
                />
              )
            }

            return <g key={`qlines-${cat.key}`}>{lines}</g>
          })}

          {/* ── Phase 1: Vision Crown ─────────────────────────────────── */}
          <VisionCrown text={preferentialReality} />

          {/* ── Phase 4: Category Labels ──────────────────────────────── */}
          {CATEGORIES.map((cat, i) => {
            const progress = branchProgress[cat.key]
            return (
              <CategoryLabel
                key={`cat-${cat.key}`}
                x={cat.x}
                y={CATEGORY_Y}
                label={cat.label}
                color={cat.color}
                count={(questsByCategory[cat.key] || []).length}
                completed={progress?.completed || 0}
                total={progress?.total || 0}
                delay={1.6 + i * 0.15}
              />
            )
          })}

          {/* ── Phase 5: Quest Nodes ──────────────────────────────────── */}
          {CATEGORIES.map((cat, catIdx) => {
            const catQuests = questsByCategory[cat.key] || []
            const tiers = [QUEST_T1_Y, QUEST_T2_Y, QUEST_T3_Y]

            return (
              <g key={`qnodes-${cat.key}`}>
                {tiers.map((tierY, tierIdx) => (
                  <QuestNode
                    key={`qnode-${cat.key}-${tierIdx}`}
                    cx={cat.x}
                    cy={tierY}
                    quest={catQuests[tierIdx]}
                    color={cat.color}
                    delay={2.5 + catIdx * 0.1 + tierIdx * 0.12}
                    onClick={
                      catQuests[tierIdx]
                        ? () => setSelectedQuest({ quest: catQuests[tierIdx], color: cat.color })
                        : undefined
                    }
                  />
                ))}
              </g>
            )
          })}

          {/* ── Phase 6: You Are Here ─────────────────────────────────── */}
          <YouMarker />
        </svg>
      </div>

      {/* Journey attestation badge — bottom of screen */}
      {journeyProof && journeyProof.quest_count > 0 && (
        <motion.div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.8, duration: 0.5 }}
        >
          {journeyProof.anchored ? (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold tracking-wide"
              style={{
                backgroundColor: 'rgba(168, 216, 184, 0.15)',
                border: '1px solid rgba(168, 216, 184, 0.3)',
                color: '#a8d8b8',
              }}
            >
              {/* Chain link icon */}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              VERIFIED ON BASE
              {journeyProof.last_anchor_tx && (
                <span
                  className="ml-1 opacity-50 cursor-pointer"
                  title={journeyProof.last_anchor_tx}
                  onClick={() => {
                    if (journeyProof.last_anchor_tx) {
                      window.open(
                        `https://basescan.org/tx/${journeyProof.last_anchor_tx}`,
                        '_blank'
                      )
                    }
                  }}
                >
                  {journeyProof.last_anchor_tx.slice(0, 8)}...
                </span>
              )}
            </div>
          ) : (
            <motion.button
              onClick={handleAnchorJourney}
              disabled={isAnchoring}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold tracking-wide transition-colors"
              style={{
                backgroundColor: isAnchoring
                  ? 'rgba(184, 160, 216, 0.1)'
                  : 'rgba(184, 160, 216, 0.15)',
                border: '1px solid rgba(184, 160, 216, 0.3)',
                color: '#b8a0d8',
                cursor: isAnchoring ? 'wait' : 'pointer',
              }}
              whileHover={isAnchoring ? {} : { scale: 1.03 }}
              whileTap={isAnchoring ? {} : { scale: 0.97 }}
            >
              {/* Anchor icon */}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="5" r="3" />
                <line x1="12" y1="22" x2="12" y2="8" />
                <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
              </svg>
              {isAnchoring ? 'ANCHORING...' : 'ANCHOR JOURNEY'}
            </motion.button>
          )}

          {/* Brief confirmation toast */}
          <AnimatePresence>
            {anchorResult && !anchorResult.startsWith('error:') && (
              <motion.div
                className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1 rounded-full text-[9px] font-semibold"
                style={{
                  backgroundColor: 'rgba(168, 216, 184, 0.2)',
                  border: '1px solid rgba(168, 216, 184, 0.3)',
                  color: '#a8d8b8',
                }}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.3 }}
              >
                Anchored: {anchorResult.slice(0, 10)}...
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

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
      </AnimatePresence>
    </div>
  )
}
