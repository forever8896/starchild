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
type QuestsMod = typeof import('../../web/src/quests')

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

let questsMod: Promise<QuestsMod> | null = null
const quests = (): Promise<QuestsMod> => (questsMod ??= import('../../web/src/quests'))

const core = async () => (await wasm()).loadCore()

// ── In-process event bus ──────────────────────────────────────────────────────
//
// Desktop emits backend events over Tauri (`quest-offered`, `quest-completed`,
// `quest-celebration`, …) and components subscribe via `Platform.subscribe`. The
// web shell has no backend process, so the quest loop runs in this adapter; we
// emit the SAME event names through a tiny synchronous bus so the shared
// components (ChatWindow, ActiveQuest, SkillTree) react identically on web.

type EventHandler = (payload: unknown) => void
const eventBus = new Map<string, Set<EventHandler>>()

function emit(event: string, payload: unknown): void {
  const handlers = eventBus.get(event)
  if (!handlers) return
  // Copy so a handler that unsubscribes mid-dispatch can't mutate the live set.
  for (const h of [...handlers]) {
    try {
      h(payload)
    } catch (err) {
      console.error(`event handler for "${event}" threw:`, err)
    }
  }
}

// ── Small helpers ─────────────────────────────────────────────────────────────

const uuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

const nowIso = (): string => new Date().toISOString()

/**
 * Map the persisted creature row to the UI's lighter `StarchildState`. The mood
 * label is the canonical one the core already wrote onto the state (via
 * `Mood::from_hunger` on every tick/feed/reward) — the web no longer re-derives
 * it with its own thresholds.
 */
function toStarchildState(game: GameState): StarchildState {
  return {
    hunger: Math.round(game.hunger),
    mood: game.mood,
    energy: Math.round(game.energy),
    bond: Math.round(game.bond),
    xp: game.xp,
    level: game.level,
  }
}

/** Ensure a creature state exists and is decay-ticked; persist + return it. */
async function loadTickedState(): Promise<GameState> {
  const [s, c] = await Promise.all([storage(), core()])
  const existing = await s.getGameState()
  const game = existing ? c.tickGameState(existing) : c.newGameState()
  await s.setGameState(game)
  return game
}

/**
 * Nudge the creature after an exchange — it just got attention. The mood label
 * is derived by the shared core (`Mood::from_hunger`) so it never drifts from
 * the desktop thresholds.
 */
function feed(game: GameState, c: Awaited<ReturnType<typeof core>>): GameState {
  const hunger = Math.min(100, game.hunger + 8)
  return {
    ...game,
    hunger,
    bond: Math.min(100, game.bond + 1),
    energy: Math.min(100, game.energy + 2),
    xp: game.xp + 2,
    mood: c.moodForHunger(hunger),
  }
}

/** Pick the inference tier: BYOK when a key is saved locally, else the trial. */
async function resolveInference(): Promise<{ mode: 'trial' | 'byok'; apiKey?: string }> {
  const key = (await (await storage()).getSetting('venice_api_key'))?.trim()
  return key ? { mode: 'byok', apiKey: key } : { mode: 'trial' }
}

/**
 * Complete a quest and broadcast the same events the desktop backend emits:
 * `quest-completed` (creature + XP for the chat HUD and ActiveQuest reload) and
 * `quest-celebration` (the SkillTree burst). Awards XP + feeds the creature
 * exactly as desktop `complete_quest` does. Returns the structured result so the
 * platform `completeQuest` can hand it back to callers.
 */
async function completeQuestAndEmit(id: string): Promise<CompleteQuestResult> {
  const [s, c, q] = await Promise.all([storage(), core(), quests()])
  const quest = await q.completeQuestRow(id)
  const game = (await s.getGameState()) ?? c.newGameState()
  // Reward math is the SAME core code the desktop runs (add_xp + feed(xp/10)).
  const { state: next, levelled_up: levelledUp } = c.questCompleteReward(game, quest.xp_reward)
  await s.setGameState(next)
  const starchild_state = toStarchildState(next)

  emit('quest-completed', {
    quest,
    starchild_state,
    xp_reward: quest.xp_reward,
  })
  emit('quest-celebration', {
    quest_id: quest.id,
    category: quest.category,
    xp_reward: quest.xp_reward,
  })

  return { quest, starchild_state, levelled_up: levelledUp }
}

