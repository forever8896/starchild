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
  detect_crisis,
  judge_proof,
  vision_from_crystallize,
  conversation_temperature,
  vision_synthesis_prompt,
  vision_synthesis_trigger,
  clean_vision,
  crystallize_suffix,
  strip_placement,
  proof_note,
  proof_max_unclear,
  crisis_active,
  crisis_resources,
  ai_disclosure_due,
  ai_disclosure_text,
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
  is_duplicate_fact,
  summary_due,
  summary_older_count,
  summary_system,
  build_summary_prompt,
  summary_fragment,
  derive_state_from_position,
  apply_evidence,
} from './wasm/starchild_core.js'

// ── Boundary types (mirror the core Rust structs) ─────────────────────────

/** A human crisis help line (core `safety::CrisisResource`). */
export interface CrisisResource {
  name: string
  /** Where it serves and when, e.g. "US & Canada · call or text, 24/7". */
  detail: string
  /** What to dial / text / visit, shown verbatim. */
  contact: string
  /** A tappable link (tel:, sms:, https:). */
  href: string
}

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
  | 'crisis'

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
  /** The implementation intention ("When [cue], I will [action]."), or "". */
  if_then?: string
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
  // ── Crystallize: the vision line is its own call; the reply answers them ──
  visionSynthesisPrompt(preferentialReality: string, conversation: string): string
  visionSynthesisTrigger(): string
  /** Tidy a synthesized vision; "" if unusable. */
  cleanVision(raw: string): string
  /** The vision + placement text appended after the acknowledgement. */
  crystallizeSuffix(vision: string): string
  /** Remove a "let's place this on your vision tree ✦" tail. */
  stripPlacement(reply: string): string
  /** Sampling temperature for the conversation in this phase. */
  conversationTemperature(phase: ConversationPhase): number
  /** The vision sentence from a Crystallize reply (what goes on the tree). */
  visionFromCrystallize(reply: string): string
  /** Post-process a model response for the given phase. */
  postprocess(text: string, phase: ConversationPhase): string

  // ── Safety ───────────────────────────────────────────────────────────────
  /** True when a human message signals crisis / self-harm (never capture/quest it). */
  detectCrisis(text: string): boolean
  /** True when any of the last few human messages (oldest-first) signalled crisis. */
  crisisActive(userMessages: string[]): boolean
  /** Human help lines for a region (ISO alpha-2), most local first. */
  crisisResources(region: string): CrisisResource[]
  /** Whether the AI disclosure is due (`lastShownMs` 0 = not yet this session). */
  aiDisclosureDue(lastShownMs: number, nowMs?: number): boolean
  /** The plain-language AI disclosure text. */
  aiDisclosureText(): string

  // ── Quest logic (single source — shared with the desktop shell) ──────────
  /** True when an assistant reply contains a quest offer the UI should surface. */
  isQuestOffer(text: string): boolean
  /** Judge a proof reply: the story (complete), a retraction (not_yet), or too little (unclear). */
  judgeProof(text: string): 'complete' | 'not_yet' | 'unclear'
  /** The system-prompt steer for a proof verdict ("" for complete). */
  proofNote(verdict: 'complete' | 'not_yet' | 'unclear'): string
  /** How many unclear proof replies before the quest is quietly disarmed. */
  proofMaxUnclear(): number
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
  // ── Rolling conversation summary (memory beyond the recent window) ─────────
  summaryDue(total: number, lastSummarized: number): boolean
  /** How many oldest messages to summarize (0 = not worth it yet). */
  summaryOlderCount(total: number): number
  summarySystem(): string
  buildSummaryPrompt(existing: string, older: ChatMessage[]): string
  /** The system-prompt fragment carrying the summary ("" when none). */
  summaryFragment(summary: string): string
  /** True when a newly extracted fact repeats a stored one (dedup on write). */
  isDuplicateFact(category: string, fact: string, existing: KnownFact[]): boolean

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
    visionFromCrystallize: (reply) => vision_from_crystallize(reply),
    conversationTemperature: (phase) => conversation_temperature(phase),
    visionSynthesisPrompt: (pr, conversation) => vision_synthesis_prompt(pr, conversation),
    visionSynthesisTrigger: () => vision_synthesis_trigger(),
    cleanVision: (raw) => clean_vision(raw),
    crystallizeSuffix: (vision) => crystallize_suffix(vision),
    stripPlacement: (reply) => strip_placement(reply),
    detectCrisis: (text) => detect_crisis(text),
    crisisActive: (userMessages) => crisis_active(userMessages),
    crisisResources: (region) => crisis_resources(region) as CrisisResource[],
    aiDisclosureDue: (lastShownMs, nowMs = Date.now()) => ai_disclosure_due(lastShownMs, nowMs),
    aiDisclosureText: () => ai_disclosure_text(),
    isQuestOffer: (text) => is_quest_offer(text),
    judgeProof: (text) => judge_proof(text) as 'complete' | 'not_yet' | 'unclear',
    proofNote: (verdict) => proof_note(verdict),
    proofMaxUnclear: () => proof_max_unclear(),
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
    isDuplicateFact: (category, fact, existing) => is_duplicate_fact(category, fact, existing),
    summaryDue: (total, last) => summary_due(total, last),
    summaryOlderCount: (total) => summary_older_count(total),
    summarySystem: () => summary_system(),
    buildSummaryPrompt: (existing, older) => build_summary_prompt(existing, older),
    summaryFragment: (summary) => summary_fragment(summary),
    deriveStateFromPosition: (position, nowMs = Date.now()) =>
      derive_state_from_position(position, nowMs) as GameState,
    applyEvidence: (position, evidence, nowIso = new Date().toISOString()) =>
      apply_evidence(position, evidence, nowIso) as import('../../src/store').GreatWorkPosition,
    awakeningMessage: (name) => awakening_message(name),
    version: () => core_version(),
  }))
  return corePromise
}
