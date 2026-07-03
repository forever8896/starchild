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
  GreatWorkPosition,
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

// ── E2EE trial session ────────────────────────────────────────────────────────
//
// The free trial defaults to end-to-end encryption: message contents are
// encrypted in the browser to Venice's attested TDX enclave, so the trial proxy
// relays only ciphertext. We establish one session (attestation handshake) and
// reuse it until Venice marks the attestation stale. Flip `E2EE_TRIAL` off to
// fall back to the plaintext (cheaper/faster) trial model.
const E2EE_TRIAL = true

let e2eeSessionP: Promise<import('../../web/src/e2ee').E2eeSession> | null = null

/**
 * Get (or establish) the trial E2EE session, refreshing when it goes stale.
 * THROWS on handshake failure — the trial is E2EE-or-nothing. Callers decide
 * what failure means: `sendMessage` surfaces it to the user (fail closed — we
 * never silently downgrade the conversation to plaintext), background
 * extraction simply skips its work.
 */
async function trialE2eeSession(): Promise<import('../../web/src/e2ee').E2eeSession | undefined> {
  if (!E2EE_TRIAL) return undefined
  const v = await venice()
  const fresh = async () => v.establishE2eeSession(v.DEFAULT_ATTEST_URL)
  try {
    if (!e2eeSessionP) e2eeSessionP = fresh()
    let s = await e2eeSessionP
    if (Date.now() >= s.staleAt) {
      e2eeSessionP = fresh()
      s = await e2eeSessionP
    }
    return s
  } catch (err) {
    // Drop the failed promise so the next attempt retries the handshake.
    e2eeSessionP = null
    throw err
  }
}

/**
 * Inference options for CONVERSATION-DERIVED content — the single policy gate.
 * BYOK goes direct to Venice with the user's key. The trial REQUIRES the E2EE
 * session; if the handshake fails the caller gets a thrown error (never a
 * silent plaintext downgrade). Background callers pass `optional: true` to get
 * `null` back instead — meaning "skip this work", still never plaintext.
 */
async function privateInference(optional = false): Promise<
  { mode: 'trial' | 'byok'; apiKey?: string; e2eeSession?: import('../../web/src/e2ee').E2eeSession } | null
> {
  const { mode, apiKey } = await resolveInference()
  if (mode === 'byok') return { mode, apiKey }
  if (!E2EE_TRIAL) return { mode } // explicit operator opt-out of E2EE
  try {
    const e2eeSession = await trialE2eeSession()
    return { mode, e2eeSession }
  } catch (err) {
    if (optional) {
      console.warn('E2EE unavailable — skipping background inference (no plaintext fallback):', err)
      return null
    }
    throw new Error(
      'could not open the encrypted channel — your words were not sent. take a breath and try again.',
    )
  }
}

// ── Enclave keep-alive ────────────────────────────────────────────────────────
//
// The confidential enclave can cold-start (~12s to first token) but then holds
// warmth (~2.5s on GLM-4.7). So from app-load we ping it with a tiny throwaway
// E2EE inference every 15s — by the time the user finishes onboarding and sends
// their first real message, the enclave is warm. Stops on the first real message
// (real traffic keeps it warm) or after a cap, and never runs for BYOK. Each ping
// is a few tokens (aborted at the first) — negligible cost.
let keepAliveTimer: ReturnType<typeof setInterval> | null = null
let keepAliveUntil = 0
let pingInFlight = false

async function pingEnclave(): Promise<void> {
  if (pingInFlight) return
  pingInFlight = true
  const ctrl = new AbortController()
  try {
    const [v, session] = await Promise.all([venice(), trialE2eeSession()])
    if (!session) { stopEnclaveKeepAlive(); return }
    for await (const _tok of v.streamChat(
      [{ role: 'user', content: 'hi' }],
      { mode: 'trial', e2eeSession: session, temperature: 0.1, signal: ctrl.signal },
    )) {
      ctrl.abort() // warm now — stop generating
      break
    }
  } catch {
    // Best-effort (aborted/offline). If it keeps failing the cap will end it.
  } finally {
    ctrl.abort()
    pingInFlight = false
  }
}

function stopEnclaveKeepAlive(): void {
  if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null }
}

/**
 * Warm the E2EE handshake AND the enclave ahead of the first message. Called from
 * app bootstrap (during intro/onboarding). Trial tier only; no-op for BYOK.
 */
