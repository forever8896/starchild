// src/platform/desktop.ts — Tauri implementation of the Platform seam.
//
// Thin adapter only: every method wires to an existing IPC command in
// `src-tauri/src/lib.rs` (or a `listen` event for streaming). No engine logic
// lives here — per the Golden Rule (web-app-prd.md §4.1), adapters only wire.

import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

import type {
  CompleteQuestResult,
  Message,
  OnboardingInput,
  Platform,
  Quest,
  StarchildState,
} from './index'

/**
 * Bridge the event-based `send_message_stream` command into an async iterable.
 *
 * The desktop command emits `stream-chunk` per token, `stream-done` when
 * complete, and `stream-error` on failure. We buffer tokens in a queue and
 * surface them through the generator, tearing down listeners on completion.
 */
async function* streamMessage(text: string): AsyncIterable<string> {
  const queue: string[] = []
  let done = false
  let error: Error | null = null
  let wake: (() => void) | null = null

  const notify = () => {
    if (wake) {
      const w = wake
      wake = null
      w()
    }
  }

  const unlisteners: UnlistenFn[] = []
  unlisteners.push(
    await listen<{ token: string }>('stream-chunk', (event) => {
      queue.push(event.payload.token)
      notify()
    }),
  )
  unlisteners.push(
    await listen('stream-done', () => {
      done = true
      notify()
    }),
  )
  unlisteners.push(
    await listen<{ error: string }>('stream-error', (event) => {
      error = new Error(event.payload.error)
      done = true
      notify()
    }),
  )

  // Kick off the command; failures surface through the same path.
  invoke('send_message_stream', { message: text }).catch((err: unknown) => {
    error = err instanceof Error ? err : new Error(String(err))
    done = true
    notify()
  })

  try {
    for (;;) {
      while (queue.length > 0) {
        yield queue.shift() as string
      }
      if (error) throw error
      if (done) return
      await new Promise<void>((resolve) => {
        wake = resolve
      })
    }
  } finally {
    unlisteners.forEach((fn) => fn())
  }
}

export const desktopPlatform: Platform = {
  name: 'desktop',

  // ── Inference ──────────────────────────────────────────────────────────────
  hasInferenceKey() {
    return invoke<boolean>('has_api_key')
  },
  sendMessage(text: string): AsyncIterable<string> {
    return streamMessage(text)
  },

  // ── Data portability ────────────────────────────────────────────────────────
  // NOTE: passphrase-based encryption is not wired on desktop yet (§5). For now
  // we serialize the raw exported data; the encrypted `.starchild` format lands
  // with the export/import phase.
  async exportData(_passphrase: string): Promise<Blob> {
    const data = await invoke('export_all_data')
    return new Blob([JSON.stringify(data)], { type: 'application/json' })
  },
  async importData(_file: File, _passphrase: string): Promise<void> {
    throw new Error('desktop importData not implemented yet')
  },

  // ── Conversation ────────────────────────────────────────────────────────────
  getMessages(limit: number) {
    return invoke<Message[]>('get_messages', { limit })
  },
  generateFirstMessage() {
    return invoke<Message>('generate_first_message')
  },

  // ── Creature ────────────────────────────────────────────────────────────────
  getState() {
    return invoke<StarchildState>('get_state')
  },

  // ── Quests ──────────────────────────────────────────────────────────────────
  getQuests(status?: string) {
    return invoke<Quest[]>('get_quests', { status: status ?? null })
  },
  completeQuest(id: string) {
    return invoke<CompleteQuestResult>('complete_quest', { id })
  },
  acceptQuest() {
    return invoke<Quest>('accept_quest_from_conversation')
  },

  // ── Onboarding ──────────────────────────────────────────────────────────────
  async completeOnboarding(input: OnboardingInput): Promise<void> {
    if (input.apiKey) {
      await invoke('save_settings', { key: 'venice_api_key', value: input.apiKey })
    }
    if (input.userName) {
      await invoke('save_settings', { key: 'user_name', value: input.userName })
    }
    await invoke('save_settings', { key: 'onboarding_complete', value: 'true' })
  },

  // ── Settings ────────────────────────────────────────────────────────────────
  getSetting(key: string) {
    return invoke<string | null>('get_setting', { key })
  },
  async setSetting(key: string, value: string): Promise<void> {
    await invoke('save_settings', { key, value })
  },
}
