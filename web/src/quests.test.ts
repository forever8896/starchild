/**
 * quests.test.ts — the web quest loop's accept → complete PERSISTENCE (PRD §7).
 *
 * The pure quest logic (offer detection, parse/normalize/clamp, fallback, the
 * XP/feed reward math) now lives once in `starchild_core` and is unit-tested in
 * Rust (`src-tauri/core/src/quest.rs`, `game.rs`). This file covers what is
 * web-only: the IndexedDB writes behind `platform.acceptQuest` /
 * `platform.completeQuest` — plus a smoke test that the shared core surface is
 * reachable across the WASM bridge.
 *
 * Runs in Node (vitest) over `fake-indexeddb`; the WASM core is initialized from
 * the on-disk `.wasm` bytes (same pattern as `wasm-bridge.test.ts`).
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { saveAcceptedQuest, completeQuestRow, DuplicateQuestError } from './quests'
import { getQuests, getQuest, setGameState, getGameState } from './storage'
import { loadCore, type Core, type GameState } from './wasm-bridge'

const wasmPath = fileURLToPath(new URL('./wasm/starchild_core_bg.wasm', import.meta.url))

let core: Core

beforeAll(async () => {
  const bytes = await readFile(wasmPath)
  // loadCore caches the first init; saveAcceptedQuest's internal loadCore() reuses it.
  core = await loadCore(new Uint8Array(bytes))
})

// fake-indexeddb persists across tests in a module; wipe quests between cases.
async function clearQuests(): Promise<void> {
  for (const q of await getQuests()) {
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

describe('shared core surface (via the WASM bridge)', () => {
  it('detects the desktop offer markers', () => {
    expect(core.isQuestOffer('Okay — i have a quest for you ✦')).toBe(true)
    expect(core.isQuestOffer("here's something to try this week")).toBe(true)
    expect(core.isQuestOffer('just reflecting with you')).toBe(false)
  })

  it('parses + clamps an extraction, and declines on null', () => {
    const e = core.parseQuestExtraction(
      '{"title":"Walk at dawn","description":"10 min outside","category":"body","quest_type":"daily","xp_reward":999}',
    )
    expect(e).not.toBeNull()
    expect(e!.category).toBe('body')
    expect(e!.xp_reward).toBe(50) // clamped 5..50
    expect(core.parseQuestExtraction('null')).toBeNull()
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

    // ── XP AWARD (shared core math — mirror desktop add_xp + feed) ──
    const game = (await getGameState())!
    const { state: next, levelled_up } = core.questCompleteReward(game, completed.xp_reward)
    await setGameState(next)
    // 80 + 30 = 110 ≥ 100 → level 2, carry 10 XP.
    expect(levelled_up).toBe(true)
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
    const { state: next, levelled_up } = core.questCompleteReward(game, 50)
    expect(levelled_up).toBe(false)
    expect(next.level).toBe(1)
    expect(next.xp).toBe(60)
  })
})
