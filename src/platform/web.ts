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

type E2eeSession = import('../../web/src/e2ee').E2eeSession

/** One cached session per tier: the trial attests through our relay (it holds
 *  the key), BYOK attests straight against Venice (keyless, CORS-open). */
const e2eeSessions: Record<'trial' | 'byok', Promise<E2eeSession> | null> = { trial: null, byok: null }

/** Forget cached sessions (e.g. a reply failed to decrypt — the key rotated). */
function resetE2eeSessions(): void {
  e2eeSessions.trial = null
  e2eeSessions.byok = null
}

/**
 * Get (or establish) the E2EE session for a tier, refreshing when it goes stale.
 * THROWS on handshake failure — both tiers are E2EE-or-nothing. Callers decide
 * what failure means: `sendMessage` surfaces it to the user (fail closed — we
 * never silently downgrade the conversation to plaintext), background
 * extraction simply skips its work.
 */
async function e2eeSessionFor(mode: 'trial' | 'byok'): Promise<E2eeSession> {
  const v = await venice()
  const fresh = async () => v.establishE2eeSession(mode === 'trial' ? v.DEFAULT_ATTEST_URL : v.VENICE_ATTEST_URL)
  try {
    if (!e2eeSessions[mode]) e2eeSessions[mode] = fresh()
    let s = await e2eeSessions[mode]!
    if (Date.now() >= s.staleAt) {
      e2eeSessions[mode] = fresh()
      s = await e2eeSessions[mode]!
    }
    return s
  } catch (err) {
    // Drop the failed promise so the next attempt retries the handshake.
    e2eeSessions[mode] = null
    throw err
  }
}

/** The trial session, or undefined when an operator has opted out of E2EE. */
async function trialE2eeSession(): Promise<E2eeSession | undefined> {
  return E2EE_TRIAL ? e2eeSessionFor('trial') : undefined
}

/**
 * Inference options for CONVERSATION-DERIVED content — the single policy gate.
 * Both tiers REQUIRE an E2EE session: the trial through our relay, BYOK direct
 * to Venice with the user's key. If the handshake fails the caller gets a thrown
 * error (never a silent plaintext downgrade). Background callers pass
 * `optional: true` to get `null` back instead — meaning "skip this work", still
 * never plaintext.
 */
async function privateInference(optional = false): Promise<
  { mode: 'trial' | 'byok'; apiKey?: string; e2eeSession?: import('../../web/src/e2ee').E2eeSession } | null
> {
  const { mode, apiKey } = await resolveInference()
  if (mode === 'trial' && !E2EE_TRIAL) return { mode } // explicit operator opt-out of E2EE
  try {
    const e2eeSession = await e2eeSessionFor(mode)
    return { mode, apiKey, e2eeSession }
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
// warmth (~2.6s on Qwen3.8-27B). So from app-load we ping it with a tiny throwaway
// E2EE inference every 30s — by the time the user finishes onboarding and sends
// their first real message, the enclave is warm. Stops on the first real message
// (real traffic keeps it warm) or after a cap, and never runs for BYOK. Each ping
// is a single token, metered by the proxy in its own rate bucket (`warm`), so
// warming never counts against the user's message allowance.
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
      { mode: 'trial', e2eeSession: session, temperature: 0.1, warm: true, signal: ctrl.signal },
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
    }, 30_000)
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

/** When the AI disclosure was last shown in this session (page load); 0 = not
 *  yet, so every fresh session discloses. Core owns the cadence. */
let aiDisclosureShownAt = 0

/** The person's region (ISO alpha-2) from the browser locale, e.g. "en-GB" → "GB";
 *  "" when unknown. Only used locally to order crisis help lines. */
function userRegion(): string {
  try {
    const loc = new Intl.Locale(navigator.language || '')
    return (loc.maximize().region ?? '').toUpperCase()
  } catch {
    return ''
  }
}

const uuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

const nowIso = (): string => new Date().toISOString()

