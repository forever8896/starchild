/**
 * quests.ts — the web shell's quest engine (PRD §7).
 *
 * Desktop runs the quest loop in Rust (`src-tauri/src/lib.rs` +
 * `src-tauri/src/db/mod.rs`); this module ports the SAME loop to the browser so
 * the gamified experience works on web:
 *
 *   OFFER     — an assistant reply in the Quest phase says "i have a quest for
 *               you …"; the UI surfaces accept/decline.
 *   ACCEPT    — extract the offered quest (LLM in `web.ts`, with the heuristic
 *               fallback here) and persist it to IndexedDB as an `active` quest.
 *   COMPLETE  — mark it `completed`, award XP + feed the creature, and surface
 *               the celebration (events emitted from `web.ts`).
 *
 * The values mirror the desktop validators (`VALID_CATEGORIES`,
 * `VALID_QUEST_TYPES`) and `db::create_quest` / `db::complete_quest`. Anything
 * here is pure or IndexedDB-only (no WASM, no network) so it is unit-testable.
 */

import type { Quest } from '../../src/store'
import type { GameState } from './wasm-bridge'
import { getQuests, getQuest, putQuest } from './storage'

// ── Validation tables (mirror src-tauri/src/lib.rs) ──────────────────────────

export const VALID_CATEGORIES = ['body', 'mind', 'spirit'] as const
export const VALID_QUEST_TYPES = ['daily', 'weekly'] as const

/** Phrases an assistant reply uses to mark a quest offer (mirror desktop). */
const QUEST_OFFER_MARKERS = [
  'quest for you',
  'i have a quest',
  "here's something to try",
]

/** True when an assistant reply contains a quest offer the UI should surface. */
export function isQuestOffer(text: string): boolean {
  const lower = text.toLowerCase()
  return QUEST_OFFER_MARKERS.some((m) => lower.includes(m))
}

// ── Quest extraction (the JSON shape the desktop LLM returns) ────────────────

export interface ExtractedQuest {
  title: string
  description: string
  category: string
  quest_type: string
  xp_reward: number
}

/** The system + user prompt the desktop uses to extract a quest. */
export const QUEST_EXTRACTION_SYSTEM =
  'Extract quest details from conversation. Return ONLY valid JSON.'

export function buildExtractionPrompt(recentContext: string): string {
  return (
    'Extract the quest from this conversation. The Starchild offered a quest and the human accepted.\n\n' +
    `Recent conversation:\n${recentContext}\n\n` +
    'Extract ONLY the specific quest/task that was offered. Return a JSON object:\n' +
    '{\n' +
    '  "title": "short quest title, max 60 chars, warm tone",\n' +
    '  "description": "1-2 sentence description of what to do",\n' +
    '  "category": "one of: body, mind, spirit",\n' +
    '  "quest_type": "daily or weekly",\n' +
    '  "xp_reward": 10-50 based on difficulty\n' +
    '}\n\n' +
    'Category guide:\n' +
    '- body: physical activity, health, movement, nature, embodiment\n' +
    '- mind: learning, reading, studying, thinking, creating, building\n' +
    '- spirit: meditation, reflection, inner work, connection, relationships, alchemy, presence\n\n' +
    'If no clear quest was offered, return exactly: null\n' +
    'Return ONLY valid JSON, no markdown fences, no explanation.'
  )
}

/**
 * Parse + normalize a raw LLM extraction response into a valid {@link ExtractedQuest},
 * applying the same defaults/clamps the desktop does. Returns `null` when the
 * model declined (`"null"`) or the JSON could not be parsed.
 */
export function parseExtraction(raw: string): ExtractedQuest | null {
  let trimmed = raw.trim()
  if (trimmed === '' || trimmed.toLowerCase() === 'null') return null
  // Tolerate ```json fences the model may add despite instructions.
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) trimmed = fence[1].trim()
  // Or a JSON object embedded in prose.
  if (!trimmed.startsWith('{')) {
    const obj = trimmed.match(/\{[\s\S]*\}/)
    if (obj) trimmed = obj[0]
  }

  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null

  const title = typeof obj.title === 'string' ? obj.title.trim() : ''
  if (!title) return null

  return normalizeExtracted({
    title,
    description: typeof obj.description === 'string' ? obj.description : '',
    category: typeof obj.category === 'string' ? obj.category : '',
    quest_type: typeof obj.quest_type === 'string' ? obj.quest_type : '',
    xp_reward: typeof obj.xp_reward === 'number' ? obj.xp_reward : 10,
  })
}

