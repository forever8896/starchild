/**
 * SkillTree.tsx — The Living Tree
 *
 * A quest-first visualization of the user's Great Work. Not a grid to fill —
 * a tree that GROWS from what they actually do:
 *   - you sit at the roots (the base)
 *   - the vision (their north star) waits at the crown
 *   - three boughs — Body, Mind, Spirit — rise between them
 *
 * Each bough grows toward the star as its plane matures (alchemical stage +
 * completed quests), so the stage is *felt* (how far a bough has climbed)
 * rather than studied. Every quest is a bloom on the bough it belongs to:
 *   - completed quests → blooms along the grown length
 *   - the active quest  → a bud at the growing tip
 *
 * The hermetic stage names stay the AI's private ontology (PRD §3); the human
 * label ("Facing", "Releasing"…) shows only as a quiet caption at each tip.
 *
 * Layout (roots → crown):
 *   ★ the vision (north star)
 *   ╲│╱  three boughs reaching up, blooming with quests
 *   ◦ you (the roots)
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { type Quest, type GreatWorkPosition, type Plane, type Stage } from '../store'
import { usePlatform } from '../platform/usePlatform'
import starchildLogo from '../assets/starchild-logo.png'
import skilltreeBg from '../assets/skilltree-3bough.png'
// @ts-ignore
import videoSkillTree from '../assets/videos/skilltree.webm'

// ─── Vessel Layout Constants ────────────────────────────────────────────────

const VB_W = 800
const VB_H = 1000

const VISION_Y = 116
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

// ─── Low-poly tree geometry ─────────────────────────────────────────────────
// You at the roots, the vision at the crown, and a real tree between: a chunky
// faceted trunk carrying a volumetric crown of three foliage masses — one per
// plane. Each mass swells with its plane's maturity; quests are gems in it.
type Pt = { x: number; y: number }

const CROWN: Pt = { x: TRUNK_X, y: VISION_Y }   // the vision star, high above
const TRUNK_FORK: Pt = { x: TRUNK_X, y: 512 }   // where the trunk splits into branches
const BASE: Pt = { x: TRUNK_X, y: 842 }         // roots / ground

// Sub-centre of each plane's leaves within the ONE crown; kept close so the
// clusters overlap into a single canopy rather than three separate blobs.
const CROWN_SUB: Record<Plane, Pt> = {
  body:   { x: TRUNK_X - 126, y: 404 },
  mind:   { x: TRUNK_X,       y: 330 },
  spirit: { x: TRUNK_X + 126, y: 404 },
}

const BARK = '#9e6a50'  // warm trunk, low-poly-tree style

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// Point on a quadratic Bézier at parameter t.
function qbez(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  const m = 1 - t
  return {
    x: m * m * p0.x + 2 * m * t * p1.x + t * t * p2.x,
    y: m * m * p0.y + 2 * m * t * p1.y + t * t * p2.y,
  }
}

// Unit normal (perpendicular to the tangent) — sets blooms off the branch line
// like fruit on a bough rather than beads on a wire.
function qbezNormal(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  const dx = 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x)
  const dy = 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y)
  const len = Math.hypot(dx, dy) || 1
  return { x: -dy / len, y: dx / len }
}

// ─── Low-poly faceting ──────────────────────────────────────────────────────
// The tree is built from triangles. One fixed light direction (top-left) shades
// every facet by how squarely it faces the light, so shades of a plane's own
// colour read as a single 3-D surface rather than flat noise. That faceting is
// where the spatial character comes from.
type Tri = { pts: Pt[]; fill: string }

const LIGHT = { x: -0.7, y: -0.72 }

// Mix a hex colour toward white (amt > 0) or black (amt < 0).
function shade(hex: string, amt: number): string {
  const h = hex.replace('#', '')
  const parts = [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)].map((s) => parseInt(s, 16))
  const target = amt >= 0 ? 255 : 0
  const k = Math.min(1, Math.abs(amt))
  return '#' + parts.map((c) => Math.round(c + (target - c) * k).toString(16).padStart(2, '0')).join('')
}

// Shade a facet by how much its outward normal faces the light.
function litShade(color: string, nx: number, ny: number, boost = 0.36, ambient = 0.04): string {
  return shade(color, clamp(ambient + (nx * LIGHT.x + ny * LIGHT.y) * boost, -0.44, 0.42))
}

// A faceted, tapered limb following a quadratic Bézier from t=0 to tEnd.
function facetLimb(p0: Pt, p1: Pt, p2: Pt, tEnd: number, baseW: number, tipW: number, color: string): Tri[] {
  const SEG = 10
  const cross: { L: Pt; R: Pt; n: Pt }[] = []
  for (let i = 0; i <= SEG; i++) {
    const t = (i / SEG) * tEnd
    const c = qbez(p0, p1, p2, t)
    const n = qbezNormal(p0, p1, p2, t)
    const w = lerp(baseW, tipW, i / SEG)
    cross.push({ L: { x: c.x + n.x * w / 2, y: c.y + n.y * w / 2 }, R: { x: c.x - n.x * w / 2, y: c.y - n.y * w / 2 }, n })
  }
  const tris: Tri[] = []
  for (let i = 0; i < SEG; i++) {
    const a = cross[i], b = cross[i + 1]
    tris.push({ pts: [a.L, a.R, b.L], fill: litShade(color, a.n.x, a.n.y) })
    tris.push({ pts: [a.R, b.R, b.L], fill: litShade(color, -a.n.x, -a.n.y) })
  }
  return tris
}

// A clean faceted trunk/branch: a tapered prism with just two long faces (a lit
// front-left and a shadowed right) meeting at an off-centre ridge. Each face is
// one flat colour, so it reads as a smooth 3-D column — no ladder stripes.
function facetColumn(p0: Pt, p1: Pt, p2: Pt, baseW: number, tipW: number, color: string, segs = 9): Tri[] {
  const L: Pt[] = [], M: Pt[] = [], R: Pt[] = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const c = qbez(p0, p1, p2, t), n = qbezNormal(p0, p1, p2, t)
    const w = lerp(baseW, tipW, t)
    L.push({ x: c.x + n.x * w * 0.5, y: c.y + n.y * w * 0.5 })
    M.push({ x: c.x + n.x * w * 0.14, y: c.y + n.y * w * 0.14 }) // front ridge, toward the light
    R.push({ x: c.x - n.x * w * 0.5, y: c.y - n.y * w * 0.5 })
  }
  const lit = shade(color, 0.13), dark = shade(color, -0.26)
  const tris: Tri[] = []
  for (let i = 0; i < segs; i++) {
    tris.push({ pts: [L[i], M[i], L[i + 1]], fill: lit })
    tris.push({ pts: [M[i], M[i + 1], L[i + 1]], fill: lit })
    tris.push({ pts: [M[i], R[i], M[i + 1]], fill: dark })
    tris.push({ pts: [R[i], R[i + 1], M[i + 1]], fill: dark })
  }
  return tris
}

// Cubic Bézier — an organic S-curve for the trunk.
function cbez(p0: Pt, c1: Pt, c2: Pt, p3: Pt, t: number): Pt {
  const m = 1 - t, a = m * m * m, b = 3 * m * m * t, c = 3 * m * t * t, d = t * t * t
  return { x: a * p0.x + b * c1.x + c * c2.x + d * p3.x, y: a * p0.y + b * c1.y + c * c2.y + d * p3.y }
}
function cbezNormal(p0: Pt, c1: Pt, c2: Pt, p3: Pt, t: number): Pt {
  const m = 1 - t
  const dx = 3 * m * m * (c1.x - p0.x) + 6 * m * t * (c2.x - c1.x) + 3 * t * t * (p3.x - c2.x)
  const dy = 3 * m * m * (c1.y - p0.y) + 6 * m * t * (c2.y - c1.y) + 3 * t * t * (p3.y - c2.y)
  const len = Math.hypot(dx, dy) || 1
  return { x: -dy / len, y: dx / len }
}

// A proper low-poly trunk: a tapered column of several longitudinal facets that
// shade smoothly across the width (sunlit on the left, in shadow on the right)
// so it reads as a rounded 3-D cylinder — not a folded ribbon. Widens into a
// root flare at the base. Returns the mesh plus its sunward silhouette (for a
// rim highlight).
function facetTrunk(
  p0: Pt, c1: Pt, c2: Pt, p3: Pt, baseW: number, tipW: number, color: string, flareAmt = 0.8,
): { tris: Tri[]; edge: Pt[] } {
  const SEG = 16, RAILS = 6
  const fr = Array.from({ length: RAILS }, (_, j) => -0.5 + j / (RAILS - 1))
  const rows: Pt[][] = []
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG
    const c = cbez(p0, c1, c2, p3, t)
    const n = cbezNormal(p0, c1, c2, p3, t)
    const flareT = Math.max(0, (0.17 - t) / 0.17)   // widen sharply in the bottom sixth
    const w = lerp(baseW, tipW, t) * (1 + flareAmt * flareT * flareT)
    rows.push(fr.map((f) => ({ x: c.x + n.x * f * w, y: c.y + n.y * f * w })))
  }
  // Smooth cylinder shading: lateral position drives light→shadow across the
  // width; a faint length gradient darkens the base.
  const faceShade = (midf: number, lenFrac: number) =>
    shade(color, clamp(0.03 + (-midf * 0.5) + (1 - Math.abs(midf * 2)) * 0.05 - 0.16 * (1 - lenFrac), -0.42, 0.34))
  const tris: Tri[] = []
  for (let i = 0; i < SEG; i++) {
    const a = rows[i], b = rows[i + 1], lenFrac = i / SEG
    for (let j = 0; j < RAILS - 1; j++) {
      const fill = faceShade((fr[j] + fr[j + 1]) / 2, lenFrac)
      tris.push({ pts: [a[j], a[j + 1], b[j]], fill })
      tris.push({ pts: [a[j + 1], b[j + 1], b[j]], fill })
    }
  }
  return { tris, edge: rows.map((r) => r[0]) }
}

// A faceted crystalline gem — foliage, a bloom, or a bud. Deterministic (no RNG
// in render) so it never jitters between frames.
function facetGem(cx: number, cy: number, r: number, color: string, sides = 7, rot = 0): Tri[] {
  const ring: Pt[] = []
  for (let k = 0; k < sides; k++) {
    const ang = rot + (k / sides) * Math.PI * 2
    const rr = r * (0.66 + 0.34 * ((Math.sin(k * 2.7 + rot * 5) + 1) / 2))
    ring.push({ x: cx + Math.cos(ang) * rr, y: cy + Math.sin(ang) * rr })
  }
  const center = { x: cx, y: cy }
  const tris: Tri[] = []
  for (let k = 0; k < sides; k++) {
    const a = ring[k], b = ring[(k + 1) % sides]
    const mx = (a.x + b.x) / 2 - cx, my = (a.y + b.y) / 2 - cy
    const len = Math.hypot(mx, my) || 1
    tris.push({ pts: [center, a, b], fill: litShade(color, mx / len, my / len, 0.32, 0.1) })
  }
  return tris
}

// Deterministic pseudo-random in [0,1) — keeps the foliage stable across frames.
const rand = (seed: number) => { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }

// One lit facet: shade from the centroid's direction off `origin` (a fake sphere
// normal), so a foliage mass reads as a rounded 3-D volume, plus a top-light bias.
function litTri(a: Pt, b: Pt, c: Pt, color: string, origin: Pt, r: number): Tri {
  const mx = (a.x + b.x + c.x) / 3, my = (a.y + b.y + c.y) / 3
  let nx = mx - origin.x, ny = my - origin.y
  const len = Math.hypot(nx, ny) || 1
  nx /= len; ny /= len
  const top = ((origin.y - my) / r) * 0.12
  return { pts: [a, b, c], fill: shade(color, clamp(0.05 + (nx * LIGHT.x + ny * LIGHT.y) * 0.36 + top, -0.42, 0.44)) }
}

// A volumetric low-poly foliage mass — the actual crown. Two jittered rings of
// facets around a centre read as a faceted dome rather than a flat disc.
function facetCanopy(cx: number, cy: number, r: number, color: string, seed: number, detail = 12): Tri[] {
  const center: Pt = { x: cx, y: cy - r * 0.08 }
  const outer: Pt[] = [], inner: Pt[] = []
  for (let k = 0; k < detail; k++) {
    const ao = (k / detail) * Math.PI * 2
    const jo = 0.82 + 0.36 * rand((k + 1) * (seed + 1))
    outer.push({ x: cx + Math.cos(ao) * r * jo, y: cy + Math.sin(ao) * r * jo * 0.88 })
    const ai = ((k + 0.5) / detail) * Math.PI * 2
    const ji = 0.4 + 0.24 * rand((k + 7) * (seed + 3))
    inner.push({ x: cx + Math.cos(ai) * r * ji, y: cy + Math.sin(ai) * r * ji * 0.88 })
  }
  const tris: Tri[] = []
  for (let k = 0; k < detail; k++) tris.push(litTri(center, inner[k], inner[(k + 1) % detail], color, center, r))
  for (let k = 0; k < detail; k++) {
    const i0 = inner[k], i1 = inner[(k + 1) % detail], o0 = outer[k], o1 = outer[(k + 1) % detail]
    tris.push(litTri(i0, o0, o1, color, center, r))
    tris.push(litTri(i0, o1, i1, color, center, r))
  }
  return tris
}

// A small isometric slab — the ground the tree stands on.
function isoBase(cx: number, cy: number, hw: number, hh: number, depth: number, color: string): Tri[] {
  const t = { x: cx, y: cy - hh }, r = { x: cx + hw, y: cy }, b = { x: cx, y: cy + hh }, l = { x: cx - hw, y: cy }
  const down = (p: Pt) => ({ x: p.x, y: p.y + depth })
  return [
    // top face (faceted)
    { pts: [t, l, b], fill: shade(color, 0.12) },
    { pts: [t, r, b], fill: shade(color, 0.03) },
    // front-left wall
    { pts: [l, b, down(b)], fill: shade(color, -0.3) },
    { pts: [l, down(b), down(l)], fill: shade(color, -0.36) },
    // front-right wall
    { pts: [b, r, down(r)], fill: shade(color, -0.22) },
    { pts: [b, down(r), down(b)], fill: shade(color, -0.28) },
  ]
}

// Render a triangle set. stroke=fill closes the anti-alias seams between facets.
function Facets({ tris, opacity = 1 }: { tris: Tri[]; opacity?: number }) {
  return (
    <>
      {tris.map((tr, k) => (
        <polygon
          key={k}
          points={tr.pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
          fill={tr.fill}
          stroke={tr.fill}
          strokeWidth={0.7}
          strokeLinejoin="round"
          opacity={opacity}
        />
      ))}
    </>
  )
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
    if (!text) return []  // no vision yet → the star stands alone (empty-state prompt speaks instead)
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
        r={82}
        fill="url(#vision-radial)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ delay: 0, duration: 1 }}
      />

      {/* Ambient glow continuous breathe */}
      <motion.circle
        cx={TRUNK_X}
        cy={VISION_Y}
        r={82}
        fill="url(#vision-radial)"
        animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut', delay: 1 }}
        style={{ transformOrigin: `${TRUNK_X}px ${VISION_Y}px` }}
      />

      {/* Slowly rotating rays */}
      <motion.g
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 64, ease: 'linear' }}
        style={{ transformOrigin: `${TRUNK_X}px ${VISION_Y}px` }}
      >
        {Array.from({ length: 14 }, (_, i) => {
          const a = (i / 14) * Math.PI * 2
          const long = i % 2 === 0
          const r1 = 38, r2 = long ? 78 : 56
          return (
            <line key={i}
              x1={TRUNK_X + Math.cos(a) * r1} y1={VISION_Y + Math.sin(a) * r1}
              x2={TRUNK_X + Math.cos(a) * r2} y2={VISION_Y + Math.sin(a) * r2}
              stroke="#f0e2b0" strokeWidth={long ? 2 : 1.2} strokeLinecap="round"
              opacity={long ? 0.5 : 0.28} />
          )
        })}
      </motion.g>

      {/* Pulsing halo ring */}
      <motion.circle
        cx={TRUNK_X} cy={VISION_Y} r={47} fill="none" stroke="#f0e2b0" strokeWidth={1.2}
        animate={{ scale: [1, 1.13, 1], opacity: [0.35, 0.1, 0.35] }}
        transition={{ repeat: Infinity, duration: 4.5, ease: 'easeInOut' }}
        style={{ transformOrigin: `${TRUNK_X}px ${VISION_Y}px` }}
      />

      {/* Orbiting sparkles */}
      <motion.g
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 20, ease: 'linear' }}
        style={{ transformOrigin: `${TRUNK_X}px ${VISION_Y}px` }}
      >
        <circle cx={TRUNK_X + 58} cy={VISION_Y} r={2.4} fill="#fff8e6" opacity={0.85} />
        <circle cx={TRUNK_X - 54} cy={VISION_Y + 14} r={1.7} fill="#fff8e6" opacity={0.6} />
      </motion.g>

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
        <StarShape cx={TRUNK_X} cy={VISION_Y} r={32} color="#e8d8a8" />
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