/** Short stable key for the voice cache (djb2 over the utterance text). */
function ttsHash(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

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
        { mode, apiKey, e2eeSession, temperature: 0.2, internal: true, noThinking: true },
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
 * Run latency-insensitive background work OFF the reply's voice-critical window.
 * For the few seconds after a reply lands, the TTS fetch + audio decode + the
 * ethereal-reverb WebAudio graph want the main thread and a network slot; a
 * concurrent E2EE extraction call (which decrypts a streamed response on the
 * SAME main thread) can stall the voice for many seconds. These background
 * calls have no in-turn dependency, so we defer them until the browser is idle
 * (or a short timeout) — the voice always wins the race.
 */
function deferBackground(fn: () => void): void {
  const run = () => {
    try {
      fn()
    } catch (err) {
      console.error('deferred background task threw:', err)
    }
  }
  const g = globalThis as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void
  }
  if (typeof g.requestIdleCallback === 'function') g.requestIdleCallback(run, { timeout: 5000 })
  else setTimeout(run, 2500)
}

/**
 * Refresh the rolling conversation summary when core says it's due — the web
 * mirror of desktop's `update_conversation_summary`. Only the last messages go
 * to the model verbatim; this keeps the arc of everything older. Background,
 * E2EE-or-skip (never plaintext), errors swallowed.
 */
async function updateSummary(): Promise<void> {
  try {
    const [s, c, v] = await Promise.all([storage(), core(), venice()])
    const all = await s.getMessages(0) // chronological
    const last = Number((await s.getSetting('summary_msg_count')) ?? '0') || 0
    if (!c.summaryDue(all.length, last)) return
    const olderCount = c.summaryOlderCount(all.length)
    if (olderCount === 0) return
    const inference = await privateInference(true)
    if (!inference) return
    const { mode, apiKey, e2eeSession } = inference
    const existing = (await s.getSetting('conversation_summary')) ?? ''
    const older = all.slice(0, olderCount).map((m) => ({ role: m.role, content: m.content }))
    let acc = ''
    for await (const token of v.streamChat(
      [
        { role: 'system', content: c.summarySystem() },
        { role: 'user', content: c.buildSummaryPrompt(existing, older) },
      ],
      { mode, apiKey, e2eeSession, temperature: 0.2, internal: true, noThinking: true },
    )) {
      acc += token
    }
    if (acc.trim()) {
      await s.setSetting('conversation_summary', acc.trim())
      await s.setSetting('summary_msg_count', String(all.length))
    }
  } catch (err) {
    console.warn('Conversation summary update failed:', err)
  }
}

/** Upper bound on the listening pass before the reply goes ahead without it. */
const LISTEN_TIMEOUT_MS = 8_000

type OpenThread = import('../../web/src/wasm-bridge').OpenThread

/** The open threads of their life (core `threads`), stored as one setting. */
async function loadThreads(): Promise<OpenThread[]> {
  try {
    const raw = await (await storage()).getSetting('open_threads')
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as OpenThread[]) : []
  } catch {
    return []
  }
}

/**
 * Fold this turn into the open threads — new events/intentions/situations,
 * ones that came up again, ones now settled (core prompt + merge). Background,
 * E2EE-or-skip (never plaintext), errors swallowed.
 */
