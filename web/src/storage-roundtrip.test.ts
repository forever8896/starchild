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
 * It proves the encrypted `.starchild` file faithfully preserves everything the
 * storage layer holds (messages, creature, settings, quests) across a full
 * encrypt/decrypt/replace cycle — wrong-passphrase rejection is covered in
 * `export.test.ts`.
 */

import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import type { Message, Quest } from '../../src/store'
import {
  addMessage,
  getMessages,
  setGameState,
  getGameState,
  setSetting,
  getAllSettings,
  putQuests,
  getQuests,
  replaceAll,
} from './storage'
import type { GameState } from './wasm-bridge'
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

async function seedStorage(): Promise<void> {
  for (const m of sampleMessages) await addMessage(m)
  await setGameState(sampleGame)
  await setSetting('venice_api_key', 'sk-test')
  await setSetting('user_name', 'Kilian')
  await putQuests(sampleQuests)
}

/** Build the export payload from whatever is currently in storage. */
async function exportFromStorage(): Promise<StarchildExport> {
  const game = (await getGameState())!
  const messages = await getMessages(0)
  const quests = await getQuests()
  const settings = await getAllSettings()
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: '2026-06-26T00:00:09.000Z',
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      created_at: m.created_at,
    })),
    knowing: { facts: [], stage: 'unknown', total_facts: 0, gaps: [] },
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
  it('preserves messages, creature, settings and quests across encrypt/decrypt/replace', async () => {
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
  })

  it('replaceAll wipes prior data not present in the imported file', async () => {
    // Seed a stray message + setting that the import must clear.
    await addMessage({ id: 'stale', role: 'user', content: 'old life', created_at: '2026-06-25T00:00:00.000Z' })
    await setSetting('stale_key', 'gone')

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
    })

    expect((await getMessages(0)).some((m) => m.id === 'stale')).toBe(false)
    expect(await getAllSettings()).toEqual({ user_name: 'Kilian' })
    expect(await getQuests()).toEqual([])
  })
})
