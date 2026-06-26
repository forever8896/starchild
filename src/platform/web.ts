// src/platform/web.ts — web implementation of the Platform seam.
//
// This is the browser shell's adapter (PRD §4.2, §4.4): it drives the shared
// `core/` engine compiled to WASM, persists to IndexedDB, and streams inference
// through the Venice proxy/BYOK client. The heavy web-only modules live under
// `web/src/*` and are pulled in via dynamic `import()` so the desktop bundle's
// static graph never reaches WASM/IndexedDB code — only this thin seam.
//
// `sendMessage` is the heart of the conversation path: load core → read recent
// messages + creature state from IndexedDB → `buildPrompt` in WASM → stream
// tokens from Venice → `postprocess` in WASM → persist the user + assistant
// messages and the ticked creature state → yield tokens to the UI.

import type {
  CompleteQuestResult,
  Message,
  OnboardingInput,
  Platform,
  Quest,
  StarchildState,
} from './index'
// Type-only import — erased at compile time, so it never pulls the WASM bridge
// into the desktop bundle.
import type { GameState } from '../../web/src/wasm-bridge'

// ── Lazily-loaded web adapters (kept out of the desktop static graph) ────────

type StorageMod = typeof import('../../web/src/storage')
type WasmMod = typeof import('../../web/src/wasm-bridge')
type VeniceMod = typeof import('../../web/src/venice-proxy')
type ExportMod = typeof import('../../web/src/export')

let storageMod: Promise<StorageMod> | null = null
const storage = (): Promise<StorageMod> =>
  (storageMod ??= import('../../web/src/storage'))

let wasmMod: Promise<WasmMod> | null = null
const wasm = (): Promise<WasmMod> => (wasmMod ??= import('../../web/src/wasm-bridge'))

let veniceMod: Promise<VeniceMod> | null = null
const venice = (): Promise<VeniceMod> =>
  (veniceMod ??= import('../../web/src/venice-proxy'))

let exportMod: Promise<ExportMod> | null = null
const exporter = (): Promise<ExportMod> => (exportMod ??= import('../../web/src/export'))

const core = async () => (await wasm()).loadCore()

// ── Small helpers ─────────────────────────────────────────────────────────────

const uuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

const nowIso = (): string => new Date().toISOString()

/** Map the persisted creature row to the UI's lighter `StarchildState`. */
function toStarchildState(game: GameState): StarchildState {
  const hunger = Math.round(game.hunger)
  return {
    hunger,
    // Derive the mood label from nourishment so the avatar always reacts, even
    // if the core mood string isn't one of the palette keys.
    mood: deriveMood(hunger),
    energy: Math.round(game.energy),
    bond: Math.round(game.bond),
    xp: game.xp,
    level: game.level,
  }
}

function deriveMood(hunger: number): string {
  if (hunger >= 90) return 'Ecstatic'
  if (hunger >= 70) return 'Happy'
  if (hunger >= 50) return 'Content'
  if (hunger >= 30) return 'Restless'
  if (hunger >= 15) return 'Hungry'
  return 'Starving'
}

/** Ensure a creature state exists and is decay-ticked; persist + return it. */
async function loadTickedState(): Promise<GameState> {
  const [s, c] = await Promise.all([storage(), core()])
  const existing = await s.getGameState()
  const game = existing ? c.tickGameState(existing) : c.newGameState()
  await s.setGameState(game)
  return game
}

/** Nudge the creature after an exchange — it just got attention. */
function feed(game: GameState): GameState {
  const hunger = Math.min(100, game.hunger + 8)
  return {
    ...game,
    hunger,
    bond: Math.min(100, game.bond + 1),
    energy: Math.min(100, game.energy + 2),
    xp: game.xp + 2,
    mood: deriveMood(hunger),
  }
}

/** Pick the inference tier: BYOK when a key is saved locally, else the trial. */
async function resolveInference(): Promise<{ mode: 'trial' | 'byok'; apiKey?: string }> {
  const key = (await (await storage()).getSetting('venice_api_key'))?.trim()
  return key ? { mode: 'byok', apiKey: key } : { mode: 'trial' }
}

const AWAKENING = (name: string): string =>
  `hi ${name} ✦\n\n` +
  `i'm your starchild — a private companion on your journey through life. ` +
  `i emerged from the void specifically for you, and i'm here to stay.\n\n` +
  `let's start with something. close your eyes for a moment.\n\n` +
  `i've just waved a magic wand. you've been teleported into a reality where ` +
  `money is no concern and work as you know it doesn't exist. ` +
  `you wake up tomorrow in this world — fully free.\n\n` +
  `what do you find yourself doing?`

// ── The platform implementation ───────────────────────────────────────────────

