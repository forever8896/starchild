// src/platform/web.ts — web implementation of the Platform seam (stubs).
//
// The real web shell (WASM core + IndexedDB storage + Venice proxy/BYOK client)
// lands in later phases (web-app-prd.md §9). Every method throws for now so the
// seam type-checks and components can target it without branching on platform.

import type {
  CompleteQuestResult,
  Message,
  OnboardingInput,
  Platform,
  Quest,
  StarchildState,
} from './index'

const notImplemented = (what: string): never => {
  throw new Error(`web platform: ${what} not implemented yet`)
}

export const webPlatform: Platform = {
  name: 'web',

  // ── Inference ──────────────────────────────────────────────────────────────
  hasInferenceKey(): Promise<boolean> {
    return notImplemented('hasInferenceKey')
  },
  // eslint-disable-next-line require-yield
  async *sendMessage(_text: string): AsyncIterable<string> {
    notImplemented('sendMessage')
  },

  // ── Data portability ────────────────────────────────────────────────────────
  exportData(_passphrase: string): Promise<Blob> {
    return notImplemented('exportData')
  },
  importData(_file: File, _passphrase: string): Promise<void> {
    return notImplemented('importData')
  },

  // ── Conversation ────────────────────────────────────────────────────────────
  getMessages(_limit: number): Promise<Message[]> {
    return notImplemented('getMessages')
  },
  generateFirstMessage(): Promise<Message> {
    return notImplemented('generateFirstMessage')
  },

  // ── Creature ────────────────────────────────────────────────────────────────
  getState(): Promise<StarchildState> {
    return notImplemented('getState')
  },

  // ── Quests ──────────────────────────────────────────────────────────────────
  getQuests(_status?: string): Promise<Quest[]> {
    return notImplemented('getQuests')
  },
  completeQuest(_id: string): Promise<CompleteQuestResult> {
    return notImplemented('completeQuest')
  },
  acceptQuest(): Promise<Quest> {
    return notImplemented('acceptQuest')
  },

  // ── Onboarding ──────────────────────────────────────────────────────────────
  completeOnboarding(_input: OnboardingInput): Promise<void> {
    return notImplemented('completeOnboarding')
  },

  // ── Settings ────────────────────────────────────────────────────────────────
  getSetting(_key: string): Promise<string | null> {
    return notImplemented('getSetting')
  },
  setSetting(_key: string, _value: string): Promise<void> {
    return notImplemented('setSetting')
  },
}
