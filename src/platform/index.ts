// src/platform/index.ts — the one seam components depend on.
//
// Per web-app-prd.md §4.4: components reach every platform feature ONLY through
// this interface. Desktop implements it over Tauri IPC (`desktop.ts`); web will
// implement it over WASM + IndexedDB + a Venice proxy/BYOK client (`web.ts`).
// No component should import `invoke`/`listen` or branch on the platform.

import type { Message, Quest, StarchildState } from '../store'

export type { Message, Quest, StarchildState }

/** Which shell is backing the current `Platform` instance. */
export type PlatformName = 'desktop' | 'web'

/** Inputs collected during first-run onboarding. */
export interface OnboardingInput {
  /** Venice API key (BYOK). Omitted when a key is already present. */
  apiKey?: string
  /** The name the human wants the Starchild to call them. */
  userName?: string
}

/** Result of completing a quest — mirrors the desktop `CompleteQuestResponse`. */
export interface CompleteQuestResult {
  quest: Quest
  starchild_state: StarchildState
  levelled_up: boolean
}

/**
 * The platform service. Every shell provides one concrete implementation.
 *
 * `sendMessage` returns an `AsyncIterable<string>` of response tokens so the UI
 * can stream regardless of how the underlying shell delivers them (Tauri events
 * on desktop, fetch streaming on web).
 */
export interface Platform {
  /** Which shell this implementation targets. */
  readonly name: PlatformName

  // ── Capabilities (queried, never branched on by platform name) ──────────────
  /** Text-to-speech available? (desktop: Venice TTS · web: not yet). */
  readonly supportsTts: boolean
  /** Voice input / transcription available? (desktop only for now). */
  readonly supportsVoice: boolean

  // ── Inference ──────────────────────────────────────────────────────────────
  /** desktop: local key present? · web: trial/BYOK/locked key available? */
  hasInferenceKey(): Promise<boolean>
  /** Stream the Starchild's reply token-by-token from core + Venice. */
  sendMessage(text: string): AsyncIterable<string>

  // ── Data portability (§5) ───────────────────────────────────────────────────
  /** Encrypted, versioned `.starchild` export of the full core data model. */
  exportData(passphrase: string): Promise<Blob>
  /** Import a `.starchild` file back into local storage. */
  importData(file: File, passphrase: string): Promise<void>

  // ── Conversation ────────────────────────────────────────────────────────────
  getMessages(limit: number): Promise<Message[]>
  /** Generate the Starchild's awakening message (first run, empty chat). */
  generateFirstMessage(): Promise<Message>
  /** Delete a single message from local storage. */
  deleteMessage(id: string): Promise<void>

  // ── Voice (capability-gated; throw/no-op where unsupported) ──────────────────
  /** Synthesize speech for `text`; resolves to base64-encoded MP3 audio. */
  ttsSpeak(text: string): Promise<string>
  /** Transcribe base64-encoded WAV audio to text. */
  transcribe(audioBase64: string): Promise<string>

  // ── Events ───────────────────────────────────────────────────────────────────
  /**
   * Subscribe to a backend/runtime event (e.g. `quest-celebration`). Returns an
   * unsubscribe function. Desktop wires this to Tauri events; web is a no-op
   * until the web shell emits its own events.
   */
  subscribe(event: string, handler: (payload: unknown) => void): () => void

  // ── Creature ────────────────────────────────────────────────────────────────
  getState(): Promise<StarchildState>

  // ── Quests ──────────────────────────────────────────────────────────────────
  getQuests(status?: string): Promise<Quest[]>
  completeQuest(id: string): Promise<CompleteQuestResult>
  /** Extract + save the quest the Starchild just offered in the conversation. */
  acceptQuest(): Promise<Quest>

  // ── Onboarding ──────────────────────────────────────────────────────────────
  completeOnboarding(input: OnboardingInput): Promise<void>

  // ── Settings ────────────────────────────────────────────────────────────────
  getSetting(key: string): Promise<string | null>
  setSetting(key: string, value: string): Promise<void>
}