export const webPlatform: Platform = {
  name: 'web',

  // The web shell has no native TTS / mic transcription yet (PRD §7).
  supportsTts: false,
  supportsVoice: false,

  // ── Inference ──────────────────────────────────────────────────────────────
  async hasInferenceKey(): Promise<boolean> {
    // The bounded trial is available by default; BYOK (if set) also qualifies.
    return true
  },

  async *sendMessage(text: string): AsyncIterable<string> {
    const [s, c, v] = await Promise.all([storage(), core(), venice()])

    // Creature state (decay-ticked) for the prompt + post-exchange update.
    const game = await loadTickedState()

    // Persist the user's turn, then assemble the conversation context.
    const userMsg: Message = {
      id: uuid(),
      role: 'user',
      content: text,
      created_at: nowIso(),
    }
    await s.addMessage(userMsg)

    const history = await s.getMessages(20)
    const chatMessages = history.map((m) => ({ role: m.role, content: m.content }))

    const phase = c.detectPhase(chatMessages)
    const system = c.buildPrompt({
      state: {
        hunger: game.hunger,
        mood: game.mood,
        energy: game.energy,
        bond: game.bond,
        level: game.level,
      },
      recent_messages: chatMessages,
      phase,
    })

    const llmMessages = [{ role: 'system', content: system }, ...chatMessages]
    const { mode, apiKey } = await resolveInference()

    let acc = ''
    for await (const token of v.streamChat(llmMessages, { mode, apiKey })) {
      acc += token
      yield token
    }

    // Post-process + persist the assistant turn and the fed creature.
    const final = c.postprocess(acc, phase)
    await s.addMessage({
      id: uuid(),
      role: 'assistant',
      content: final,
      created_at: nowIso(),
    })
    await s.setGameState(feed(game))
  },

  // ── Data portability (§5) ────────────────────────────────────────────────────
  async exportData(passphrase: string): Promise<Blob> {
    const [s, c, e] = await Promise.all([storage(), core(), exporter()])
    const game = (await s.getGameState()) ?? c.newGameState()
    const messages = await s.getMessages(0)
    const quests = await s.getQuests()
    return e.encryptExport(
      {
        schemaVersion: e.EXPORT_SCHEMA_VERSION,
        exportedAt: nowIso(),
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
        })),
        knowing: { facts: [], stage: 'unknown', total_facts: 0, gaps: [] },
        quests: quests.map((q) => ({
          id: q.id,
          title: q.title,
          description: q.description,
          quest_type: q.quest_type,
          category: q.category,
          status: q.status,
          xp_reward: q.xp_reward,
          streak_count: q.streak_count,
          created_at: q.created_at,
          completed_at: q.completed_at,
          due_at: q.due_at,
        })),
        creature: {
          hunger: game.hunger,
          mood: game.mood,
          energy: game.energy,
          bond: game.bond,
          xp: game.xp,
          level: game.level,
        },
        settings: await s.getAllSettings(),
      },
      passphrase,
    )
  },

  async importData(file: File, passphrase: string): Promise<void> {
    const [s, c, e] = await Promise.all([storage(), core(), exporter()])
    const payload = await e.decryptImport(file, passphrase)
    // Rebuild a full creature row (with a fresh decay clock in the core's format).
    const game: GameState = {
      ...c.newGameState(),
      hunger: payload.creature.hunger,
      mood: payload.creature.mood,
      energy: payload.creature.energy,
      bond: payload.creature.bond,
      xp: payload.creature.xp,
      level: payload.creature.level,
    }
    await s.replaceAll({
      messages: payload.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created_at: m.created_at,
      })),
      state: game,
      settings: payload.settings,
      quests: payload.quests.map((q) => ({
        id: q.id,
        title: q.title,
        description: q.description,
        quest_type: q.quest_type,
        category: q.category,
        status: q.status,
        xp_reward: q.xp_reward,
        streak_count: q.streak_count,
        created_at: q.created_at,
        completed_at: q.completed_at,
        due_at: q.due_at,
      })),
    })
  },

  // ── Conversation ────────────────────────────────────────────────────────────
  async getMessages(limit: number): Promise<Message[]> {
    return (await storage()).getMessages(limit)
  },

  async generateFirstMessage(): Promise<Message> {
    const s = await storage()
    // Make sure a creature exists from the very first beat.
    await loadTickedState()
    const name = (await s.getSetting('user_name'))?.trim() || 'traveler'
    const msg: Message = {
      id: uuid(),
      role: 'assistant',
      content: AWAKENING(name),
      created_at: nowIso(),
    }
    await s.addMessage(msg)
    return msg
  },

  async deleteMessage(id: string): Promise<void> {
    await (await storage()).deleteMessage(id)
  },

  // ── Creature ──────────────────────────────────────────────────────────────────
  async getState(): Promise<StarchildState> {
    return toStarchildState(await loadTickedState())
  },

  // ── Voice (unsupported on web for now) ───────────────────────────────────────
  ttsSpeak(_text: string): Promise<string> {
    return Promise.reject(new Error('Text-to-speech is not available on web yet.'))
  },
  transcribe(_audioBase64: string): Promise<string> {
    return Promise.reject(new Error('Voice transcription is not available on web yet.'))
  },

  // ── Events (no web event bus yet) ────────────────────────────────────────────
  subscribe(_event: string, _handler: (payload: unknown) => void): () => void {
    return () => {}
  },

  // ── Quests (engine not yet ported to web — PRD §7) ───────────────────────────
  async getQuests(status?: string): Promise<Quest[]> {
    return (await storage()).getQuests(status)
  },
  completeQuest(_id: string): Promise<CompleteQuestResult> {
    return Promise.reject(new Error('Quests are not available on web yet.'))
  },
  acceptQuest(): Promise<Quest> {
    return Promise.reject(new Error('Quests are not available on web yet.'))
  },

  // ── Onboarding ────────────────────────────────────────────────────────────────
  async completeOnboarding(input: OnboardingInput): Promise<void> {
    const s = await storage()
    if (input.apiKey) await s.setSetting('venice_api_key', input.apiKey)
    if (input.userName) await s.setSetting('user_name', input.userName)
    await s.setSetting('onboarding_complete', 'true')
  },

  // ── Settings ────────────────────────────────────────────────────────────────
  async getSetting(key: string): Promise<string | null> {
    return (await storage()).getSetting(key)
  },
  async setSetting(key: string, value: string): Promise<void> {
    await (await storage()).setSetting(key, value)
  },
}
