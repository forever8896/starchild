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
    version: () => core_version(),
  }))
  return corePromise
}