async function updateThreads(userMessage: string, aiResponse: string): Promise<void> {
  try {
    const [s, c, v] = await Promise.all([storage(), core(), venice()])
    const inference = await privateInference(true)
    if (!inference) return
    const { mode, apiKey, e2eeSession } = inference
    const threads = await loadThreads()
    const now = Date.now()
    let acc = ''
    for await (const token of v.streamChat(
      [
        { role: 'system', content: c.threadsExtractionSystem() },
        { role: 'user', content: c.buildThreadsExtractionInput(threads, userMessage, aiResponse, now) },
      ],
      { mode, apiKey, e2eeSession, temperature: 0.2, internal: true, noThinking: true },
    )) {
      acc += token
    }
    await s.setSetting('open_threads', JSON.stringify(c.applyThreadUpdate(threads, acc, now)))
  } catch (err) {
    console.warn('Thread update failed (non-fatal):', err)
  }
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
      { mode, apiKey, e2eeSession, temperature: 0.2, internal: true, noThinking: true },
    )) {
      acc += token
    }

    const extracted = c.parseKnowingFacts(acc)
    // Dedup on write (core): the extractor re-finds the same insight most turns.
    const existing = await s.getKnowingFacts()
    const added: typeof extracted = []
    for (const f of extracted) {
      if (c.isDuplicateFact(f.category, f.fact, existing)) continue
      const fact = {
        id: uuid(),
        category: f.category,
        fact: f.fact,
        importance: f.importance,
        confidence: f.confidence,
        created_at: nowIso(),
      }
      await s.addKnowingFact(fact)
      existing.push(fact)
      added.push(f)
    }

    // A turn that deepened the knowing profile is Great Work evidence too —
    // `KnowingDeepened` lands on all three planes (it feeds the homunculus's
    // bond, not stage advancement). Previously this kind was never emitted.
    if (added.length > 0) {
      try {
        const gw = await s.getGreatWorkPosition<import('./index').GreatWorkPosition>()
        if (gw) {
          const updated = c.applyEvidence(
            gw,
            { kind: 'KnowingDeepened', dimension: added[0].category, depth: added.length },
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

/**
 * Distill the (often long) crystallized vision into a short north-star phrase for
 * the tree's crown — the full statement overflows the star and gets clipped. Runs
 * once at Crystallize; the crown prefers `vision_short` when present. Fire-and-
 * forget: on any failure the crown simply falls back to the full statement.
 *
 * Carries the vision text, so — like every derived-content call — E2EE is required
 * on the trial; if the private channel is unavailable we skip (NEVER plaintext).
 */
async function distillVisionShort(fullVision: string): Promise<void> {
  try {
    const [s, v] = await Promise.all([storage(), venice()])
    const inference = await privateInference(true)
    if (!inference) return
    const { mode, apiKey, e2eeSession } = inference

    let acc = ''
    for await (const token of v.streamChat(
      [
        {
          role: 'system',
          content:
            'You distill a personal vision into its essence. Reply with ONLY a short north-star phrase — at most 6 words, no quotes, no punctuation at the end, lowercase, capturing the heart of it.',
        },
        { role: 'user', content: `Vision: ${fullVision}\n\nThe essence, in ≤6 words:` },
      ],
      { mode, apiKey, e2eeSession, temperature: 0.3, internal: true, noThinking: true },
    )) {
      acc += token
    }

    const short = acc.trim().replace(/^["']|["']$/g, '').replace(/[.]+$/, '').trim()
    // Guard against a model that ignored the limit — only keep a genuinely short line.
    if (short && short.split(/\s+/).length <= 8 && short.length <= 60) {
      await s.setSetting('vision_short', short)
    }
  } catch (err) {
    console.warn('Vision distillation failed (non-fatal):', err)
  }
}

// ── The platform implementation ───────────────────────────────────────────────

export const webPlatform: Platform = {
  name: 'web',

  // Full voice loop: TTS speaks the Starchild's replies (/api/tts or BYOK) and
  // the mic transcribes the user's speech (/api/stt or BYOK) — desktop parity.
  supportsTts: true,
  supportsVoice: true,

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
    // asks for the story; turn 2 completes the quest ONLY if core judges it a
    // story — "not yet" disarms it, and a too-short reply gets one more ask. We
    // read the pending id BEFORE arming so turn 1 can never self-complete.
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
    let proofVerdict: 'complete' | 'not_yet' | 'unclear' | null = null
    if (!proofTrigger && pendingProofBefore) {
      proofVerdict = c.judgeProof(content)
      const unclearSoFar = Number((await s.getSetting('pending_proof_unclear')) ?? '0') || 0
      if (proofVerdict === 'unclear' && unclearSoFar + 1 >= c.proofMaxUnclear()) {
        proofVerdict = 'not_yet' // asked enough — disarm quietly; "i did it" re-arms
      }
      if (proofVerdict === 'unclear') {
        await s.setSetting('pending_proof_unclear', String(unclearSoFar + 1))
      } else {
        await s.setSetting('pending_proof_unclear', '0')
        if (proofVerdict === 'not_yet') await s.setSetting('pending_proof_quest_id', '')
      }
    } else if (proofTrigger) {
      await s.setSetting('pending_proof_unclear', '0')
    }
    const inProof = proofTrigger || (pendingProofBefore !== '' && proofVerdict !== 'not_yet')

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

    // ── Safety guardrail ──
    // If the human signals self-harm (in this message or the last few — the
    // crisis state is sticky in core), this turn NEVER becomes a vision, a
    // crystallization, or a quest. We meet them (phase = crisis), never capture
    // their words as the permanent north star, and the shell puts real human
    // help lines on screen — before inference, so they show even if it fails.
    const isCrisis =
      c.detectCrisis(content) ||
      c.crisisActive(chatMessages.filter((m) => m.role === 'user').map((m) => m.content))
    emit('crisis-state', { active: isCrisis, resources: isCrisis ? c.crisisResources(userRegion()) : [] })

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
    if (!inProof && !isCrisis && content.trim().length >= 20) {
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
    if (isCrisis) {
      // Crisis wins over proof, crystallize, and quest overrides alike.
      phase = 'crisis'
    } else if (inProof) {
      phase = 'proof'
    } else if (proofVerdict === 'not_yet') {
      // They haven't done it — talk about the quest (adjust, shrink, re-cue).
      phase = 'negotiate'
    } else if (crystallizePending) {
      phase = c.detectPhase(chatMessages, true)
    } else {
      // The first-quest push is for someone who has never had a quest — not
      // for a returning user whose last offer just scrolled out of the window
      // (that forced a quest onto a one-word "meh").
      const anyQuestOffered = chatMessages.some((m) => m.role === 'assistant' && c.isQuestOffer(m.content))
      const everHadQuest = (await s.getQuests()).length > 0
      phase = visionRevealed && !anyQuestOffered && !everHadQuest
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
    const summaryFragment = c.summaryFragment((await s.getSetting('conversation_summary')) ?? '')
    if (summaryFragment) system += `\n\n${summaryFragment}`
    if (proofVerdict && proofVerdict !== 'complete') system += `\n\n${c.proofNote(proofVerdict)}`

    // ── Open threads + reply habits (shared core) ──
    // What's still unfolding in their life (with the ones that have likely
    // moved flagged on a return), and a note when the recent replies have
    // fallen into a shape the person can feel.
    const threads = await loadThreads()
    const prevUser = [...history].reverse().find((m) => m.role === 'user' && m.id !== userMsg.id)
    const gapMs = prevUser ? Date.now() - (Date.parse(prevUser.created_at) || Date.now()) : 0
    const threadsFrag = c.threadsFragment(threads, Date.now(), gapMs)
    if (threadsFrag) system += `\n\n${threadsFrag}`
    const shape = c.shapeFragment(chatMessages.filter((m) => m.role === 'assistant').map((m) => m.content))
    if (shape) system += `\n\n${shape}`

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

    // A failed send must leave NO trace: un-persist the user turn (so the
    // thread doesn't desync from what actually happened) and dis-arm a proof
    // trigger (so the quest can't complete off a message that never landed).
    // The UI restores the text into the composer; retrying re-persists cleanly.
    const rollbackTurn = async (): Promise<void> => {
      try { await s.deleteMessage(userMsg.id) } catch { /* best-effort */ }
      if (proofTrigger || proofVerdict === 'not_yet') {
        // Undo arming (trigger) or disarming (not yet) — the turn never landed.
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

    // ── The listening pass (shared core) ──
    // Before replying, a short private read of the person: what they said,
    // what it seems to mean to them, what they need, which move fits, which
    // trap to avoid. Appended last, so the reply is written from understanding
    // rather than from the phase template. Same E2EE channel; bounded, and
    // any failure just means replying without the read.
    if (c.listenWanted(phase)) {
      try {
        const context = [knowingFragment, summaryFragment, threadsFrag].filter(Boolean).join('\n\n')
        let raw = ''
        for await (const tok of v.streamChat(
          [
            { role: 'system', content: c.listenPrompt({ recent_messages: chatMessages, phase, context }) },
            { role: 'user', content: c.listenTrigger() },
          ],
          { mode, apiKey, e2eeSession, temperature: 0.3, internal: true, noThinking: true, signal: AbortSignal.timeout(LISTEN_TIMEOUT_MS) },
        )) raw += tok
        const listening = c.parseListening(raw)
        if (listening) system += `\n\n${c.listeningFragment(listening, phase)}`
      } catch (err) {
        console.warn('Listening pass skipped:', err)
      }
    }
    const llmMessages = [{ role: 'system', content: system }, ...chatMessages]

    // Crystallize: the vision line is its own single-purpose call (core
    // prompt), started now so it runs alongside the reply — the reply itself
    // just answers what they said. Never blocks or fails the turn.
    const visionP: Promise<string> = phase === 'crystallize'
      ? (async () => {
          try {
            const pr = (await s.getSetting('preferential_reality')) ?? content
            const convo = chatMessages.slice(-10).map((m) => `${m.role}: ${m.content}`).join('\n')
            let raw = ''
            for await (const tok of v.streamChat(
              [
                { role: 'system', content: c.visionSynthesisPrompt(pr, convo) },
                { role: 'user', content: c.visionSynthesisTrigger() },
              ],
              { mode, apiKey, e2eeSession, temperature: 0.5, noThinking: true },
            )) raw += tok
            return c.cleanVision(raw)
          } catch {
            return ''
          }
        })()
      : Promise.resolve('')

    let acc = ''
    try {
      const temperature = c.conversationTemperature(phase)
      // The model occasionally finishes with no content at all. Nothing has
      // been shown yet in that case, so one silent retry; an empty reply is
      // never stored as a turn.
      for (let attempt = 0; attempt < 2 && !acc.trim(); attempt++) {
        for await (const token of v.streamChat(llmMessages, { mode, apiKey, e2eeSession, temperature, noThinking: !c.replyReasoning() })) {
          // Some models open with blank lines; never show them as an empty bubble
          // top (the final text is post-processed, but the stream is shown live).
          const t = acc ? token : token.trimStart()
          if (!t) continue
          acc += t
          yield t
        }
      }
      if (!acc.trim()) throw new Error('The reply came back empty — please try again.')
    } catch (err) {
      // A decrypt failure means the cached E2EE session likely went stale —
      // drop it so the user's retry performs a fresh handshake.
      if (err instanceof Error && /decrypt/i.test(err.message)) resetE2eeSessions()
      await rollbackTurn()
      throw err
    }

    // Post-process + persist the assistant turn and the fed creature.
    let final = c.postprocess(acc, phase)
    let synthesizedVision = ''
    if (phase === 'crystallize') {
      synthesizedVision = await visionP
      if (synthesizedVision) {
        // Show (and speak) the vision right after their acknowledgement.
        const suffix = c.crystallizeSuffix(synthesizedVision)
        yield suffix
        final = c.stripPlacement(final) + suffix
      }
    }
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
      if (!vision && synthesizedVision) {
        vision = synthesizedVision
        await s.setSetting('vision_statement', vision)
      }
      if (!vision) {
        // Core takes the vision sentence only — the reply opens by answering
        // what they just said, which is conversation, not their north star.
        vision = c.visionFromCrystallize(final) || final
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
      // Distill a short north star for the crown (the full statement overflows
      // the star). Fire-and-forget — starts now so it's ready by the time the
      // reply finishes revealing and the tree opens.
      void distillVisionShort(vision)

      // The north star was just woven onto the tree — let the UI witness it.
      // Unlike quests (accept button) the crystallize placement is automatic, so
      // without this signal the vision lands silently and the user never sees the
      // tree animate. The web App carries them to the tree once the reply settles.
      emit('vision-crystallized', { vision })
    }

    // ── Background: extract knowing insights from this turn ──
    // Fire-and-forget (mirrors desktop's background `extract_memories`): the
    // facts land in IndexedDB and enrich the NEXT turn's recall + knowing slot.
    // Skip on a crisis turn — we don't mine a self-harm disclosure into a profile.
    // Deferred so this E2EE extraction never contends with the reply's VOICE
    // (TTS + audio decode want the main thread for the first seconds after send).
    if (!isCrisis) deferBackground(() => void extractKnowing(content, final))
    if (!isCrisis) deferBackground(() => void updateThreads(content, final))
    deferBackground(() => void updateSummary())

    // ── Quest completion (proof turn 2) ──
    // phase == proof, this turn was NOT the trigger, and a quest was armed.
    if (phase === 'proof' && !proofTrigger && pendingProofBefore && proofVerdict === 'complete') {
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
    // Never on a crisis turn — even if the model slipped into quest wording.
    if (!isCrisis && c.isQuestOffer(final)) {
      emit('quest-offered', {})
    }

    // Re-arm enclave warming for the NEXT turn. Keep-alive stopped when this
    // request started (real traffic warmed it), but a companion invites long
    // pauses — the user reflects, reads, steps away — and the enclave re-cools
    // in ~a minute, so the next reply would pay the ~12s cold first-token again.
    // Re-warming here holds it warm across an ACTIVE session (self-caps 5 min
    // after the last message), so replies stay ~6s, not ~12s, throughout.
    warmTrialE2ee()
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

  // Erase everything and return to first-run. Wipes IndexedDB (conversation,
  // creature, quests, knowing, Great Work, settings incl. the BYOK key) AND the
  // localStorage flags (intro-seen, music-mute, avatar intro) so the next load
  // is a genuine clean slate. No undo — the caller confirms.
  async clearAllData(): Promise<void> {
    await (await storage()).clearAllData()
    try {
      localStorage.removeItem('starchild_music_muted')
      localStorage.removeItem('starchild_intro_played')
    } catch { /* private mode — fine */ }
    try {
      sessionStorage.removeItem('starchild_intro_seen')
    } catch { /* private mode — fine */ }
  },

  // ── Conversation ────────────────────────────────────────────────────────────
  async getKnowingFacts() {
    return (await storage()).getKnowingFacts()
  },
  async updateKnowingFact(id: string, fact: string) {
    const s = await storage()
    const text = fact.trim()
    if (text) await s.updateKnowingFact(id, text)
    else await s.deleteKnowingFact(id)
  },
  async deleteKnowingFact(id: string) {
    await (await storage()).deleteKnowingFact(id)
  },

  async aiDisclosure(): Promise<string | null> {
    const c = await core()
    const now = Date.now()
    if (!c.aiDisclosureDue(aiDisclosureShownAt, now)) return null
    aiDisclosureShownAt = now
    return c.aiDisclosureText()
  },

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

    // Voice cache: a rendered utterance is identical for the same (voice, text),
    // so we only ever pay the ~5s TTS once — replays + reloads are instant.
    const cacheKey = `${voice}:${ttsHash(clean)}`
    const cached = await s.getTtsAudio(cacheKey).catch(() => null)
    if (cached) return cached

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
    const b64 = btoa(binary)
    void s.putTtsAudio(cacheKey, b64).catch(() => {}) // cache for instant replay
    return b64
  },
  // Mic → text (Venice Whisper). PRIVACY: this is the user's own voice and
  // there is no E2EE transcription enclave — audio transits in plaintext. It
  // only ever runs from the explicit mic button (plus the browser's own mic
  // permission); the Settings voice card states this plainly.
  // Trial → /api/stt relay (raw WAV bytes; key server-side, rate-limited,
  // budget-metered); BYOK → Venice directly with the user's key.
  async transcribe(audioBase64: string): Promise<string> {
    const b = atob(audioBase64)
    const bytes = new Uint8Array(b.length)
    for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i)
    if (bytes.length < 128) throw new Error('nothing to transcribe')

    const { mode, apiKey } = await resolveInference()
    let res: Response
    if (mode === 'byok') {
      const form = new FormData()
      form.append('file', new Blob([bytes], { type: 'application/octet-stream' }), 'speech.wav')
      form.append('model', 'openai/whisper-large-v3')
      res = await fetch('https://api.venice.ai/api/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      })
    } else {
      res = await fetch('/api/stt', {
        method: 'POST',
        headers: { 'Content-Type': 'audio/wav' },
        body: bytes,
      })
    }
    if (!res.ok) throw new Error(`transcription unavailable (${res.status})`)
    const out = (await res.json()) as { text?: unknown }
    return typeof out?.text === 'string' ? out.text.trim() : ''
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
