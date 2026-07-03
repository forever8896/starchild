// WASM bridge — loads the wasm-pack output of the shared `starchild_core`
// engine and exposes a typed, async `loadCore()` returning ONLY the pure
// functions (PRD §4.5–4.6). All networking and the async Storage/Inference
// traits stay in JS / a later phase; this surface is pure logic.
//
// The wasm-pack `--target web` glue lives in `./wasm/` and is a build artifact
// (regenerate with `npm run build:wasm`). In the browser, Vite (vite-plugin-wasm)
// resolves the `.wasm` URL automatically when `init()` is called with no args.
// For Node/test environments, pass an explicit `initInput` (e.g. the wasm bytes).

import init, {
  detect_phase,
  route_model,
  build_prompt,
  tick_game_state,
  new_game_state,
  postprocess,
  core_version,
  is_quest_offer,
  quest_extraction_system,
  build_quest_extraction_prompt,
  parse_quest_extraction,
  normalize_quest,
  quest_fallback_extract,
  quest_complete_reward,
  mood_for_hunger,
  awakening_message,
  rank_memories,
  knowing_extraction_system,
  build_knowing_extraction_input,
  parse_knowing_facts,
  build_knowing_fragment,
  derive_state_from_position,
  apply_evidence,
} from './wasm/starchild_core.js'

// ── Boundary types (mirror the core Rust structs) ─────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | string
  content: string
}

/** The phase tags emitted by the core `ConversationPhase` enum. */
export type ConversationPhase =
  | 'arrive'
  | 'dig'
  | 'crystallize'
  | 'quest'
  | 'explore'
  | 'reframe'
  | 'negotiate'
  | 'proof'
  | 'release'

/** Lightweight creature snapshot used by the prompt builder (ai::StarchildState). */
export interface PromptState {
  hunger: number
  mood: string
  energy: number
  bond: number
  level: number
}

export interface PersonalityParams {
  warmth: number
  intensity: number
  humor: number
  mysticism: number
  directness: number
}

export interface PromptInput {
  state?: Partial<PromptState>
  personality?: Partial<PersonalityParams>
  memories?: string[]
  active_quests?: string[]
  recent_messages?: ChatMessage[]
  phase?: ConversationPhase
  /** The user's Great Work macro position (hermetic ontology); mirrors the
   *  optional `great_work` field on the Rust `PromptInput`. */
  great_work?: import('../../src/store').GreatWorkPosition
}

export interface RouteResult {
  tier: 'quick' | 'regular' | 'deep' | 'vision'
  model_id: string
}

/** Full creature state with decay clock (game::StarchildState). */
export interface GameState {
  hunger: number
  mood: string
  energy: number
  bond: number
  xp: number
  level: number
  last_decay_at: string
}

/** The JSON shape the extraction model returns (core `quest::ExtractedQuest`). */
export interface ExtractedQuest {
  title: string
  description: string
  category: string
  quest_type: string
  xp_reward: number
}

/** Result of awarding a quest's reward (core `quest_complete_reward`). */
export interface RewardResult {
  state: GameState
  levelled_up: boolean
}

/** One stored memory handed to the recall ranker (core `recall::MemoryItem`). */
export interface MemoryItem {
  content: string
  /** Unix epoch milliseconds; `0`/omitted = unknown (no recency signal). */
  created_at_ms?: number
}

/** A categorized fact about the human (core `knowing::KnownFact`). */
export interface KnownFact {
  id: string
  category: string
  fact: string
  importance: number
  confidence: number
  created_at: string
}

/** A normalized fact from the extraction model (core `knowing::ExtractedFact`). */
export interface ExtractedFact {
  fact: string
  category: string
  importance: number
  confidence: number
}

/** The pure-engine surface exposed across the WASM boundary. */
export interface Core {
  /** Detect the conversation phase from recent `{role, content}` messages. */
  detectPhase(messages: ChatMessage[], crystallizePending?: boolean): ConversationPhase
  /** Route a raw user message to a model tier + Venice model id. */
  routeModel(userMessage: string): RouteResult
  /** Assemble the full system prompt from the given context. */
  buildPrompt(input: PromptInput): string
  /** Apply hunger decay using a JS-supplied timestamp (epoch ms). */
  tickGameState(state: GameState, nowMs?: number): GameState
  /** Construct a fresh creature state at the given timestamp (epoch ms). */
  newGameState(nowMs?: number): GameState
  /** Post-process a model response for the given phase. */
  postprocess(text: string, phase: ConversationPhase): string

  // ── Quest logic (single source — shared with the desktop shell) ──────────
  /** True when an assistant reply contains a quest offer the UI should surface. */
  isQuestOffer(text: string): boolean
  /** The system message for the extraction LLM call. */
  questExtractionSystem(): string
  /** Build the extraction user prompt from recent conversation context. */
  buildQuestExtractionPrompt(recentContext: string): string
  /** Parse + normalize a raw model extraction response (`null` when declined). */
  parseQuestExtraction(raw: string): ExtractedQuest | null
  /** Apply the category/type defaults + XP clamp to an extracted quest. */
  normalizeQuest(extracted: ExtractedQuest): ExtractedQuest
  /** Offline heuristic fallback — turn an offer message into a quest. */
  questFallbackExtract(offerText: string): ExtractedQuest
  /** Award a quest's XP and feed the creature (the same math desktop runs). */
  questCompleteReward(state: GameState, xpReward: number): RewardResult
  /** Canonical mood label for a hunger value (`game::Mood::from_hunger`). */
  moodForHunger(hunger: number): string

