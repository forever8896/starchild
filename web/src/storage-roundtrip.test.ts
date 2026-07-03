/**
 * storage-roundtrip.test.ts — export → import round-trip through the real
 * storage layer (PRD §5, §4.5).
 *
 * This drives the actual IndexedDB adapter (`storage.ts`, backed by
 * `fake-indexeddb` here) end-to-end the same way `platform.exportData` /
 * `platform.importData` do:
 *
 *   seed IndexedDB → read it all out → `encryptExport` → `decryptImport`
 *   → `replaceAll` back into IndexedDB → read it out again → assert identical.
 *
 * It proves the encrypted `.starchild` file faithfully preserves EVERYTHING the
 * storage layer holds — messages, creature, settings, quests, the knowing
 * profile's facts, and the Great Work position — across a full
 * encrypt/decrypt/replace cycle. (The knowing facts + Great Work position are
 * the companion's accumulated understanding: a backup that drops them silently
 * forgets the user, which is exactly the regression this file must catch.)
 * Wrong-passphrase rejection is covered in `export.test.ts`.
 */

import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import type { Message, Quest, GreatWorkPosition } from '../../src/store'
import {
  addMessage,
  getMessages,
  setGameState,
  getGameState,
  setSetting,
  getAllSettings,
  putQuests,
  getQuests,
  addKnowingFact,
  getKnowingFacts,
  setGreatWorkPosition,
  getGreatWorkPosition,
  replaceAll,
} from './storage'
import type { GameState, KnownFact } from './wasm-bridge'
import {
  encryptExport,
  decryptImport,
  EXPORT_SCHEMA_VERSION,
  type StarchildExport,
  type EncryptOptions,
} from './export'

// Cheap Argon2id cost so the suite stays fast (matches export.test.ts).
const FAST: EncryptOptions = { kdf: { t: 1, m: 256, p: 1 } }
const PASS = 'a moon, a wand, a world without money'

const sampleGame: GameState = {
  hunger: 73,
  mood: 'Content',
  energy: 61,
  bond: 44,
  xp: 210,
  level: 4,
  last_decay_at: '2026-06-26T00:00:00.000Z',
} as GameState

const sampleMessages: Message[] = [
  { id: 'm1', role: 'user', content: 'are you really here?', created_at: '2026-06-26T00:00:01.000Z' },
  { id: 'm2', role: 'assistant', content: 'as much as you are 🌌', created_at: '2026-06-26T00:00:02.000Z' },
]

const sampleQuests: Quest[] = [
  {
    id: 'q1',
    title: 'walk under the sky',
    description: 'ten minutes outside',
    quest_type: 'daily',
    category: 'body',
    status: 'active',
    xp_reward: 10,
    streak_count: 3,
    created_at: '2026-06-26T00:00:04.000Z',
    completed_at: null,
    due_at: null,
  },
]

const sampleFacts: KnownFact[] = [
  {
    id: 'f1',
    category: 'values',
    fact: 'honesty matters more to them than comfort',
    importance: 8,
    confidence: 0.9,
    created_at: '2026-06-26T00:00:05.000Z',
  },
  {
    id: 'f2',
    category: 'desires',
    fact: 'wants to live surrounded by nature, practicing alchemy',
    importance: 9,
    confidence: 0.95,
    created_at: '2026-06-26T00:00:06.000Z',
  },
]

const samplePosition: GreatWorkPosition = {
  preferential_reality: 'living in nature, studying alchemy, healing the world',
  planes: [
    { plane: 'body', stage: 'dissolution', cells_worked: ['calcination'], evidence: [], stuck: false },
    { plane: 'mind', stage: 'calcination', cells_worked: [], evidence: [], stuck: false },
    { plane: 'spirit', stage: 'calcination', cells_worked: [], evidence: [], stuck: false },
  ],
  active_cell: { plane: 'body', stage: 'dissolution' },
  total_cells_worked: 1,
  last_advanced_at: '2026-06-26T00:00:07.000Z',
}

async function seedStorage(): Promise<void> {
  for (const m of sampleMessages) await addMessage(m)
  await setGameState(sampleGame)
  await setSetting('venice_api_key', 'sk-test')
  await setSetting('user_name', 'Kilian')
  await putQuests(sampleQuests)
  for (const f of sampleFacts) await addKnowingFact(f)
  await setGreatWorkPosition(samplePosition)
}

/** Build the export payload from whatever is currently in storage — mirrors
 *  `platform.exportData` (including the knowing facts + Great Work position). */