/**
 * Extract the quest the Starchild just offered from recent history. Mirrors
 * desktop `extract_quest_from_conversation`: find the most recent assistant
 * offer, ask the model for structured JSON, normalize it. Falls back to a
 * heuristic when no model is reachable (trial exhausted / offline) so ACCEPT
 * never dead-ends.
 */
async function extractOfferedQuest(): Promise<import('../../web/src/wasm-bridge').ExtractedQuest> {
  const [s, c, v] = await Promise.all([storage(), core(), venice()])

  const history = await s.getMessages(14)
  const turns = history.filter((m) => m.role === 'user' || m.role === 'assistant')
  const offer = [...turns].reverse().find((m) => m.role === 'assistant' && c.isQuestOffer(m.content))
  if (!offer) throw new Error('No quest offer found in conversation')

  const recentContext = turns
    .slice(-6)
    .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
    .join('\n')

  try {
    const { mode, apiKey } = await resolveInference()
    let acc = ''
    for await (const token of v.streamChat(
      [
        { role: 'system', content: c.questExtractionSystem() },
        { role: 'user', content: c.buildQuestExtractionPrompt(recentContext) },
      ],
      { mode, apiKey, temperature: 0.2 },
    )) {
      acc += token
    }
    const parsed = c.parseQuestExtraction(acc)
    if (parsed) return parsed
  } catch (err) {
    console.warn('Quest extraction via model failed; using heuristic fallback:', err)
  }

  return c.questFallbackExtract(offer.content)
}

/**
 * Extract the 7-dimension "knowing" insights from one conversation turn and
 * persist them to IndexedDB — the web mirror of desktop's `extract_memories`.
 * Uses the SAME core extraction prompt + JSON normalization, so both shells
 * decide what counts as an insight identically. Runs in the background
 * (fire-and-forget) after the reply streams, and swallows errors so a failed
 * extraction never disrupts the conversation.
 */
