import { create } from 'zustand'

import type { IdentityInfo, Attestation } from './chain'

// ─── Shared types ────────────────────────────────────────────────────────────

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface Memory {
  id: string
  content: string
  importance: number
  category: string | null
  created_at: string
  last_accessed_at: string
}

export interface Quest {
  id: string
  title: string
  description: string | null
  quest_type: string    // 'daily' | 'weekly'
  category: string | null // 'health' | 'career' | 'learning' | 'relationships' | 'creative'
  status: string        // 'active' | 'completed'
  xp_reward: number
  streak_count: number
  created_at: string
  completed_at: string | null
  due_at: string | null
}

export interface StarchildState {
  hunger: number   // 0–100  (100 = full)
  mood: string     // 'Ecstatic' | 'Happy' | 'Content' | 'Restless' | 'Hungry' | 'Starving'
  energy: number   // 0–100
  bond: number     // 0–100
  xp: number
  level: number
}

// ─── Store interface ─────────────────────────────────────────────────────────

interface AppState {
  // Navigation
  activeView: 'chat' | 'quests' | 'profile' | 'settings'
  setActiveView: (view: AppState['activeView']) => void

  // Chat
  messages: Message[]
  addMessage: (msg: Message) => void
  setMessages: (msgs: Message[]) => void
  updateLastMessage: (content: string) => void
  replaceLastMessage: (msg: Message) => void

  // Creature
  starchildState: StarchildState | null
  setStarchildState: (state: StarchildState) => void

  // UI flags
  isLoading: boolean
  setIsLoading: (loading: boolean) => void

  // Settings
  apiKeySet: boolean
  setApiKeySet: (set: boolean) => void

  // Onboarding
  onboardingComplete: boolean
  setOnboardingComplete: (done: boolean) => void
  onboardingChecked: boolean
  setOnboardingChecked: (checked: boolean) => void

  // Telegram
  telegramStatus: 'stopped' | 'starting' | 'connected' | 'error'
  telegramBotUsername: string | null
  setTelegramStatus: (status: 'stopped' | 'starting' | 'connected' | 'error') => void
  setTelegramBotUsername: (username: string | null) => void

  // WhatsApp
  whatsappStatus: 'stopped' | 'waiting_for_qr' | 'connected' | 'error'
  whatsappPhone: string | null
  whatsappQrCode: string | null
  setWhatsappStatus: (status: 'stopped' | 'waiting_for_qr' | 'connected' | 'error') => void
  setWhatsappPhone: (phone: string | null) => void
  setWhatsappQrCode: (qr: string | null) => void

  // Identity
  identityInfo: IdentityInfo | null
  setIdentityInfo: (info: IdentityInfo) => void

  // Attestations
  attestations: Attestation[]
  setAttestations: (attestations: Attestation[]) => void
  pendingMilestones: string[]
  setPendingMilestones: (milestones: string[]) => void
  dismissMilestone: (milestone: string) => void
}

// ─── Store implementation ────────────────────────────────────────────────────

export const useAppStore = create<AppState>((set) => ({
  // Navigation
  activeView: 'chat',
  setActiveView: (view) => set({ activeView: view }),

  // Chat
  messages: [],
  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),
  setMessages: (msgs) => set({ messages: msgs }),
  updateLastMessage: (content) =>
    set((state) => {
      if (state.messages.length === 0) return state
      const msgs = [...state.messages]
      msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content }
      return { messages: msgs }
    }),
  replaceLastMessage: (msg) =>
    set((state) => {
      if (state.messages.length === 0) return state
      const msgs = [...state.messages]
      msgs[msgs.length - 1] = msg
      return { messages: msgs }
    }),

  // Creature
  starchildState: null,
  setStarchildState: (starchildState) => set({ starchildState }),

  // UI flags
  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),

  // Settings
  apiKeySet: false,
  setApiKeySet: (apiKeySet) => set({ apiKeySet }),

  // Onboarding
  onboardingComplete: false,
  setOnboardingComplete: (onboardingComplete) => set({ onboardingComplete }),
  onboardingChecked: false,
  setOnboardingChecked: (onboardingChecked) => set({ onboardingChecked }),

  // Telegram
  telegramStatus: 'stopped',
  telegramBotUsername: null,
  setTelegramStatus: (telegramStatus) => set({ telegramStatus }),
  setTelegramBotUsername: (telegramBotUsername) => set({ telegramBotUsername }),

  // WhatsApp
  whatsappStatus: 'stopped',
  whatsappPhone: null,
  whatsappQrCode: null,
  setWhatsappStatus: (whatsappStatus) => set({ whatsappStatus }),
  setWhatsappPhone: (whatsappPhone) => set({ whatsappPhone }),
  setWhatsappQrCode: (whatsappQrCode) => set({ whatsappQrCode }),

  // Identity
  identityInfo: null,
  setIdentityInfo: (identityInfo) => set({ identityInfo }),

  // Attestations
  attestations: [],
  setAttestations: (attestations) => set({ attestations }),
  pendingMilestones: [],
  setPendingMilestones: (pendingMilestones) => set({ pendingMilestones }),
  dismissMilestone: (milestone) =>
    set((state) => ({
      pendingMilestones: state.pendingMilestones.filter((m) => m !== milestone),
    })),
}))
