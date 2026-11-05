/**
 * prompt-engine.ts — the desktop LLM-judge suite's view of the prompt engine.
 *
 * This used to be a hand-maintained TypeScript COPY of the Rust PromptBuilder
 * and PhaseDetector, and it drifted (retired phases, old rules), so the suite
 * was judging a prompt neither shell shipped. It is now a thin wrapper over the
 * compiled shared core (WASM — build it with `npm run build:wasm --prefix web`),
 * so the suite always exercises the exact prompt both shells use.
 */

import { readFile } from 'node:fs/promises'
import { loadCore, type ConversationPhase } from '../../web/src/wasm-bridge'
import type { GreatWorkPosition } from '../../src/store'
import type { ChatMessage } from './venice-client'

export type { ConversationPhase }
export type { GreatWorkPosition, Plane, Stage } from '../../src/store'

export interface StarchildState {
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

const core = await loadCore(
  new Uint8Array(await readFile(new URL('../../web/src/wasm/starchild_core_bg.wasm', import.meta.url))),
)

/** Core phase detection (`crystallizePending` = a vision is ready to place). */
export function detectPhase(messages: ChatMessage[], crystallizePending = false): ConversationPhase {
  return core.detectPhase(messages, crystallizePending)
}

/** The core system prompt, exactly as the shells assemble its base layers. */
export function buildSystemPrompt(opts: {
  state?: StarchildState
  personality?: PersonalityParams
  memories?: string[]
  activeQuests?: string[]
  phase: ConversationPhase
  greatWork?: GreatWorkPosition
}): string {
  return core.buildPrompt({
    state: opts.state ?? { hunger: 50, mood: 'curious', energy: 80, bond: 10, level: 1 },
    ...(opts.personality ? { personality: opts.personality } : {}),
    memories: opts.memories ?? [],
    active_quests: opts.activeQuests ?? [],
    phase: opts.phase,
    great_work: opts.greatWork,
  })
}

/** Core response post-processing (paragraph collapse, emoji strip, …). */
export function postprocessResponse(text: string, phase: ConversationPhase): string {
  return core.postprocess(text, phase)
}