/** Apply the desktop's category/type defaults and XP clamp (5–50). */
export function normalizeExtracted(e: ExtractedQuest): ExtractedQuest {
  const category = (VALID_CATEGORIES as readonly string[]).includes(e.category)
    ? e.category
    : 'spirit'
  const quest_type = e.quest_type === 'weekly' ? 'weekly' : 'daily'
  const xp_reward = Math.min(50, Math.max(5, Math.round(e.xp_reward || 10)))
  return { title: e.title.trim().slice(0, 200), description: e.description.trim(), category, quest_type, xp_reward }
}

/**
 * Heuristic fallback when no LLM is reachable (trial exhausted / offline). Turns
 * the offer message into a serviceable quest so ACCEPT never dead-ends.
 */
export function fallbackExtract(offerText: string): ExtractedQuest {
  // Title: the first sentence after the offer marker, else the first sentence.
  const lower = offerText.toLowerCase()
  let from = 0
  for (const m of QUEST_OFFER_MARKERS) {
    const i = lower.indexOf(m)
    if (i >= 0) { from = i + m.length; break }
  }
  const tail = offerText.slice(from).replace(/^[:\s—-]+/, '')
  const sentence = (tail.split(/(?<=[.!?])\s/)[0] || tail || 'A small step toward your vision').trim()
  const title = sentence.replace(/\s+/g, ' ').slice(0, 60) || 'A small step'
  return normalizeExtracted({
    title,
    description: sentence,
    category: 'spirit',
    quest_type: 'daily',
    xp_reward: 15,
  })
}

// ── Persistence (mirror db::create_quest / db::complete_quest) ───────────────

const uuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

const sqlNow = (): string => new Date().toISOString().replace('T', ' ').slice(0, 19)

export class DuplicateQuestError extends Error {
  constructor(title: string) {
    super(`Quest with same title already exists: ${title}`)
    this.name = 'DuplicateQuestError'
  }
}

/**
 * Persist an accepted quest as a fresh `active` row (mirror `db::create_quest`).
 * Guards against duplicate active titles exactly like the desktop extractor.
 */
export async function saveAcceptedQuest(extracted: ExtractedQuest): Promise<Quest> {
  const e = normalizeExtracted(extracted)
  const active = await getQuests('active')
  if (active.some((q) => q.title.toLowerCase() === e.title.toLowerCase())) {
    throw new DuplicateQuestError(e.title)
  }
  const quest: Quest = {
    id: uuid(),
    title: e.title,
    description: e.description || null,
    quest_type: e.quest_type,
    category: e.category,
    status: 'active',
    xp_reward: e.xp_reward,
    streak_count: 0,
    created_at: sqlNow(),
    completed_at: null,
    due_at: null,
  }
  await putQuest(quest)
  return quest
}

/**
 * Mark an `active` quest `completed` (mirror `db::complete_quest`): set the
 * completion timestamp and bump the streak. Throws if the quest is missing.
 */
export async function completeQuestRow(id: string): Promise<Quest> {
  const quest = await getQuest(id)
  if (!quest) throw new Error(`Quest not found: ${id}`)
  if (quest.status === 'completed') return quest
  const completed: Quest = {
    ...quest,
    status: 'completed',
    completed_at: sqlNow(),
    streak_count: quest.streak_count + 1,
  }
  await putQuest(completed)
  return completed
}

// ── XP / levelling (mirror core/src/game.rs add_xp + feed) ────────────────────

export function deriveMood(hunger: number): string {
  if (hunger >= 90) return 'Ecstatic'
  if (hunger >= 70) return 'Happy'
  if (hunger >= 50) return 'Content'
  if (hunger >= 30) return 'Restless'
  if (hunger >= 15) return 'Hungry'
  return 'Starving'
}

/**
 * Award `xp` and feed the creature exactly as the desktop quest completion does
 * (`game.add_xp(reward); game.feed(reward / 10.0)`). Returns the next state and
 * whether the Starchild levelled up. Each level requires `level * 100` XP.
 */
export function awardXp(game: GameState, xp: number): { game: GameState; levelledUp: boolean } {
  let level = game.level
  let total = game.xp + xp
  let levelledUp = false
  while (total >= level * 100) {
    total -= level * 100
    level += 1
    levelledUp = true
  }
  // feed(xp / 10): hunger up, small bond bump, mood refresh.
  const hunger = Math.min(100, Math.max(0, game.hunger + xp / 10))
  const bond = Math.min(100, Math.max(0, game.bond + 0.1))
  return {
    game: { ...game, xp: total, level, hunger, bond, mood: deriveMood(hunger) },
    levelledUp,
  }
}
