import { create } from 'zustand'

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
  category: string | null // 'body' | 'purpose' | 'mind' | 'heart' | 'spirit'
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

// ─── Great Work types (mirrors src-tauri/core/src/opus.rs) ──────────────────

export type Plane = 'body' | 'mind' | 'spirit'
export type Stage = 'calcination' | 'dissolution' | 'separation' | 'conjunction' | 'fermentation' | 'distillation' | 'coagulation'

export interface Cell {
  plane: Plane
  stage: Stage
}

export interface Evidence {
  kind: 'QuestCompleted' | 'InsightCrystallized' | 'KnowingDeepened'
  cell?: Cell
  quest_title?: string
  insight?: string
  dimension?: string
  depth?: number
}

export interface PlanePosition {
  plane: Plane
  stage: Stage
  cells_worked: Stage[]
  evidence: Evidence[]
  stuck: boolean
}

export interface GreatWorkPosition {
  preferential_reality: string | null
  planes: [PlanePosition, PlanePosition, PlanePosition]
  active_cell: Cell | null
  total_cells_worked: number
  last_advanced_at: string | null
}

// ─── Store interface ─────────────────────────────────────────────────────────

interface AppState {
  // Navigation
  currentView: 'chat' | 'settings' | 'tree'
  setCurrentView: (view: AppState['currentView']) => void

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

  // Progressive UI — hide sections until they're relevant
  hasQuests: boolean
  setHasQuests: (has: boolean) => void

  // Quest offer buttons (persists across view switches)
  showQuestOffer: boolean
  setShowQuestOffer: (show: boolean) => void

  // Voice / TTS
  ttsEnabled: boolean
  setTtsEnabled: (enabled: boolean) => void
  ttsVoice: string
  setTtsVoice: (voice: string) => void
  ttsPlaying: string | null  // message id currently playing
  setTtsPlaying: (id: string | null) => void

  // Creature activity — drives which clip plays (conversation-aware, not just
  // hunger). 'speaking' while a reply is voiced/streamed, 'thinking' while
  // composing, else the resting mood clip.
  creatureActivity: 'idle' | 'thinking' | 'speaking'
  setCreatureActivity: (a: 'idle' | 'thinking' | 'speaking') => void

  // Background music
  bgMusicMuted: boolean
  setBgMusicMuted: (muted: boolean) => void
}

// ─── Store implementation ────────────────────────────────────────────────────

export const useAppStore = create<AppState>((set) => ({
  // Navigation
  currentView: 'chat',
  setCurrentView: (view) => set({ currentView: view }),

  // Chat
  messages: [],
  addMessage: (msg) =>
    // Idempotent by id: the web awakening can be surfaced twice under React
    // StrictMode's double-mount (one reveal-add racing one reload) — adding by
    // id means the second never produces a duplicate bubble.
    set((state) => (state.messages.some((m) => m.id === msg.id) ? state : { messages: [...state.messages, msg] })),
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

  // Progressive UI
  hasQuests: false,
  setHasQuests: (hasQuests) => set({ hasQuests }),

  showQuestOffer: false,
  setShowQuestOffer: (showQuestOffer) => set({ showQuestOffer }),

  // Voice / TTS
  ttsEnabled: true,
  setTtsEnabled: (ttsEnabled) => set({ ttsEnabled }),
  ttsVoice: 'am_echo',
  setTtsVoice: (ttsVoice) => set({ ttsVoice }),
  ttsPlaying: null,
  setTtsPlaying: (ttsPlaying) => set({ ttsPlaying }),

  creatureActivity: 'idle',
  setCreatureActivity: (creatureActivity) => set({ creatureActivity }),

  bgMusicMuted: false,
  setBgMusicMuted: (bgMusicMuted) => set({ bgMusicMuted }),
}))