// ─── Crown — foliage + quest fruits ─────────────────────────────────────────
// The whole tree wears a single canopy of muted faceted leaves. Quests are NOT
// leaves: completed quests hang as bright glowing FRUITS on the lower canopy;
// the active quest is a pulsing outlined BUD at the crown. Three clear tiers —
// foliage, fruit, bud — so achievements read at a glance instead of blending in.

type Leaf = { x: number; y: number; r: number; color: string; seed: number; delay: number }
type Mark = { kind: 'fruit' | 'bud'; x: number; y: number; base: string; glowId: string; quest: Quest; seed: number; delay: number }

function Crown({
  planes, celebratingId, onSelect,
}: {
  planes: { plane: Plane; label: string; color: string; maturity: number; completed: Quest[]; active?: Quest }[]
  celebratingId: string | null
  onSelect: (quest: Quest, color: string) => void
}) {
  const leaves: Leaf[] = []
  const marks: Mark[] = []
  planes.forEach((pd, pi) => {
    const sub = CROWN_SUB[pd.plane]
    const maxR = 86 + pd.maturity * 40
    const glowId = `glow-${pd.label.toLowerCase()}`
    const sB = pi * 97 + 11

    // foliage — a full but breathing canopy: enough chunky clusters to read as a
    // real crown, spread wide enough that each one (and each quest fruit among
    // them) still stands as its own object.
    const count = 9 + Math.round(pd.maturity * 7)
    for (let k = 0; k < count; k++) {
      const ang = k * 2.399963 + sB
      const rad = Math.sqrt((k + 0.35) / count) * maxR
      leaves.push({
        x: sub.x + Math.cos(ang) * rad,
        y: sub.y + Math.sin(ang) * rad * 0.82,
        r: 23 - (rad / maxR) * 5 + rand(sB + k) * 5,
        color: shade(pd.color, -0.06 + (rand(sB + k + 40) - 0.5) * 0.1),
        seed: sB + k, delay: 0,
      })
    }

    // completed quests — fruits hung across the lower arc of the canopy
    pd.completed.forEach((q, i) => {
      const n = pd.completed.length
      const ang = n === 1 ? Math.PI * 0.5 : lerp(Math.PI * 0.24, Math.PI * 0.76, i / (n - 1))
      marks.push({
        kind: 'fruit',
        x: sub.x + Math.cos(ang) * maxR * 0.86,
        y: sub.y + Math.sin(ang) * maxR * 0.7 + 8,
        base: pd.color, glowId, quest: q, seed: sB + i * 13, delay: 1.0 + i * 0.12,
      })
    })

    // the active quest — a bud at the crown of this plane's foliage
    if (pd.active) {
      marks.push({ kind: 'bud', x: sub.x, y: sub.y - maxR * 0.72, base: pd.color, glowId, quest: pd.active, seed: sB + 51, delay: 1.15 })
    }
  })
  leaves.sort((a, b) => a.y - b.y)
  // Depth grade: clusters drawn earlier sit further back, so cool + darken them
  // and brighten those in front — the crown gains real volume.
  leaves.forEach((l, i) => {
    l.delay = 0.5 + i * 0.02
    l.color = shade(l.color, -0.1 + (i / Math.max(1, leaves.length - 1)) * 0.2)
  })

  return (
    <g>
      {/* foliage */}
      {leaves.map((l, i) => (
        <motion.g key={`lf-${i}`} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ scale: { delay: l.delay, type: 'spring', stiffness: 240, damping: 18 }, opacity: { delay: l.delay, duration: 0.2 } }}
          style={{ transformOrigin: `${l.x}px ${l.y}px` }}>
          {/* soft contact shadow (light is top-left, so it falls down-right) */}
          <ellipse cx={l.x + l.r * 0.3} cy={l.y + l.r * 0.55} rx={l.r * 0.92} ry={l.r * 0.5} fill="#0a0712" opacity={0.28} />
          <Facets tris={facetCanopy(l.x, l.y, l.r, l.color, l.seed, 8)} />
        </motion.g>
      ))}

      {/* quest fruits + the active bud, on top of the leaves */}
      {marks.map((m, i) => {
        const celebrating = m.quest.id === celebratingId
        const enter = {
          scale: { delay: m.delay, type: 'spring' as const, stiffness: 220, damping: 15 },
          opacity: { delay: m.delay, duration: 0.2 },
        }
        const burst = celebrating && (
          <>
            <motion.circle cx={m.x} cy={m.y} r={12} fill="none" stroke={m.base} strokeWidth={3}
              initial={{ scale: 1, opacity: 0.9 }} animate={{ scale: 3, opacity: 0 }}
              transition={{ duration: 1, ease: 'easeOut' }} style={{ transformOrigin: `${m.x}px ${m.y}px` }} />
            {celebrationParticles(m.x, m.y).map((p, j) => (
              <motion.circle key={`cp-${j}`} r={2.5} fill={m.base}
                initial={{ cx: m.x, cy: m.y, opacity: 1 }} animate={{ cx: p.tx, cy: p.ty, opacity: 0 }}
                transition={{ duration: 0.8, delay: j * 0.03, ease: 'easeOut' }} />
            ))}
          </>
        )
        if (m.kind === 'fruit') {
          return (
            <motion.g key={`mk-${i}`} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={enter} style={{ cursor: 'pointer', transformOrigin: `${m.x}px ${m.y}px` }}
              onClick={() => onSelect(m.quest, m.base)}>
              {/* generous invisible hit target — the gem itself is small */}
              <circle cx={m.x} cy={m.y} r={19} fill="transparent" />
              {burst}
              <circle cx={m.x} cy={m.y} r={17} fill={m.base} opacity={0.34} filter={`url(#${m.glowId})`} />
              <Facets tris={facetGem(m.x, m.y, 8, shade(m.base, 0.3), 7, m.seed)} />
              <circle cx={m.x - 1.6} cy={m.y - 1.8} r={2.4} fill="#fffdf5" opacity={0.95} />
            </motion.g>
          )
        }
        return (
          <motion.g key={`mk-${i}`} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={enter} style={{ cursor: 'pointer', transformOrigin: `${m.x}px ${m.y}px` }}
            onClick={() => onSelect(m.quest, m.base)}>
            {/* generous invisible hit target — the bud itself is small */}
            <circle cx={m.x} cy={m.y} r={19} fill="transparent" />
            {burst}
            <motion.circle cx={m.x} cy={m.y} r={13} fill="none" stroke={m.base} strokeWidth={1.5}
              animate={{ scale: [1, 1.35, 1], opacity: [0.55, 0.12, 0.55] }}
              transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
              style={{ transformOrigin: `${m.x}px ${m.y}px` }} />
            <circle cx={m.x} cy={m.y} r={8.5} fill="none" stroke={m.base} strokeWidth={1.75} opacity={0.9} />
            <motion.circle cx={m.x} cy={m.y} r={3.4} fill={m.base}
              animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              style={{ transformOrigin: `${m.x}px ${m.y}px` }} />
          </motion.g>
        )
      })}
    </g>
  )
}