  // ── Memory recall (web's pure FTS5 substitute) ───────────────────────────
  /** Rank stored memories by keyword overlap + recency; return top-N contents. */
  rankMemories(query: string, items: MemoryItem[], topN: number): string[]

  // ── The Knowing protocol (7-dimension understanding — shared w/ desktop) ──
  /** The system prompt for the knowing/insight extraction LLM call. */
  knowingExtractionSystem(): string
  /** Build the extraction user message from one (user, assistant) turn. */
  buildKnowingExtractionInput(userMessage: string, aiResponse: string): string
  /** Parse + normalize the extraction model's raw JSON into storable facts. */
  parseKnowingFacts(raw: string): ExtractedFact[]
  /** Render the knowing prompt fragment (stage + gaps) from stored facts. */
  buildKnowingFragment(facts: KnownFact[]): string

  // ── The Great Work (hermetic macro state) ────────────────────────────────
  /** Derive creature state from a Great Work position (homunculus mirror). */
  deriveStateFromPosition(position: unknown, nowMs?: number): GameState
  /**
   * Record one piece of evidence into a Great Work position, advancing any
   * plane it makes ripe, and return the updated position. The ONLY way to
   * mutate the position — the record→advance rule lives in the Rust core.
   */
  applyEvidence(
    position: import('../../src/store').GreatWorkPosition,
    evidence: import('../../src/store').Evidence,
    nowIso?: string,
  ): import('../../src/store').GreatWorkPosition

  // ── Authored copy ────────────────────────────────────────────────────────
  /** The Starchild's fixed awakening (first) message for the given user name. */
  awakeningMessage(name: string): string

  /** The loaded core crate version (sanity check). */
  version(): string
}

let corePromise: Promise<Core> | null = null

/**
 * Initialize the WASM core once and return its pure-function surface.
 *
 * @param initInput Optional wasm module/bytes/URL for non-browser environments
 *                  (Node tests). Omit in the browser — Vite resolves the URL.
 */
export function loadCore(initInput?: BufferSource | WebAssembly.Module | URL): Promise<Core> {
  if (corePromise) return corePromise
  // wasm-bindgen's modern init takes a single `{ module_or_path }` object;
  // wrap any explicit input that way (omitting it lets Vite resolve the URL).
  const arg = initInput === undefined ? undefined : { module_or_path: initInput }
  corePromise = init(arg as never).then(() => ({
    detectPhase: (messages, crystallizePending = false) =>
      detect_phase(messages, crystallizePending) as ConversationPhase,
    routeModel: (userMessage) => route_model(userMessage) as RouteResult,
    buildPrompt: (input) => build_prompt(input),
    tickGameState: (state, nowMs = Date.now()) => tick_game_state(state, nowMs) as GameState,
    newGameState: (nowMs = Date.now()) => new_game_state(nowMs) as GameState,
    postprocess: (text, phase) => postprocess(text, phase),
    isQuestOffer: (text) => is_quest_offer(text),
    questExtractionSystem: () => quest_extraction_system(),
    buildQuestExtractionPrompt: (recentContext) => build_quest_extraction_prompt(recentContext),
    parseQuestExtraction: (raw) => (parse_quest_extraction(raw) as ExtractedQuest | null) ?? null,
    normalizeQuest: (extracted) => normalize_quest(extracted) as ExtractedQuest,
    questFallbackExtract: (offerText) => quest_fallback_extract(offerText) as ExtractedQuest,
    questCompleteReward: (state, xpReward) =>
      quest_complete_reward(state, xpReward) as RewardResult,
    moodForHunger: (hunger) => mood_for_hunger(hunger),
    rankMemories: (query, items, topN) => rank_memories(query, items, topN) as string[],
    knowingExtractionSystem: () => knowing_extraction_system(),
    buildKnowingExtractionInput: (userMessage, aiResponse) =>
      build_knowing_extraction_input(userMessage, aiResponse),
    parseKnowingFacts: (raw) => parse_knowing_facts(raw) as ExtractedFact[],
    buildKnowingFragment: (facts) => build_knowing_fragment(facts),
    deriveStateFromPosition: (position, nowMs = Date.now()) =>
      derive_state_from_position(position, nowMs) as GameState,
    applyEvidence: (position, evidence, nowIso = new Date().toISOString()) =>
      apply_evidence(position, evidence, nowIso) as import('../../src/store').GreatWorkPosition,
    awakeningMessage: (name) => awakening_message(name),
    version: () => core_version(),
  }))
  return corePromise
}
