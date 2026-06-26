/**
 * storage.ts — the web shell's IndexedDB storage adapter (PRD §4.2, §4.5).
 *
 * The desktop keeps conversation data in local SQLite; the web keeps the exact
 * same shapes in the browser's IndexedDB. Nothing leaves the device. This module
 * is the low-level persistence the web `Platform` implementation builds on:
 * messages, the creature's game state, key/value settings, and quests (the last
 * mostly so the encrypted `.starchild` export can round-trip with desktop).
 *
 * The persisted creature row is the full {@link GameState} (it carries the decay
 * clock `last_decay_at`); the `Platform.getState()` surface drops that and hands
 * the UI the lighter `StarchildState`.
 */

import type { Message, Quest } from '../../src/store'
import type { GameState, KnownFact } from './wasm-bridge'

const DB_NAME = 'starchild'
// v2 adds the `knowing` store (the 7-dimension facts the recall ranker + the
// knowing prompt fragment read). Bumping the version triggers `onupgradeneeded`,
// which creates the new store without touching existing data.
const DB_VERSION = 2

const STORE_MESSAGES = 'messages'
const STORE_STATE = 'state'
const STORE_SETTINGS = 'settings'
const STORE_QUESTS = 'quests'
const STORE_KNOWING = 'knowing'

/** The persisted message row — the shared `Message` plus an ordering key. */
interface StoredMessage extends Message {
  /** Monotonic sequence for stable chronological ordering. */
  seq: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment.'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        const store = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' })
        store.createIndex('seq', 'seq', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_STATE)) {
        db.createObjectStore(STORE_STATE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(STORE_QUESTS)) {
        db.createObjectStore(STORE_QUESTS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_KNOWING)) {
        db.createObjectStore(STORE_KNOWING, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB.'))
  })
  return dbPromise
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = run(t.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed.'))
      }),
  )
}

function getAll<T>(store: string): Promise<T[]> {
  return tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
}

// ─── Messages ────────────────────────────────────────────────────────────────

let seqCounter = 0
function nextSeq(): number {
  // Monotonic even within the same millisecond.
  const now = Date.now()
  seqCounter = now > seqCounter ? now : seqCounter + 1
  return seqCounter
}

export async function addMessage(msg: Message): Promise<void> {
  const row: StoredMessage = { ...msg, seq: nextSeq() }
  await tx(STORE_MESSAGES, 'readwrite', (s) => s.put(row))
}

/** The most recent `limit` messages in chronological (oldest → newest) order. */
export async function getMessages(limit: number): Promise<Message[]> {
  const rows = await getAll<StoredMessage>(STORE_MESSAGES)
  rows.sort((a, b) => a.seq - b.seq)
  const recent = limit > 0 ? rows.slice(-limit) : rows
  return recent.map(({ seq: _seq, ...m }) => m)
}

export async function deleteMessage(id: string): Promise<void> {
  await tx(STORE_MESSAGES, 'readwrite', (s) => s.delete(id))
}

// ─── Creature state (full GameState, with decay clock) ───────────────────────

interface StoredState extends GameState {
  id: 1
}

export async function getGameState(): Promise<GameState | null> {
  const row = await tx<StoredState | undefined>(STORE_STATE, 'readonly', (s) =>
    s.get(1) as IDBRequest<StoredState | undefined>,
  )
  if (!row) return null
  const { id: _id, ...state } = row
  return state
}

export async function setGameState(state: GameState): Promise<void> {
  const row: StoredState = { ...state, id: 1 }
  await tx(STORE_STATE, 'readwrite', (s) => s.put(row))
}

// ─── Settings (key/value) ────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const row = await tx<{ key: string; value: string } | undefined>(
    STORE_SETTINGS,
    'readonly',
    (s) => s.get(key) as IDBRequest<{ key: string; value: string } | undefined>,
  )
  return row ? row.value : null
}

export async function setSetting(key: string, value: string): Promise<void> {
  await tx(STORE_SETTINGS, 'readwrite', (s) => s.put({ key, value }))
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await getAll<{ key: string; value: string }>(STORE_SETTINGS)
  const out: Record<string, string> = {}
  for (const r of rows) out[r.key] = r.value
  return out
}

// ─── Quests (kept mainly for export round-trip) ──────────────────────────────

export async function getQuests(status?: string): Promise<Quest[]> {
  const rows = await getAll<Quest>(STORE_QUESTS)
  return status ? rows.filter((q) => q.status === status) : rows
}

export async function getQuest(id: string): Promise<Quest | null> {
  const row = await tx<Quest | undefined>(STORE_QUESTS, 'readonly', (s) =>
    s.get(id) as IDBRequest<Quest | undefined>,
  )
  return row ?? null
}

export async function putQuests(quests: Quest[]): Promise<void> {
  for (const q of quests) {
    await tx(STORE_QUESTS, 'readwrite', (s) => s.put(q))
  }
}

/** Persist a single quest row (create or update). */
export async function putQuest(quest: Quest): Promise<void> {
  await tx(STORE_QUESTS, 'readwrite', (s) => s.put(quest))
}

// ─── Knowing facts (the 7-dimension understanding of the human) ──────────────

/** Append one extracted fact about the human. */
export async function addKnowingFact(fact: KnownFact): Promise<void> {
  await tx(STORE_KNOWING, 'readwrite', (s) => s.put(fact))
}

/** All stored knowing facts (the recall pool + the knowing-fragment source). */
export async function getKnowingFacts(): Promise<KnownFact[]> {
  return getAll<KnownFact>(STORE_KNOWING)
}

// ─── Bulk replace (import) ───────────────────────────────────────────────────

/** Wipe every store, then load a fresh dataset (used by `importData`). */
export async function replaceAll(input: {
  messages: Message[]
  state: GameState | null
  settings: Record<string, string>
  quests: Quest[]
}): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(
      [STORE_MESSAGES, STORE_STATE, STORE_SETTINGS, STORE_QUESTS, STORE_KNOWING],
      'readwrite',
    )
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error ?? new Error('IndexedDB import failed.'))
    t.objectStore(STORE_MESSAGES).clear()
    t.objectStore(STORE_STATE).clear()
    t.objectStore(STORE_SETTINGS).clear()
    t.objectStore(STORE_QUESTS).clear()
    // Knowing facts are rebuilt from conversation; a fresh dataset starts clean.
    t.objectStore(STORE_KNOWING).clear()
    let seq = Date.now()
    for (const m of input.messages) {
      t.objectStore(STORE_MESSAGES).put({ ...m, seq: seq++ } satisfies StoredMessage)
    }
    if (input.state) {
      t.objectStore(STORE_STATE).put({ ...input.state, id: 1 } satisfies StoredState)
    }
    for (const [key, value] of Object.entries(input.settings)) {
      t.objectStore(STORE_SETTINGS).put({ key, value })
    }
    for (const q of input.quests) {
      t.objectStore(STORE_QUESTS).put(q)
    }
  })
}