// ─── Trunk — a curved, tapering low-poly trunk that forks into branches ──────
// Branches reach up into each plane's part of the crown (drawn behind the leaves
// so they peek through the gaps, like the reference). You are the soft light at
// the roots.

function Trunk() {
  const span = BASE.y - TRUNK_FORK.y
  // Rise straight up from the base so the flared foot sits FLAT on the ground,
  // then a whisper of sway higher up (both controls above the base keep t=0
  // vertical → a level, planted base).
  const trunk = facetTrunk(
    BASE,
    { x: TRUNK_X, y: BASE.y - span * 0.45 },
    { x: TRUNK_X + 16, y: TRUNK_FORK.y + span * 0.32 },
    TRUNK_FORK,
    76, 34, BARK, 0.85,
  )
  const groundY = BASE.y + 8
  const edgePts = trunk.edge.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25, duration: 0.8 }}>
      {/* soft ground shadow (wide, to sit under the flared roots) */}
      <ellipse cx={BASE.x + 8} cy={groundY} rx={116} ry={21} fill="#000000" opacity={0.34} />
      <ellipse cx={BASE.x} cy={groundY - 2} rx={74} ry={14} fill="#b8a0d8" opacity={0.1} />

      {/* branches into the crown (behind the leaves) */}
      {(['body', 'mind', 'spirit'] as Plane[]).map((pl) => {
        const sub = CROWN_SUB[pl]
        const bSpan = { x: sub.x - TRUNK_FORK.x, y: sub.y - TRUNK_FORK.y }
        const b = facetTrunk(
          TRUNK_FORK,
          { x: TRUNK_FORK.x + bSpan.x * 0.3, y: TRUNK_FORK.y + bSpan.y * 0.2 - 14 },
          { x: TRUNK_FORK.x + bSpan.x * 0.7, y: TRUNK_FORK.y + bSpan.y * 0.7 },
          sub,
          26, 6, BARK, 0,
        )
        return <Facets key={`br-${pl}`} tris={b.tris} />
      })}

      {/* the trunk itself, over the branch roots */}
      <Facets tris={trunk.tris} />
      {/* rim light along the sunward silhouette */}
      <polyline points={edgePts} fill="none" stroke={shade(BARK, 0.4)} strokeWidth={1.8}
        strokeLinejoin="round" strokeLinecap="round" opacity={0.45} />

      {/* you — a soft light at the roots */}
      <motion.circle
        cx={BASE.x} cy={BASE.y - 2} r={11} fill="url(#you-radial)"
        animate={{ scale: [1, 1.18, 1], opacity: [0.5, 0.72, 0.5] }}
        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
        style={{ transformOrigin: `${BASE.x}px ${BASE.y}px` }}
      />
      <text
        x={BASE.x} y={groundY + 30} textAnchor="middle" fill="#b6a6cf"
        fontSize={11} fontFamily="Nunito, sans-serif" fontWeight={800}
        letterSpacing="0.18em" opacity={0.8}
      >
        YOU
      </text>
    </motion.g>
  )
}