async function extractKnowing(userMessage: string, aiResponse: string): Promise<void> {
  try {
    const [s, c, v] = await Promise.all([storage(), core(), venice()])
    const { mode, apiKey } = await resolveInference()

    let acc = ''
    for await (const token of v.streamChat(
      [
        { role: 'system', content: c.knowingExtractionSystem() },
        { role: 'user', content: c.buildKnowingExtractionInput(userMessage, aiResponse) },
      ],
      { mode, apiKey, temperature: 0.2 },
    )) {
      acc += token
    }

    const extracted = c.parseKnowingFacts(acc)
    for (const f of extracted) {
      await s.addKnowingFact({
        id: uuid(),
        category: f.category,
        fact: f.fact,
        importance: f.importance,
        confidence: f.confidence,
        created_at: nowIso(),
      })
    }
  } catch (err) {
    console.warn('Knowing extraction failed (non-fatal):', err)
  }
}

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

    // ── Proof-of-completion handshake (mirror desktop lib.rs) ──
    // ChatWindow sends `[proof:QUEST_ID] i did the quest …` when the user taps
    // "i did it". Turn 1 (the trigger) arms `pending_proof` and the Starchild
    // asks for the story; turn 2 (a plain reply) completes the quest. We read
    // the pending id BEFORE arming so turn 1 can never self-complete.
    const proofTrigger = text.startsWith('[proof:')
    const pendingProofBefore = ((await s.getSetting('pending_proof_quest_id')) ?? '').trim()
    let content = text
    if (proofTrigger) {
      const questId = text.slice('[proof:'.length).split(']')[0]
      await s.setSetting('pending_proof_quest_id', questId)
      // Strip the trigger token so it never leaks into stored history / the LLM.
      const close = text.indexOf(']')
      content = (close >= 0 ? text.slice(close + 1) : text).trim() || text
    }
    const inProof = proofTrigger || pendingProofBefore !== ''

    // Persist the user's turn, then assemble the conversation context.
    const userMsg: Message = {
      id: uuid(),
      role: 'user',
      content,
      created_at: nowIso(),
    }
    await s.addMessage(userMsg)

    const history = await s.getMessages(20)
    const chatMessages = history.map((m) => ({ role: m.role, content: m.content }))

    // ── Memory recall + knowing profile (shared core, mirrors desktop) ──
    // Desktop recalls via SQLite FTS5 and loads the knowing profile from SQLite;
    // the web holds its facts in IndexedDB and ranks them with the pure core
    // ranker. Both then feed the SAME PromptBuilder "memories" slot and append
    // the SAME knowing fragment, so the assembled prompt is identical in shape.
    const facts = await s.getKnowingFacts()
    const memories = facts.length
      ? c.rankMemories(
          content,
          facts.map((f) => ({ content: f.fact, created_at_ms: Date.parse(f.created_at) || 0 })),
          5,
        )
      : []
    // The knowing fragment is always present (even with zero facts it lists the
    // unexplored dimensions + "still new" guidance), exactly as desktop appends it.
    const knowingFragment = c.buildKnowingFragment(facts)

    // Proof flow takes absolute phase priority (as on desktop); otherwise the
    // core phase detector decides.
    const phase = inProof ? 'proof' : c.detectPhase(chatMessages)
    let system = c.buildPrompt({
      // core's build_prompt state is u32; the live game state carries fractional
      // (decayed) stats — round before crossing the WASM boundary or serde rejects.
      state: {
        hunger: Math.round(game.hunger),
        mood: game.mood,
        energy: Math.round(game.energy),
        bond: Math.round(game.bond),
        level: Math.round(game.level),
      },
      memories,
      recent_messages: chatMessages,
      phase,
    })
    if (knowingFragment) system += `\n\n${knowingFragment}`

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
    await s.setGameState(feed(game, c))

    // ── Background: extract knowing insights from this turn ──
    // Fire-and-forget (mirrors desktop's background `extract_memories`): the
    // facts land in IndexedDB and enrich the NEXT turn's recall + knowing slot.
    void extractKnowing(content, final)

    // ── Quest completion (proof turn 2) ──
    // phase == proof, this turn was NOT the trigger, and a quest was armed.
    if (phase === 'proof' && !proofTrigger && pendingProofBefore) {
      await s.setSetting('pending_proof_quest_id', '')
      try {
        await completeQuestAndEmit(pendingProofBefore)
      } catch (err) {
        console.error('Failed to complete quest from proof:', err)
      }
    }

    // ── Quest offer detection ──
    // An assistant reply that proposes a quest surfaces the accept/decline UI
    // (web App listens for `quest-offered`).
    if (c.isQuestOffer(final)) {
      emit('quest-offered', {})
    }
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
    const [s, c] = await Promise.all([storage(), core()])
    // Make sure a creature exists from the very first beat.
    await loadTickedState()
    const name = (await s.getSetting('user_name'))?.trim() || 'traveler'
    const msg: Message = {
      id: uuid(),
      role: 'assistant',
      // Fixed awakening copy — single-sourced in the core (shared with desktop).
      content: c.awakeningMessage(name),
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

  // ── Events (in-process bus — mirrors desktop's Tauri events) ──────────────────
  subscribe(event: string, handler: (payload: unknown) => void): () => void {
    let set = eventBus.get(event)
    if (!set) {
      set = new Set()
      eventBus.set(event, set)
    }
    set.add(handler)
    return () => {
      set?.delete(handler)
    }
  },

  // ── Quests (PRD §7 — the full offer → accept → complete loop on web) ──────────
  async getQuests(status?: string): Promise<Quest[]> {
    return (await storage()).getQuests(status)
  },

  /** Extract + persist the offered quest, then announce it (`quest-accepted`). */
  async acceptQuest(): Promise<Quest> {
    const q = await quests()
    const extracted = await extractOfferedQuest()
    const quest = await q.saveAcceptedQuest(extracted)
    emit('quest-accepted', { quest })
    return quest
  },

  /** Mark a quest complete, award XP, and fire the celebration events. */
  completeQuest(id: string): Promise<CompleteQuestResult> {
    return completeQuestAndEmit(id)
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
