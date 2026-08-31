/**
 * quests.ts — the web shell's quest PERSISTENCE (PRD §7).
 *
 * All the PURE quest logic — offer-phrase detection, the extraction prompt,
 * parse/normalize/clamp, the offline heuristic fallback, and the XP/feed reward
 * math — now lives ONCE in the shared `starchild_core` crate and is reached
 * through the WASM bridge (`loadCore()` in `./wasm-bridge`). The desktop shell
 * (`src-tauri/src/lib.rs`) calls those same core functions, so the gamified loop
 * is single-sourced across both shells.
 *
 * What remains here is web-only: writing accepted/completed quests to IndexedDB
 * (the desktop equivalent is `db::create_quest` / `db::complete_quest`). These
 * are storage adapters, not logic, so they stay in the web shell.
 */

import type { Quest } from '../../src/store'
import type { ExtractedQuest } from './wasm-bridge'
import { loadCore } from './wasm-bridge'
import { getQuests, getQuest, putQuest } from './storage'

// Re-export the boundary type so existing importers keep their import site.
export type { ExtractedQuest } from './wasm-bridge'

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
 * Normalizes through the shared core (idempotent) and guards against duplicate
 * active titles exactly like the desktop extractor.
 */
export async function saveAcceptedQuest(extracted: ExtractedQuest): Promise<Quest> {
  const core = await loadCore()
  const e = core.normalizeQuest(extracted)
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