// ─── Atmosphere — a twinkling starfield and drifting light motes ────────────

function StarField() {
  const stars = Array.from({ length: 54 }, (_, i) => ({
    x: rand(i * 1.7 + 1) * 800,
    y: rand(i * 2.3 + 5) * 940 + 20,
    r: 0.5 + rand(i * 3.1 + 2) * 1.5,
    base: 0.12 + rand(i + 9) * 0.4,
    dur: 3 + rand(i + 3) * 4,
    delay: rand(i + 11) * 3,
  }))
  return (
    <g aria-hidden="true">
      {stars.map((s, i) => (
        <motion.circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff"
          initial={{ opacity: s.base }}
          animate={{ opacity: [s.base, s.base * 0.25, s.base] }}
          transition={{ repeat: Infinity, duration: s.dur, delay: s.delay, ease: 'easeInOut' }} />
      ))}
    </g>
  )
}

function Motes() {
  const cols = ['#e8d8a8', '#c8b0e6', '#a8d8b8']
  const motes = Array.from({ length: 16 }, (_, i) => ({
    x: 190 + rand(i * 1.3 + 2) * 420,
    y: 250 + rand(i * 2.1 + 4) * 380,
    r: 0.9 + rand(i + 7) * 1.7,
    drift: 20 + rand(i + 3) * 30,
    dur: 6 + rand(i + 5) * 7,
    col: cols[i % 3],
    delay: rand(i + 13) * 6,
  }))
  return (
    <g aria-hidden="true">
      {motes.map((m, i) => (
        <motion.circle key={i} cx={m.x} r={m.r} fill={m.col}
          initial={{ cy: m.y, opacity: 0 }}
          animate={{ cy: [m.y, m.y - m.drift, m.y], opacity: [0, 0.55, 0] }}
          transition={{ repeat: Infinity, duration: m.dur, delay: m.delay, ease: 'easeInOut' }} />
      ))}
    </g>
  )
}

