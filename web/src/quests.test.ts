/**
 * quests.test.ts — the web quest loop's accept → complete persistence (PRD §7).
 *
 * Drives the real IndexedDB adapter (`storage.ts`, backed by `fake-indexeddb`)
 * through the same engine `platform.acceptQuest` / `platform.completeQuest` use
 * on web — extraction parsing, the active-quest write, the duplicate guard, and
 * the completion + XP award — with no WASM and no network.
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  isQuestOffer,
  parseExtraction,
  normalizeExtracted,
  fallbackExtract,
  saveAcceptedQuest,
  completeQuestRow,
  awardXp,
  DuplicateQuestError,
} from './quests'
import { getQuests, getQuest, setGameState, getGameState } from './storage'
import type { GameState } from './wasm-bridge'

// fake-indexeddb persists across tests in a module; wipe quests between cases.
async function clearQuests(): Promise<void> {
  for (const q of await getQuests()) {
    // delete via the public surface: overwrite store by reopening is overkill;
    // use indexedDB directly through a tiny inline helper.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('starchild')
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction('quests', 'readwrite')
        tx.objectStore('quests').delete(q.id)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    })
  }
}

beforeEach(async () => {
  await clearQuests()
})

describe('quest offer detection + extraction parsing', () => {
  it('recognizes the desktop offer markers', () => {
    expect(isQuestOffer('Okay — i have a quest for you ✦')).toBe(true)
    expect(isQuestOffer("here's something to try this week")).toBe(true)
    expect(isQuestOffer('just reflecting with you')).toBe(false)
  })

  it('parses clean JSON and clamps to desktop rules', () => {
    const e = parseExtraction(
      '{"title":"Walk at dawn","description":"10 min outside","category":"body","quest_type":"daily","xp_reward":999}',
    )
    expect(e).not.toBeNull()
    expect(e!.category).toBe('body')
    expect(e!.quest_type).toBe('daily')
    expect(e!.xp_reward).toBe(50) // clamped 5..50
  })

  it('tolerates ```json fences and defaults bad categories to spirit', () => {
    const e = parseExtraction('```json\n{"title":"Sit quietly","category":"vibes","quest_type":"monthly","xp_reward":3}\n```')
    expect(e!.category).toBe('spirit')
    expect(e!.quest_type).toBe('daily') // not "weekly" → daily
    expect(e!.xp_reward).toBe(5) // clamped up from 3
  })

  it('returns null for a declined extraction', () => {
    expect(parseExtraction('null')).toBeNull()
    expect(parseExtraction('   ')).toBeNull()
    expect(parseExtraction('not json at all')).toBeNull()
  })

  it('falls back to a heuristic quest from the offer text', () => {
    const e = fallbackExtract('i have a quest for you: take a ten minute walk outside today. it will help.')
    expect(e.title.toLowerCase()).toContain('take a ten minute walk')
    expect(normalizeExtracted(e).xp_reward).toBeGreaterThanOrEqual(5)
  })
})

describe('accept → complete persistence (IndexedDB)', () => {
  it('persists an accepted quest as active, then completes it with XP', async () => {
    // Seed a creature near a level boundary so completion levels it up.
    const seed: GameState = {
      hunger: 50, mood: 'Content', energy: 60, bond: 10,
      xp: 80, level: 1, last_decay_at: '2026-06-26T00:00:00.000Z',
    }
    await setGameState(seed)

    // ── ACCEPT ──
    const quest = await saveAcceptedQuest({
      title: 'Walk under the open sky',
      description: 'ten minutes outside, no phone',
      category: 'body',
      quest_type: 'daily',
      xp_reward: 30,
    })

    expect(quest.status).toBe('active')
    expect(quest.streak_count).toBe(0)
    expect(quest.completed_at).toBeNull()

    const activeAfterAccept = await getQuests('active')
    expect(activeAfterAccept).toHaveLength(1)
    expect(activeAfterAccept[0].id).toBe(quest.id)

    // ── COMPLETE ──
    const completed = await completeQuestRow(quest.id)
    expect(completed.status).toBe('completed')
    expect(completed.streak_count).toBe(1)
    expect(completed.completed_at).not.toBeNull()

    // Persisted: no longer active, now in completed.
    expect(await getQuests('active')).toHaveLength(0)
    const completedList = await getQuests('completed')
    expect(completedList).toHaveLength(1)
    expect(completedList[0].id).toBe(quest.id)
    // Re-read by id confirms the row really changed in IndexedDB.
    expect((await getQuest(quest.id))!.status).toBe('completed')

    // ── XP AWARD (mirror desktop add_xp + feed) ──
    const game = (await getGameState())!
    const { game: next, levelledUp } = awardXp(game, completed.xp_reward)
    await setGameState(next)
    // 80 + 30 = 110 ≥ 100 → level 2, carry 10 XP.
    expect(levelledUp).toBe(true)
    expect(next.level).toBe(2)
    expect(next.xp).toBe(10)
    expect(next.hunger).toBeCloseTo(53, 5) // +reward/10
    expect((await getGameState())!.level).toBe(2)
  })

  it('rejects a duplicate active quest by title (desktop dedupe guard)', async () => {
    await saveAcceptedQuest({
      title: 'Same Title', description: 'a', category: 'mind', quest_type: 'daily', xp_reward: 10,
    })
    await expect(
      saveAcceptedQuest({
        title: 'same title', description: 'b', category: 'mind', quest_type: 'daily', xp_reward: 10,
      }),
    ).rejects.toBeInstanceOf(DuplicateQuestError)
    expect(await getQuests('active')).toHaveLength(1)
  })

  it('awards XP without levelling when below the threshold', () => {
    const game: GameState = {
      hunger: 40, mood: 'Restless', energy: 50, bond: 0,
      xp: 10, level: 1, last_decay_at: '2026-06-26T00:00:00.000Z',
    }
    const { game: next, levelledUp } = awardXp(game, 50)
    expect(levelledUp).toBe(false)
    expect(next.level).toBe(1)
    expect(next.xp).toBe(60)
  })
})