export function warmTrialE2ee(): void {
  void (async () => {
    if (!E2EE_TRIAL) return
    const key = (await (await storage()).getSetting('venice_api_key'))?.trim()
    if (key) return // BYOK — no shared enclave to warm
    if (keepAliveTimer) return
    keepAliveUntil = Date.now() + 5 * 60_000 // cap: 5 min of warming
    void pingEnclave()
    keepAliveTimer = setInterval(() => {
      if (Date.now() >= keepAliveUntil) { stopEnclaveKeepAlive(); return }
      void pingEnclave()
    }, 15_000)
  })()
}

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

  // The homunculus MERGE: the live state (per-message feed, decay, quest XP)
  // stays the moment-to-moment truth so talking visibly nourishes the creature;
  // the Great Work derivation supplies FLOORS for the growth stats — the
  // creature never displays less bond/xp/level than the user's macro progress
  // implies. (Previously the derivation *replaced* the live state each read,
  // silently discarding every feed()/quest-reward write — the creature froze.)
  const gw = await s.getGreatWorkPosition<import('./index').GreatWorkPosition>()
  if (gw) {
    const derived = c.deriveStateFromPosition(gw, Date.now())
    const hunger = game.hunger
    const merged: GameState = {
      ...game,
      bond: Math.max(game.bond, derived.bond),
      xp: Math.max(game.xp, derived.xp),
      level: Math.max(game.level, derived.level),
      mood: c.moodForHunger(hunger),
    }
    await s.setGameState(merged)
    return merged
  }

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

  // ── Record evidence in the Great Work position ──
  // A completed quest is evidence for the quest's plane. Hand it to the core's
  // `applyEvidence`, which records it AND advances the plane's alchemical stage
  // once the evidence threshold is cleared — the record→advance rule lives in
  // Rust so native + web stay identical (the web previously pushed evidence in
  // JS and so never advanced).
  try {
    const gw = await s.getGreatWorkPosition<import('./index').GreatWorkPosition>()
    if (gw) {
      const plane = (quest.category as 'body' | 'mind' | 'spirit') ?? 'spirit'
      const planePos = gw.planes.find((p) => p.plane === plane)
      if (planePos) {
        const updated = c.applyEvidence(
          gw,
          { kind: 'QuestCompleted', cell: { plane, stage: planePos.stage }, quest_title: quest.title },
          nowIso(),
        )
        await s.setGreatWorkPosition(updated)
      }
    }
  } catch (err) {
    console.warn('Failed to record Great Work evidence:', err)
  }

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
    // Conversation turns are in this prompt — E2EE required on the trial. If
    // the channel is unavailable we fall to the local heuristic, NEVER plaintext.
    const inference = await privateInference(true)
    if (inference) {
      const { mode, apiKey, e2eeSession } = inference
      let acc = ''
      for await (const token of v.streamChat(
        [
          { role: 'system', content: c.questExtractionSystem() },
          { role: 'user', content: c.buildQuestExtractionPrompt(recentContext) },
        ],
        { mode, apiKey, e2eeSession, temperature: 0.2 },
      )) {
        acc += token
      }
      const parsed = c.parseQuestExtraction(acc)
      if (parsed) return parsed
    }
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
    // This prompt carries the raw turn — the most sensitive derived content in
    // the app. E2EE required on the trial; if unavailable, skip extraction
    // entirely (the knowing profile just grows a turn later). NEVER plaintext.
    const inference = await privateInference(true)
    if (!inference) return
    const { mode, apiKey, e2eeSession } = inference

    let acc = ''
    for await (const token of v.streamChat(
      [
        { role: 'system', content: c.knowingExtractionSystem() },
        { role: 'user', content: c.buildKnowingExtractionInput(userMessage, aiResponse) },
      ],
      { mode, apiKey, e2eeSession, temperature: 0.2 },
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

    // A turn that deepened the knowing profile is Great Work evidence too —
    // `KnowingDeepened` lands on all three planes (it feeds the homunculus's
    // bond, not stage advancement). Previously this kind was never emitted.
    if (extracted.length > 0) {
      try {
        const gw = await s.getGreatWorkPosition<import('./index').GreatWorkPosition>()
        if (gw) {
          const updated = c.applyEvidence(
            gw,
            { kind: 'KnowingDeepened', dimension: extracted[0].category, depth: extracted.length },
            nowIso(),
          )
          await s.setGreatWorkPosition(updated)
        }
      } catch (err) {
        console.warn('Failed to record knowing evidence:', err)
      }
    }
  } catch (err) {
    console.warn('Knowing extraction failed (non-fatal):', err)
  }
}