// ─── Painted-tree overlay ───────────────────────────────────────────────────
// The base is a hand-painted "tree of light" (skilltree-bg.png). Everything here
// composites onto it in image-fraction coords: the crown star, per-plane branch
// ignition, and interactive quest lights sitting on the painted branch tips.

// Anchors read off skilltree-3bough.png (1344×752), as % of the image box.
// Crown star — measured from the painting (brightest golden blob, top-centre).
const CROWN_STAR = { x: 49, y: 11 }

// Where each plane's coloured bough glows — the measured colour centroid of each
// bough (green left, purple right), mind at the golden crown branches.
const PLANE_GLOW: Record<Plane, { x: number; y: number; r: number }> = {
  body:   { x: 30, y: 37, r: 28 },   // green bough centroid, sweeping left
  mind:   { x: 50, y: 15, r: 16 },   // gold crown branches, centre-top
  spirit: { x: 72, y: 36, r: 28 },   // purple bough centroid, sweeping right
}

// Ordered quest-light slots per plane, derived from a pixel analysis of the
// painting. Fruits fill slot[0], slot[1], … as quests are earned, so the order
// is deliberate: Body & Spirit start on the LOWEST branch and climb outward/up;
// Mind runs UP the central trunk (x≈49.3, the measured trunk centre) from the
// base toward the crown star — so growth visibly rises toward the light.
const QUEST_SLOTS: Record<Plane, [number, number][]> = {
  body:   [[21, 58], [9, 50], [16, 41], [36, 31], [13, 28], [10, 19]],
  // Mind climbs the trunk, fruits hanging on ALTERNATING sides (the measured
  // trunk edges ≈47%/52%) so it reads as fruit on a tree, not a centred stack.
  mind:   [[52.5, 66], [46, 59], [52, 52], [46.5, 45], [52.5, 38], [46, 31], [49.3, 24]],
  spirit: [[79, 58], [91, 50], [84, 41], [64, 31], [87, 28], [90, 19]],
}