async function exportFromStorage(): Promise<StarchildExport> {
  const game = (await getGameState())!
  const messages = await getMessages(0)
  const quests = await getQuests()
  const settings = await getAllSettings()
  const facts = await getKnowingFacts()
  const greatWork = await getGreatWorkPosition<GreatWorkPosition>()
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: '2026-06-26T00:00:09.000Z',
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      created_at: m.created_at,
    })),
    knowing: {
      facts: facts.map((f) => ({ ...f })),
      stage: 'exported',
      total_facts: facts.length,
      gaps: [],
    },
    great_work: greatWork,
    quests: quests.map((q) => ({ ...q })),
    creature: {
      hunger: game.hunger,
      mood: game.mood,
      energy: game.energy,
      bond: game.bond,
      xp: game.xp,
      level: game.level,
    },
    settings,
  }
}

describe('export → import round-trip through the storage layer', () => {
  it('preserves messages, creature, settings, quests, knowing facts and the Great Work position', async () => {
    // 1. Seed the real IndexedDB-backed storage.
    await seedStorage()

    // 2. Read it all out and encrypt into a .starchild blob.
    const payload = await exportFromStorage()
    const blob = await encryptExport(payload, PASS, FAST)

    // 3. Decrypt back and replaceAll into storage (the import path).
    const restored = await decryptImport(blob, PASS)
    await replaceAll({
      messages: restored.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created_at: m.created_at,
      })),
      state: {
        ...sampleGame,
        hunger: restored.creature.hunger,
        mood: restored.creature.mood,
        energy: restored.creature.energy,
        bond: restored.creature.bond,
        xp: restored.creature.xp,
        level: restored.creature.level,
      },
      settings: restored.settings,
      quests: restored.quests.map((q) => ({ ...q })) as Quest[],
      knowingFacts: (restored.knowing?.facts ?? []).map((f) => ({ ...f })),
      greatWork: restored.great_work ?? null,
    })

    // 4. Read storage again — everything must match what we started with.
    expect(await getMessages(0)).toEqual(sampleMessages)
    expect(await getQuests()).toEqual(sampleQuests)
    expect(await getAllSettings()).toEqual({
      venice_api_key: 'sk-test',
      user_name: 'Kilian',
    })
    const game = (await getGameState())!
    expect({
      hunger: game.hunger,
      mood: game.mood,
      energy: game.energy,
      bond: game.bond,
      xp: game.xp,
      level: game.level,
    }).toEqual({ hunger: 73, mood: 'Content', energy: 61, bond: 44, xp: 210, level: 4 })

    // 5. The soul survives: knowing facts + Great Work position intact.
    const factsAfter = await getKnowingFacts()
    expect(factsAfter.sort((a, b) => a.id.localeCompare(b.id))).toEqual(sampleFacts)
    expect(await getGreatWorkPosition<GreatWorkPosition>()).toEqual(samplePosition)
  })

  it('replaceAll wipes prior data not present in the imported file', async () => {
    // Seed stray rows in every store that the import must clear.
    await addMessage({ id: 'stale', role: 'user', content: 'old life', created_at: '2026-06-25T00:00:00.000Z' })
    await setSetting('stale_key', 'gone')
    await addKnowingFact({
      id: 'stale-fact',
      category: 'fears',
      fact: 'should be wiped',
      importance: 1,
      confidence: 0.1,
      created_at: '2026-06-25T00:00:00.000Z',
    })
    await setGreatWorkPosition(samplePosition)

    const blob = await encryptExport(
      {
        schemaVersion: EXPORT_SCHEMA_VERSION,
        exportedAt: '2026-06-26T00:00:09.000Z',
        messages: sampleMessages.map((m) => ({ ...m })),
        knowing: { facts: [], stage: 'unknown', total_facts: 0, gaps: [] },
        quests: [],
        creature: { hunger: 50, mood: 'Content', energy: 50, bond: 0, xp: 0, level: 1 },
        settings: { user_name: 'Kilian' },
      },
      PASS,
      FAST,
    )
    const restored = await decryptImport(blob, PASS)
    await replaceAll({
      messages: restored.messages.map((m) => ({ ...m })),
      state: null,
      settings: restored.settings,
      quests: [],
      knowingFacts: restored.knowing?.facts ?? [],
      greatWork: restored.great_work ?? null,
    })

    expect((await getMessages(0)).some((m) => m.id === 'stale')).toBe(false)
    expect(await getAllSettings()).toEqual({ user_name: 'Kilian' })
    expect(await getQuests()).toEqual([])
    // A file without knowing/great_work leaves both stores empty (old-file import).
    expect(await getKnowingFacts()).toEqual([])
    expect(await getGreatWorkPosition()).toBeNull()
  })
})