// ── The platform implementation ───────────────────────────────────────────────

export const webPlatform: Platform = {
  name: 'web',

  // TTS speaks the Starchild's replies (Venice voice via /api/tts or BYOK);
  // mic transcription is still desktop-only (PRD §7).
  supportsTts: true,
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

    // ── Preferential reality + vision crystallization (mirror desktop lib.rs) ──
    // The awakening message asks the "magic wand" question; the user's answer to
    // THAT question is their preferential reality (their north star). Capture it,
    // then let the phase detector fast-path to the Crystallize moment instead of
    // digging forever. Capture is gated — a substantial message (≥20 chars, as
    // desktop) that actually answers the awakening (the previous assistant turn
    // mentions the magic wand) or lands in the first exchanges — so a stray
    // "good morning!" can never become the permanent north star.
    const assistantTurns = chatMessages.filter((m) => m.role === 'assistant')
    const lastAssistant = [...chatMessages].reverse().find((m) => m.role === 'assistant')?.content ?? ''
    if (!inProof && content.trim().length >= 20) {
      const existingPr = (await s.getSetting('preferential_reality')) ?? ''
      const answersAwakening = /magic wand/i.test(lastAssistant) || assistantTurns.length <= 2
      if (!existingPr && answersAwakening) {
        await s.setSetting('preferential_reality', content.trim())
        // ── Initialize the Great Work position ──
        // The journey begins when the user states their preferential reality.
        // Create a fresh position with all planes at Calcination and set the
        // active cell to Body × Calcination (the default starting point).
        const gw = await s.getGreatWorkPosition<import('./index').GreatWorkPosition>()
        if (!gw) {
          const freshPos: import('./index').GreatWorkPosition = {
            preferential_reality: content.trim(),
            planes: [
              { plane: 'body', stage: 'calcination', cells_worked: [], evidence: [], stuck: false },
              { plane: 'mind', stage: 'calcination', cells_worked: [], evidence: [], stuck: false },
              { plane: 'spirit', stage: 'calcination', cells_worked: [], evidence: [], stuck: false },
            ],
            active_cell: { plane: 'body', stage: 'calcination' },
            total_cells_worked: 0,
            last_advanced_at: null,
          }
          await s.setGreatWorkPosition(freshPos)
        }
      }
    }
    const hasPr = ((await s.getSetting('preferential_reality')) ?? '') !== ''
    const visionRevealed = (await s.getSetting('vision_revealed')) === 'true'
    const crystallizePending = hasPr && !visionRevealed

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

    // ── Great Work position (the hermetic macro state) ──
    // Loaded from IndexedDB; passed to the prompt builder ONLY once the vision
    // is placed — during the first-conversation arc (arrive→crystallize→first
    // quest) the hermetic layer stays silent, so its "sit in the fire"
    // Calcination guidance can't contradict the scripted Crystallize moves.
    const gwPos = await s.getGreatWorkPosition<import('./index').GreatWorkPosition>()

    // Active quests — the AI must know the user's live commitments (desktop
    // formats them the same way: "[category] title").
    const activeQuests = await s.getQuests('active')
    const activeQuestTitles = activeQuests.map((q) => `[${q.category ?? 'general'}] ${q.title}`)

    // Phase decision (mirrors desktop lib.rs):
    //   • proof flow wins absolutely,
    //   • else if a vision is ready to place → let the detector fast-path to
    //     Crystallize (the north-star moment),
    //   • else once the vision IS placed but no quest has ever been offered →
    //     offer the first quest instead of drifting back into more questions,
    //   • else the core detector decides — EXCEPT that a quest completed in the
    //     last 5 minutes forces Explore ("let it breathe"; desktop's cooldown),
    //     so the companion never chains straight into the next assignment.
    let phase: import('../../web/src/wasm-bridge').ConversationPhase
    if (inProof) {
      phase = 'proof'
    } else if (crystallizePending) {
      phase = c.detectPhase(chatMessages, true)
    } else {
      const anyQuestOffered = chatMessages.some((m) => m.role === 'assistant' && c.isQuestOffer(m.content))
      phase = visionRevealed && !anyQuestOffered && activeQuests.length === 0
        ? 'quest'
        : c.detectPhase(chatMessages, false)
      if (phase === 'quest') {
        const completed = await s.getQuests('completed')
        const justCompleted = completed.some((q) => {
          const t = q.completed_at ? Date.parse(q.completed_at) : NaN
          return Number.isFinite(t) && Date.now() - t < 5 * 60_000
        })
        if (justCompleted) phase = 'explore'
      }
    }
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
      active_quests: activeQuestTitles,
      // The hermetic layer engages only after the vision is placed (see above).
      great_work: visionRevealed ? (gwPos ?? undefined) : undefined,
    })
    if (knowingFragment) system += `\n\n${knowingFragment}`

    // ── Quest-branch steering (mirrors desktop's SKILL TREE BRANCHES block) ──
    // The Quest phase instruction references "SKILL TREE BRANCHES below"; supply
    // it. The next category comes from the Great Work `active_cell` (the ripe
    // cell of their becoming) when a position exists, else the least-worked
    // branch — either way growth cycles across body/mind/spirit instead of
    // whatever plane the model happens to pick.
    if (phase === 'quest') {
      const allQuests = await s.getQuests()
      const categories = ['body', 'mind', 'spirit'] as const
      const count = (cat: string, status?: string) =>
        allQuests.filter((q) => q.category === cat && (!status || q.status === status)).length
      const leastWorked = [...categories].sort((a, b) => count(a) - count(b))[0]
      const next = gwPos?.active_cell?.plane ?? leastWorked
      const labels: Record<string, string> = {
        body: 'Body (embodying the reality — physical, nature, movement)',
        mind: 'Mind (mentally stepping into the reality — learning, creating, building)',
        spirit: 'Spirit (attuning the whole being — presence, reflection, alchemy, connection)',
      }
      let steer = '\n\nSKILL TREE BRANCHES (quest balance across growth domains):\n'
      for (const cat of categories) {
        steer += `  ${cat[0].toUpperCase()}${cat.slice(1)} (${cat}): ${count(cat, 'completed')}/${count(cat)} quests completed\n`
      }
      steer += `\nNEXT QUEST MUST BE: ${labels[next]} category.\n`
      steer += 'Growth cycles across Body → Mind → Spirit so no part of them is left behind.\n'
      steer += "Each quest should connect to the user's preferential reality."
      const pr = (await s.getSetting('preferential_reality')) ?? ''
      if (pr) steer += `\n\nTHEIR PREFERENTIAL REALITY (their ideal life vision):\n"${pr}"`
      system += steer
    }

    const llmMessages = [{ role: 'system', content: system }, ...chatMessages]

    // A failed send must leave NO trace: un-persist the user turn (so the
    // thread doesn't desync from what actually happened) and dis-arm a proof
    // trigger (so the quest can't complete off a message that never landed).
    // The UI restores the text into the composer; retrying re-persists cleanly.
    const rollbackTurn = async (): Promise<void> => {
      try { await s.deleteMessage(userMsg.id) } catch { /* best-effort */ }
      if (proofTrigger) {
        try { await s.setSetting('pending_proof_quest_id', pendingProofBefore) } catch { /* best-effort */ }
      }
    }

    // The conversation is E2EE on the trial tier, FAIL CLOSED: if the encrypted
    // channel can't be established this throws (surfaced as the chat error
    // banner) rather than silently sending plaintext. BYOK goes direct to Venice.
    let inference: NonNullable<Awaited<ReturnType<typeof privateInference>>>
    try {
      inference = (await privateInference(false))!
    } catch (err) {
      await rollbackTurn()
      throw err
    }
    const { mode, apiKey, e2eeSession } = inference
    // Real traffic now keeps the enclave warm — stop the keep-alive pings.
    stopEnclaveKeepAlive()

    let acc = ''
    try {
      for await (const token of v.streamChat(llmMessages, { mode, apiKey, e2eeSession })) {
        acc += token
        yield token
      }
    } catch (err) {
      // A decrypt failure means the cached E2EE session likely went stale —
      // drop it so the user's retry performs a fresh handshake.
      if (err instanceof Error && /decrypt/i.test(err.message)) e2eeSessionP = null
      await rollbackTurn()
      throw err
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

    // The north-star moment just happened — record it so we crystallize only once
    // (mirrors desktop setting `vision_revealed`). Also stash the vision itself
    // for the tree's crown — WITHOUT the "let's place this on your vision tree ✦"
    // meta-instruction tail the Crystallize phase appends to the chat reply
    // (desktop synthesizes a separate statement; stripping the tail leaves the
    // same woven-from-their-words vision sentence). Next turns fall to Quest.
    if (phase === 'crystallize') {
      await s.setSetting('vision_revealed', 'true')
      let vision = (await s.getSetting('vision_statement')) ?? ''
      if (!vision) {
        vision = final
          .replace(/let'?s place (this|it) on your vision tree.*$/is, '')
          .replace(/[\s✦.,;:—-]+$/u, '')
          .trim() || final
        await s.setSetting('vision_statement', vision)
      }
      // The crystallized vision is Great Work evidence — Spirit-plane work at
      // its current stage (so it counts toward advancing that stage). This is
      // one of the two non-quest evidence kinds that were never emitted.
      try {
        const gwNow = await s.getGreatWorkPosition<import('./index').GreatWorkPosition>()
        const spirit = gwNow?.planes.find((p) => p.plane === 'spirit')
        if (gwNow && spirit) {
          const updated = c.applyEvidence(
            gwNow,
            { kind: 'InsightCrystallized', cell: { plane: 'spirit', stage: spirit.stage }, insight: vision },
            nowIso(),
          )
          await s.setGreatWorkPosition(updated)
        }
      } catch (err) {
        console.warn('Failed to record crystallize evidence:', err)
      }
    }

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
    // The knowing facts + Great Work position ARE the companion's soul — a
    // backup without them silently forgets the user. Include both.
    const knowingFacts = await s.getKnowingFacts()
    const greatWork = await s.getGreatWorkPosition<import('./index').GreatWorkPosition>()
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
        knowing: {
          facts: knowingFacts.map((f) => ({
            id: f.id,
            category: f.category,
            fact: f.fact,
            importance: f.importance,
            confidence: f.confidence,
            created_at: f.created_at,
          })),
          stage: 'exported',
          total_facts: knowingFacts.length,
          gaps: [],
        },
        great_work: greatWork,
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
      // Restore the soul: knowing facts + Great Work position (older exports
      // simply carry an empty list / no field — both handled gracefully).
      knowingFacts: (payload.knowing?.facts ?? []).map((f) => ({
        id: f.id,
        category: f.category,
        fact: f.fact,
        importance: f.importance,
        confidence: f.confidence,
        created_at: f.created_at,
      })),
      greatWork: payload.great_work ?? null,
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

  // ── Voice ──────────────────────────────────────────────────────────────────
  // Speaks the STARCHILD'S words (the UI only ever passes assistant replies —
  // never the user's messages). PRIVACY: there is no E2EE TTS enclave, so this
  // text transits in plaintext to Venice's voice service; the chat-header
  // toggle + Settings copy state this, and turning voice off stops all of it.
  // Trial → our /api/tts relay (key server-side, rate-limited, budget-metered);
  // BYOK → Venice directly with the user's key. Returns base64 mp3.
  async ttsSpeak(text: string): Promise<string> {
    const s = await storage()
    const { isTtsVoice, DEFAULT_TTS_VOICE, TTS_MODEL, TTS_VOICE_SETTING } = await import(
      '../../web/src/voices'
    )
    const saved = ((await s.getSetting(TTS_VOICE_SETTING)) ?? '').trim()
    const voice = isTtsVoice(saved) ? saved : DEFAULT_TTS_VOICE
    const clean = text.trim().slice(0, 1200)
    if (!clean) throw new Error('nothing to speak')

    const { mode, apiKey } = await resolveInference()
    const res =
      mode === 'byok'
        ? await fetch('https://api.venice.ai/api/v1/audio/speech', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: clean, model: TTS_MODEL, voice, response_format: 'mp3' }),
          })
        : await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: clean, voice }),
          })
    if (!res.ok) throw new Error(`voice unavailable (${res.status})`)

    // ArrayBuffer → base64 (chunked so long replies don't blow the arg limit).
    const bytes = new Uint8Array(await res.arrayBuffer())
    let binary = ''
    const CHUNK = 0x8000
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
    }
    return btoa(binary)
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

  // ── Great Work (the hermetic macro state) ──────────────────────────────────
  async getGreatWorkPosition(): Promise<GreatWorkPosition | null> {
    return (await storage()).getGreatWorkPosition<GreatWorkPosition>()
  },
  async setGreatWorkPosition(pos: GreatWorkPosition): Promise<void> {
    await (await storage()).setGreatWorkPosition(pos)
  },
}