// ── Pixel-perfect effect layers ──────────────────────────────────────────────
// The problem with a radial-gradient glow is that it's a SHAPE laid over the art
// — it spills past the real branches onto the black background. These two layers
// only ever touch the painting's OWN pixels, so nothing overgrows the artwork:
//
//   ShineLayer — a brightened COPY of the painting, screen-blended, so light is
//     added only where the copy is bright (the painted lines); the dark gaps add
//     nothing. It follows the exact painted shape because it IS the painting.
//   TintLayer — a solid plane colour with `mix-blend-mode: color`: that blend
//     keeps the BASE luminance and takes only the overlay's hue, so black gaps
//     (luminance 0) stay black and only the bright painted pixels are recoloured.
//
// A radial/elliptical `mask` limits each effect to its region (a bough, the
// trunk, the star, or the branch a fruit hangs on) — the blend does the shaping.
function ShineLayer({ mask, clip, filter, pulse, duration = 5 }: {
  mask?: string; clip?: string; filter: string; pulse: [number, number, number]; duration?: number
}) {
  return (
    <motion.img
      src={skilltreeBg} alt="" aria-hidden draggable={false}
      className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
      style={{
        filter, mixBlendMode: 'screen',
        WebkitMaskImage: mask, maskImage: mask,
        clipPath: clip, WebkitClipPath: clip,
      }}
      animate={{ opacity: pulse }}
      transition={{ repeat: Infinity, duration, ease: 'easeInOut' }}
    />
  )
}

function TintLayer({ color, mask, opacity }: { color: string; mask: string; opacity: number }) {
  return (
    <div
      aria-hidden className="absolute inset-0 pointer-events-none"
      style={{
        background: color, mixBlendMode: 'color', opacity,
        WebkitMaskImage: mask, maskImage: mask, transition: 'opacity 1.4s ease',
      }}
    />
  )
}

// A single quest light on a branch tip. `done` = a warm bloom; `active` = a
// pulsing node. Generous invisible hit area.
function QuestLight({ x, y, color, kind, celebrating, onClick }: {
  x: number; y: number; color: string; kind: 'done' | 'active'; celebrating?: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick} aria-label={kind === 'done' ? 'Completed quest' : 'Active quest'}
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{ left: `${x}%`, top: `${y}%`, width: 36, height: 36, background: 'transparent', cursor: 'pointer' }}
    >
      <span className="absolute inset-0 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${color}, transparent 62%)`, opacity: kind === 'done' ? 0.75 : 0.5, filter: 'blur(2px)' }} />
      {kind === 'done' ? (
        <motion.span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
          style={{ width: 15, height: 15, background: `radial-gradient(circle at 38% 34%, #fffdf5, ${color})`, boxShadow: `0 0 12px 2px ${color}` }}
          animate={celebrating ? { scale: [1, 1.7, 1] } : { scale: [1, 1.14, 1] }}
          transition={{ repeat: Infinity, duration: celebrating ? 0.6 : 3, ease: 'easeInOut' }} />
      ) : (
        <>
          <motion.span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border pointer-events-none"
            style={{ width: 24, height: 24, borderColor: color, borderWidth: 1.5 }}
            animate={{ scale: [1, 1.45, 1], opacity: [0.7, 0.12, 0.7] }} transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }} />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
            style={{ width: 10, height: 10, background: color, boxShadow: `0 0 9px ${color}` }} />
        </>
      )}
    </button>
  )
}

// ─── Main SkillTree Component ───────────────────────────────────────────────

export default function SkillTree({ onBack, showIntro = false, showLogo = true }: { onBack: () => void; showIntro?: boolean; showLogo?: boolean }) {
  const platform = usePlatform()
  const [quests, setQuests] = useState<Quest[]>([])
  const [preferentialReality, setPreferentialReality] = useState('')
  const [greatWork, setGreatWork] = useState<GreatWorkPosition | null>(null)
  const [selectedQuest, setSelectedQuest] = useState<{ quest: Quest; color: string } | null>(null)
  const [celebratingQuestId, setCelebratingQuestId] = useState<string | null>(null)
  const [celebrationXp, setCelebrationXp] = useState<number | null>(null)

  // Video intro — only plays on first-ever reveal (Crystallize), not on manual nav or quest accept
  const [showVideoIntro, setShowVideoIntro] = useState(showIntro)
  const videoRef = useRef<HTMLVideoElement>(null)
  // Cinematic SVG reveal: zoom star → pull back to full tree → auto-dismiss
  const [revealPhase, setRevealPhase] = useState<'star' | 'tree' | 'done'>('star')

  // Fill the page: the painting is a fixed 1344:752, but the overlay quest-lights
  // are positioned as % of its box, so the box MUST keep that ratio (can't just
  // `object-cover`). So we size the box to the LARGEST 1344:752 rectangle that
  // fits the available area — object-contain math done in JS, since pure CSS
  // can't "largest-fit" an aspect box without distorting on one axis. Recomputed
  // on resize. `clientWidth/Height` ignore the reveal `scale()` transform.
  const TREE_AR = 1376 / 768
  const fitRef = useRef<HTMLDivElement>(null)
  const [treeBox, setTreeBox] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = fitRef.current
    if (!el) return
    const measure = () => {
      // clientWidth/Height include this element's padding — subtract it so the
      // box fits the CONTENT area (where the flex centering places it).
      const cs = getComputedStyle(el)
      const fw = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const fh = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      if (fw <= 0 || fh <= 0) return
      // COVER (not contain): the smallest 1376:768 box that fully covers the
      // section, so the painting is full-bleed to every edge with NO page
      // background showing. The overflow is clipped by the parent overflow-hidden.
      let w = fw
      let h = w / TREE_AR
      if (h < fh) { h = fh; w = h * TREE_AR }
      setTreeBox({ w: Math.round(w), h: Math.round(h) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [TREE_AR])

  useEffect(() => {
    if (!showVideoIntro) return
    // Kick playback explicitly (the autoPlay attribute alone is unreliable across
    // browsers), then guard: if it isn't actually running shortly after — autoplay
    // blocked, or a silently-paused frame — skip to the SVG reveal rather than
    // strand the user on a frozen black frame.
    const v = videoRef.current
    if (v) { v.muted = true; void v.play().catch(() => {}) }
    const guard = setTimeout(() => {
      if (!v || v.paused || v.currentTime === 0) setShowVideoIntro(false)
    }, 700)
    const timer = setTimeout(() => setShowVideoIntro(false), 5200)
    return () => { clearTimeout(guard); clearTimeout(timer) }
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

  // The crown holds a short north star: prefer the distilled `vision_short`, then
  // the fuller synthesized statement, then the raw preferential reality. Re-runs
  // when the video intro ends — on a fresh Crystallize the distillation is written
  // moments after the tree mounts, and the video (5s) gives it time to land, so
  // the crown reveals with the short phrase rather than the clipped long one.
  useEffect(() => {
    let cancelled = false
    async function loadVision() {
      try {
        const short = await platform.getSetting('vision_short')
        const vision =
          short ||
          (await platform.getSetting('vision_statement')) ||
          (await platform.getSetting('preferential_reality'))
        if (!cancelled && vision) setPreferentialReality(vision)
      } catch {
        // ignore
      }
    }
    loadVision()
    return () => { cancelled = true }
  }, [platform, showVideoIntro])

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
          ref={videoRef}
          src={videoSkillTree}
          autoPlay
          muted
          playsInline
          loop
          className="absolute inset-0 w-full h-full object-contain"
        />
      </div>

      {/* Cosmic ground — a subtle nebula. The decorative fractal tree is gone on
          purpose: the living tree IS the content now, and the old backdrop only
          competed with it. Faint plane-tinted glows echo Body/Mind/Spirit. */}
      <div
        className="absolute inset-0"
        aria-hidden="true"
        style={{
          background: [
            'radial-gradient(120% 80% at 50% -5%, rgba(232,216,168,0.10), transparent 55%)',
            'radial-gradient(90% 70% at 16% 46%, rgba(168,216,184,0.07), transparent 60%)',
            'radial-gradient(90% 70% at 84% 50%, rgba(200,176,230,0.10), transparent 60%)',
            'radial-gradient(ellipse at center 28%, #1a1525 0%, #120e1c 68%, #0d0a15 100%)',
          ].join(','),
        }}
      />

      {/* Logo — hidden where a persistent shell (the web rail) already shows it. */}
      {showLogo && (
        <div className="absolute top-3 left-4 z-40">
          <img
            src={starchildLogo}
            alt="Starchild"
            className="h-28 w-auto object-contain"
            style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.6))' }}
            draggable={false}
          />
        </div>
      )}

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

      {/* The painted Tree of Light + a luminous, interactive layer */}
      <div
        ref={fitRef}
        className="absolute inset-0 z-10 flex items-center justify-center"
        style={{
          transform: revealPhase === 'star' ? 'scale(2) translateY(12%)' : 'scale(1)',
          transformOrigin: '50% 12%',
          transition: 'transform 2.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }}
      >
        <div
          className="relative"
          style={treeBox ? { width: treeBox.w, height: treeBox.h } : { width: '100%', aspectRatio: '1376 / 768' }}
        >
          {(() => {
            const pdata = CATEGORIES.map((cat) => {
              const pos = greatWork?.planes.find((p) => p.plane === cat.key)
              const stageIdx = pos ? STAGES.findIndex((s) => s.key === pos.stage) : 0
              const planeQuests = questsByPlane[cat.key] || []
              const completed = planeQuests.filter((q) => q.status === 'completed')
              const active = planeQuests.find((q) => q.status === 'active')
              const maturity = clamp(Math.max(0, stageIdx) / 6 * 0.7 + completed.length * 0.08, 0, 1)
              return { cat, maturity, completed, active }
            })
            const overall = clamp(pdata.reduce((s, p) => s + p.maturity, 0) / 3, 0, 1)
            const empty = pdata.every((p) => p.completed.length === 0 && !p.active)
            return (
              <>
                {/* base painting — dormant + dim until progress kindles it alight */}
                <img
                  src={skilltreeBg} alt="Your tree of light" draggable={false}
                  className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
                  style={{
                    filter: `brightness(${(0.42 + overall * 0.6).toFixed(2)}) saturate(${(0.55 + overall * 0.5).toFixed(2)})`,
                    transition: 'filter 1.4s ease',
                    // No edge mask: the painting is full-bleed and opaque to every
                    // edge (its own dark nebula IS the background) — a feather here
                    // would reveal the purple page gradient and break immersion.
                  }}
                />

                {/* trunk shine — a brightened copy of the painting, CLIPPED to a
                    tapered polygon that hugs the measured trunk column (x≈49.3,
                    ~2% wide at the fork widening to ~7% at the base, stopping
                    before the roots flare) so the glow matches the trunk exactly
                    and doesn't overgrow into the roots/haze. The soft top/bottom
                    fade comes from the vertical mask. */}
                <ShineLayer
                  clip="polygon(47.8% 28%, 50.8% 28%, 51.0% 41%, 51.2% 53%, 51.7% 65%, 52.8% 72%, 45.8% 72%, 46.6% 65%, 47.4% 53%, 47.6% 41%)"
                  mask="linear-gradient(to bottom, transparent 27%, #000 34%, #000 64%, transparent 73%)"
                  filter="brightness(1.5) saturate(1.25)"
                  pulse={[0.3, 0.6, 0.3]} duration={5.5}
                />

                {/* per-plane ignition — each plane's OWN branches take on more of
                    their colour as the plane matures (colour blend = only the
                    painted pixels; the black gaps stay black) */}
                {pdata.map(({ cat, maturity }) => {
                  const g = PLANE_GLOW[cat.key]
                  return (
                    <TintLayer
                      key={cat.key} color={cat.color}
                      mask={`radial-gradient(ellipse ${g.r}% ${g.r * 1.15}% at ${g.x}% ${g.y}%, #000 55%, transparent 100%)`}
                      opacity={0.12 + maturity * 0.55}
                    />
                  )
                })}

                {/* crown vision star — the PAINTING's own star, brightened + breathing */}
                <ShineLayer
                  mask={`radial-gradient(ellipse 8% 12% at ${CROWN_STAR.x}% ${CROWN_STAR.y}%, #000 42%, transparent 100%)`}
                  filter="brightness(1.75) saturate(1.2)"
                  pulse={[0.45, 0.95, 0.45]} duration={5}
                />
                {preferentialReality && (
                  <div className="absolute -translate-x-1/2 text-center px-2 pointer-events-none" style={{ left: '50%', top: `${CROWN_STAR.y + 10}%`, width: '44%' }}>
                    <p className="text-[13px] italic leading-snug" style={{ color: '#ecdfff', textShadow: '0 1px 7px rgba(0,0,0,0.85)' }}>{preferentialReality}</p>
                  </div>
                )}

                {/* quest lights on the branch tips */}
                {pdata.flatMap(({ cat, completed, active }) => {
                  const slots = QUEST_SLOTS[cat.key]
                  const items: { q: Quest; kind: 'done' | 'active'; slot: [number, number] | undefined }[] =
                    completed.map((q, i) => ({ q, kind: 'done', slot: slots[i % slots.length] }))
                  if (active) items.push({ q: active, kind: 'active', slot: slots[completed.length % slots.length] })
                  return items.filter((it) => it.slot).flatMap((it) => [
                    // the branch this fruit hangs on takes the plane's colour —
                    // masked to the fruit, colour-blended so only the painted
                    // branch pixels there are tinted (no glow onto the dark sky)
                    <TintLayer
                      key={`${it.q.id}-branch`} color={cat.color}
                      mask={`radial-gradient(circle at ${it.slot![0]}% ${it.slot![1]}%, #000 0%, transparent 12%)`}
                      opacity={it.kind === 'done' ? 0.72 : 0.52}
                    />,
                    <QuestLight
                      key={it.q.id} x={it.slot![0]} y={it.slot![1]} color={cat.color} kind={it.kind}
                      celebrating={it.q.id === celebratingQuestId}
                      onClick={() => setSelectedQuest({ quest: it.q, color: cat.color })}
                    />,
                  ])
                })}

                {/* you — the roots */}
                <div className="absolute -translate-x-1/2 text-center pointer-events-none" style={{ left: '50%', top: '95.5%', width: '30%' }}>
                  <span className="text-[11px] font-extrabold tracking-[0.18em]" style={{ color: '#c9b8ea', opacity: 0.8, textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}>YOU</span>
                </div>

                {/* the invitation, while the tree still sleeps */}
                {empty && (
                  <motion.div
                    className="absolute -translate-x-1/2 text-center px-3 pointer-events-none" style={{ left: '50%', top: '44%', width: '62%' }}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2, duration: 1 }}
                  >
                    <p className="text-[17px] font-bold" style={{ color: '#e6dbf7', textShadow: '0 2px 10px rgba(0,0,0,0.95)' }}>your journey begins with a single step</p>
                    <p className="text-[13px] italic mt-1" style={{ color: '#a99cc4', textShadow: '0 1px 7px rgba(0,0,0,0.95)' }}>talk with your Starchild to plant the first</p>
                  </motion.div>
                )}
              </>
            )
          })()}
        </div>
      </div>

      {/* Legend — which colour is which dimension, and the stage it's living */}
      <div
        className="absolute left-1/2 bottom-6 -translate-x-1/2 z-20 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-5 py-2.5 rounded-2xl"
        style={{ background: 'rgba(18,14,26,0.62)', border: '1px solid rgba(126,110,158,0.28)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
      >
        {CATEGORIES.map((cat) => {
          const pos = greatWork?.planes.find((p) => p.plane === cat.key)
          const stageIdx = pos ? STAGES.findIndex((s) => s.key === pos.stage) : 0
          const human = (STAGES[Math.max(0, stageIdx)] ?? STAGES[0]).human
          return (
            <div key={cat.key} className="flex items-center gap-2">
              <span style={{ width: 10, height: 10, borderRadius: 3, background: cat.color, boxShadow: `0 0 8px ${cat.color}` }} />
              <span className="text-[12.5px] font-bold" style={{ color: 'var(--text-primary)' }}>{cat.label}</span>
              <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>· {human}</span>
            </div>
          )
        })}
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
