/**
 * ChatView.tsx — the redesigned "main page" for the web shell (from Starchild.dc).
 *
 * Layout: the creature's presence on the left, the conversation on the right —
 * a header, the message thread (tender bubbles, an avatar beside each of the
 * Starchild's), and a rounded input dock with voice + send. The desktop keeps
 * the shared `ChatWindow`; this is the web edition's chat only.
 *
 * All behaviour is the real thing, ported verbatim from `ChatWindow`: streaming
 * replies through the platform seam, TTS auto-play with the first message
 * revealing in sync with the voice, mic transcription, and the inline
 * quest offer / proof flow. No text or copy of the conversation is altered.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore, type Message, type StarchildState } from '../../src/store'
import { usePlatform } from '../../src/platform/usePlatform'
import ActiveQuest from '../../src/components/ActiveQuest'
import CreaturePresence from './CreaturePresence'
import avatarFace from '../../src/assets/starchild-avatar.png'
import { createEtherealAudio } from './etherealVoice'

// ─── Char-by-char reveal synced to TTS audio (first message only) ────────────

// Reveal an assistant reply word-by-word as it's SPOKEN — the words land in
// lockstep with the voice (synced to `__ttsAudio` playback position). When
// there's no voice (toggle off / TTS down) it types out at a gentle steady
// pace instead of popping in whole. Applies to the awakening (`first-`) and
// every voiced reply (`reveal-`); other bubbles show instantly. A mode lock
// (wait → audio | type) prevents the text ever jumping backwards.
const TYPE_CPS = 40 // characters/second when typing without a voice
const NO_AUDIO_GRACE_MS = 500 // wait this long for audio before typing

function prefersReducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

function useCharReveal(content: string, isAssistant: boolean, messageId: string) {
  const shouldReveal =
    isAssistant &&
    freshlyRevealed.has(messageId) &&
    !prefersReducedMotion()
  const [chars, setChars] = useState(shouldReveal ? 0 : content.length)
  const doneRef = useRef(!shouldReveal)
  const rafRef = useRef<number | null>(null)
  const modeRef = useRef<'wait' | 'audio' | 'type'>('wait')
  const startRef = useRef(0)

  useEffect(() => {
    if (doneRef.current) return
    startRef.current = performance.now()
    const finish = () => { doneRef.current = true; setChars(content.length) }

    function tick() {
      const audio = (window as any).__ttsAudio as HTMLAudioElement | undefined
      const playing = !!audio && audio.duration > 0 && !audio.paused

      if (modeRef.current === 'type') {
        const typed = Math.floor(((performance.now() - startRef.current - NO_AUDIO_GRACE_MS) / 1000) * TYPE_CPS)
        setChars(Math.max(0, Math.min(content.length, typed)))
        if (typed >= content.length) { finish(); return }
      } else if (playing) {
        // Voice is speaking — follow it exactly.
        modeRef.current = 'audio'
        const progress = Math.min(audio!.currentTime / audio!.duration, 1)
        setChars(Math.floor(progress * content.length))
        if (progress >= 1) { finish(); return }
      } else if (modeRef.current === 'audio' && (!audio || audio.ended)) {
        finish(); return
      } else if (modeRef.current === 'wait' && performance.now() - startRef.current > NO_AUDIO_GRACE_MS) {
        // No voice arrived — commit to typing it out.
        modeRef.current = 'type'
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  if (doneRef.current) return content
  return content.slice(0, chars)
}


// ─── Icons ───────────────────────────────────────────────────────────────────

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
      <path d="M10.5 3.75a.75.75 0 00-1.264-.546L5.203 7H2.667a.75.75 0 00-.7.48A6.985 6.985 0 001.5 10c0 .887.165 1.737.468 2.52.111.29.39.48.7.48h2.535l4.033 3.796A.75.75 0 0010.5 16.25V3.75zM15.95 5.05a.75.75 0 00-1.06 1.061 5.5 5.5 0 010 7.778.75.75 0 001.06 1.06 7 7 0 000-9.899z" />
    </svg>
  )
}

// ─── AI avatar chip ──────────────────────────────────────────────────────────

function AvatarChip() {
  return (
    <div
      className="shrink-0 overflow-hidden rounded-full"
      style={{
        width: 46, height: 46,
        border: '1.5px solid rgba(184,160,216,.5)',
        boxShadow: '0 0 14px rgba(184,160,216,.35)',
        background: 'radial-gradient(circle, rgba(184,160,216,.3), transparent)',
      }}
    >
      <img src={avatarFace} alt="Starchild" className="w-full h-full object-cover" draggable={false} />
    </div>
  )
}

// ─── Play button (per AI message) ────────────────────────────────────────────

function PlayButton({ message }: { message: Message }) {
  const platform = usePlatform()
  const ttsPlaying = useAppStore((s) => s.ttsPlaying)
  const setTtsPlaying = useAppStore((s) => s.setTtsPlaying)
  const isPlaying = ttsPlaying === message.id
  if (!platform.supportsTts) return null

  const setActivity = useAppStore((s) => s.setCreatureActivity)

  async function handlePlay() {
    if (isPlaying) {
      setTtsPlaying(null); setActivity('idle')
      if ((window as any).__ttsAudio) { (window as any).__ttsAudio.pause(); (window as any).__ttsAudio = null }
      return
    }
    try {
      setTtsPlaying(message.id)
      const b64 = await platform.ttsSpeak(message.content)
      const audio = createEtherealAudio(b64)
      ;(window as any).__ttsAudio = audio
      setActivity('speaking')
      audio.onended = () => { setTtsPlaying(null); (window as any).__ttsAudio = null; setActivity('idle') }
      audio.onerror = () => { setTtsPlaying(null); (window as any).__ttsAudio = null; setActivity('idle') }
      await audio.play()
    } catch (err) {
      console.error('TTS failed:', err)
      setTtsPlaying(null); setActivity('idle')
    }
  }

  return (
    <button
      onClick={handlePlay}
      className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 w-5 h-5 flex items-center justify-center rounded-full"
      style={{ backgroundColor: isPlaying ? 'var(--accent-lavender)' : 'var(--bg-deep)', color: isPlaying ? '#1a1525' : 'var(--text-muted)' }}
      aria-label={isPlaying ? 'Stop speaking' : 'Listen'}
      title={isPlaying ? 'Stop' : 'Listen'}
    >
      <SpeakerIcon />
    </button>
  )
}

// ─── Message bubble ──────────────────────────────────────────────────────────

function MessageBubble({ message, onDelete }: { message: Message; onDelete: (id: string) => void }) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const displayContent = useCharReveal(message.content, isAssistant, message.id)
  const streaming = isAssistant && displayContent.length < message.content.length

  const DeleteBtn = (
    <button
      onClick={() => onDelete(message.id)}
      className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 w-5 h-5 flex items-center justify-center rounded-full"
      style={{ backgroundColor: 'var(--bg-deep)', color: 'var(--text-muted)' }}
      aria-label="Delete message"
      title="Delete message"
    >
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3" aria-hidden="true">
        <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
      </svg>
    </button>
  )

  if (isUser) {
    return (
      <div className="group flex justify-end w-full">
        <div className="relative">
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            style={{
              maxWidth: '100%',
              padding: '14px 19px',
              borderRadius: '24px 6px 24px 24px',
              background: 'linear-gradient(150deg,#57415a,#42304a)',
              border: '1px solid #7a6270',
              color: '#f7eef2',
              fontSize: '16.5px', lineHeight: 1.5,
              boxShadow: '0 14px 30px -14px rgba(0,0,0,.6), inset 0 2px 2px rgba(255,255,255,.08)',
            }}
            className="whitespace-pre-wrap break-words"
          >
            {message.content}
          </motion.div>
          <div className="absolute top-1 -left-8">{DeleteBtn}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex justify-start w-full">
      <div className="flex gap-3 items-end" style={{ maxWidth: '90%' }}>
        <AvatarChip />
        <div className="relative">
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            style={{
              padding: '14px 20px',
              borderRadius: '6px 24px 24px 24px',
              background: 'linear-gradient(150deg,#2c2542,#241d34)',
              border: '1px solid #4a3f60',
              color: 'var(--text-primary)',
              fontSize: '16.5px', lineHeight: 1.55,
              boxShadow: '0 14px 30px -14px rgba(0,0,0,.6), inset 0 2px 2px rgba(255,255,255,.05)',
            }}
            className="whitespace-pre-wrap break-words"
          >
            {displayContent}
            {streaming && (
              <span
                className="inline-block align-baseline ml-1"
                style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--accent-gold)', boxShadow: '0 0 10px 3px rgba(232,216,168,.9)', animation: 'typing-dot 1s ease-in-out infinite' }}
              />
            )}
          </motion.div>
          <div className="absolute top-1 -right-8 flex gap-1">
            <PlayButton message={message} />
            {DeleteBtn}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Thinking dots ───────────────────────────────────────────────────────────

function Thinking() {
  return (
    <div className="flex gap-3 items-end" aria-label="Starchild is thinking" aria-live="polite">
      <AvatarChip />
      <div
        className="flex gap-1.5 items-center"
        style={{ padding: '17px 22px', borderRadius: '6px 24px 24px 24px', background: 'linear-gradient(150deg,#2c2542,#241d34)', border: '1px solid #4a3f60' }}
      >
        <span className="typing-dot w-2 h-2 rounded-full" style={{ background: 'var(--accent-lavender)' }} />
        <span className="typing-dot w-2 h-2 rounded-full" style={{ background: 'var(--accent-lavender)' }} />
        <span className="typing-dot w-2 h-2 rounded-full" style={{ background: 'var(--accent-lavender)' }} />
      </div>
    </div>
  )
}

// ─── Send / mic glyphs ───────────────────────────────────────────────────────

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]" aria-hidden="true">
      <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
    </svg>
  )
}
function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]" aria-hidden="true">
      <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
      <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
    </svg>
  )
}

// Module-level single-flight for the awakening message: React StrictMode mounts
// twice in dev, and two concurrent `generateFirstMessage()` calls would persist
// (and show) two awakenings. Shared across mounts; reset on failure for retry.
let awakeningInFlight: Promise<import('../../src/store').Message> | null = null
// The awakening is added exactly once even across StrictMode's double-mount.
let awakeningRevealed = false
// Ids that were just spoken/dropped THIS session and should animate in as the
// voice lands. Drives the char-reveal instead of the message id's prefix — so a
// message reloaded from storage (same id) renders instantly, never re-typing.
const freshlyRevealed = new Set<string>()

// ─── Friendly error copy ─────────────────────────────────────────────────────
// Branch on the typed `VeniceError.code` (duck-typed — it crosses a dynamic
// import boundary) so trial users are never told to "check your API key".

function friendlyError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code
  switch (code) {
    case 'rate_limited':
      return 'the shared trial is catching its breath — give it a little while, then try again.'
    case 'unavailable':
      return 'the free trial is unavailable right now. try again soon — or add your own Venice key in Settings.'
    case 'auth':
      return 'your Venice key was not accepted — check it in Settings.'
    case 'network':
      return "can't reach the stars right now — check your connection and try again."
    default:
      if (err instanceof Error && err.message) return err.message
      if (typeof err === 'string' && err) return err
      return 'something went wrong sending that. your words are back in the box — try again.'
  }
}

// ─── ChatView ────────────────────────────────────────────────────────────────

export default function ChatView({ narrow }: { narrow: boolean }) {
  const platform          = usePlatform()
  const messages          = useAppStore((s) => s.messages)
  const addMessage        = useAppStore((s) => s.addMessage)
  const setMessages       = useAppStore((s) => s.setMessages)
  const isLoading         = useAppStore((s) => s.isLoading)
  const setIsLoading      = useAppStore((s) => s.setIsLoading)
  const setStarchildState = useAppStore((s) => s.setStarchildState)
  const setCurrentView    = useAppStore((s) => s.setCurrentView)
  const ttsEnabled        = useAppStore((s) => s.ttsEnabled)
  const setTtsEnabled     = useAppStore((s) => s.setTtsEnabled)
  const setCreatureActivity = useAppStore((s) => s.setCreatureActivity)
  const showQuestOffer    = useAppStore((s) => s.showQuestOffer)
  const setShowQuestOffer = useAppStore((s) => s.setShowQuestOffer)

  const bgMusicMuted    = useAppStore((s) => s.bgMusicMuted)
  const setBgMusicMuted = useAppStore((s) => s.setBgMusicMuted)

  const [ready, setReady] = useState(false)
  const [initFailed, setInitFailed] = useState(false)
  const [acceptingQuest, setAcceptingQuest] = useState(false)
  const [xpGain, setXpGain] = useState<number | null>(null)
  const [input, setInput]   = useState('')
  const [error, setError]   = useState<string | null>(null)
  const [isTyping, setIsTyping] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)
  const streamAccRef = useRef('')
  const micStreamRef = useRef<{ stream: MediaStream; context: AudioContext; processor: ScriptProcessorNode; chunks: Float32Array[] } | null>(null)

  const handleDeleteMessage = useCallback(async (id: string) => {
    try { await platform.deleteMessage(id); setMessages(messages.filter((m) => m.id !== id)) }
    catch (err) { console.error('Failed to delete message:', err) }
  }, [platform, messages, setMessages])

  // Speak a finished reply AND reveal its bubble in lockstep with the voice.
  // The order matters: we prepare the audio FIRST (thinking dots stay up during
  // the short TTS fetch), then drop the bubble in as the voice begins — so the
  // words land as they're spoken, never as an ugly all-at-once pop. With voice
  // off/unavailable the bubble types itself out instead (see useCharReveal).
  // `id` prefix `reveal-`/`first-` flags it for the reveal.
  const speakAndReveal = useCallback(async (text: string, id: string, awakening = false) => {
    if (awakening) { if (awakeningRevealed) return; awakeningRevealed = true }
    const drop = () => {
      freshlyRevealed.add(id) // mark it to animate in before it enters the list
      addMessage({ id, role: 'assistant', content: text, created_at: new Date().toISOString() })
    }
    const voiceWanted = platform.supportsTts && useAppStore.getState().ttsEnabled
    if (voiceWanted) {
      try {
        const b64 = await platform.ttsSpeak(text)
        const audio = createEtherealAudio(b64)
        ;(window as any).__ttsAudio = audio
        setIsTyping(false)
        drop()
        setCreatureActivity('speaking')
        audio.onended = () => { (window as any).__ttsAudio = null; setCreatureActivity('idle') }
        audio.onerror = () => { (window as any).__ttsAudio = null; setCreatureActivity('idle') }
        await audio.play()
        return
      } catch (err) {
        console.error('TTS failed; typing the reply instead:', err)
      }
    }
    ;(window as any).__ttsAudio = null
    setIsTyping(false)
    drop()
    setCreatureActivity('idle')
  }, [platform, addMessage, setCreatureActivity])

  // First mount (and "try again ✦"): load history; if empty, generate the local
  // awakening message. A failure flips `initFailed` so the empty state shows a
  // real error + retry instead of doubling as an eternal "consciousness stirring".
  const initConversation = useCallback(async () => {
    setInitFailed(false)
    try {
      const msgs = await platform.getMessages(50)
      setMessages(msgs)
      if (msgs.length === 0) {
        setIsTyping(true)               // dots stay up through generate + TTS
        setCreatureActivity('thinking')
        try {
          // Single-flight across StrictMode's double mount: both runs await the
          // SAME generation; `speakAndReveal(…, true)` adds it exactly once.
          awakeningInFlight ??= platform.generateFirstMessage()
          const firstMsg = await awakeningInFlight
          // Reveal under the SAME id it was persisted with (not a re-prefixed one)
          // so the reload-from-storage copy and this reveal-add are one message —
          // combined with the idempotent store add, never two identical bubbles.
          await speakAndReveal(firstMsg.content, firstMsg.id, true)
        } catch (err) {
          console.error('Failed to generate first message:', err)
          awakeningInFlight = null // let "try again" attempt a fresh generation
          awakeningRevealed = false
          setInitFailed(true)
          setIsTyping(false)
          setCreatureActivity('idle')
        }
      }
    } catch (err) {
      console.error('Failed to load messages:', err)
      setInitFailed(true)
    } finally {
      setReady(true)
    }
  }, [platform, setMessages, speakAndReveal, setCreatureActivity])

  useEffect(() => { void initConversation() }, [initConversation])

  // Background music (started during onboarding, parked on window.__bgMusic):
  // honor the persisted mute across sessions and give the shell a real control.
  useEffect(() => {
    let muted = false
    try { muted = localStorage.getItem('starchild_music_muted') === '1' } catch { /* private mode */ }
    setBgMusicMuted(muted)
    const music = (window as unknown as { __bgMusic?: HTMLAudioElement }).__bgMusic
    if (music && muted) music.pause()
  }, [setBgMusicMuted])

  const toggleMusic = useCallback(() => {
    const next = !bgMusicMuted
    setBgMusicMuted(next)
    try { localStorage.setItem('starchild_music_muted', next ? '1' : '0') } catch { /* private mode */ }
    const music = (window as unknown as { __bgMusic?: HTMLAudioElement }).__bgMusic
    if (music) {
      if (next) music.pause()
      else void music.play().catch(() => {})
    }
  }, [bgMusicMuted, setBgMusicMuted])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, isTyping, showQuestOffer])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading) return
    setError(null); setInput(''); setIsLoading(true); setIsTyping(true)
    setCreatureActivity('thinking')
    const tmpId = `tmp-${Date.now()}`
    addMessage({ id: tmpId, role: 'user', content: text, created_at: new Date().toISOString() })
    if (inputRef.current) inputRef.current.style.height = 'auto'
    streamAccRef.current = ''
    try {
      // Accumulate the reply SILENTLY (thinking dots stay); we reveal it in sync
      // with the voice once it's ready — never an all-at-once pop mid-stream.
      for await (const token of platform.sendMessage(text)) {
        streamAccRef.current += token
      }
      setIsLoading(false)
      try { setStarchildState(await platform.getState()) } catch { /* non-critical */ }
      await speakAndReveal(streamAccRef.current, `reveal-${Date.now()}`)
      inputRef.current?.focus()
    } catch (err) {
      setIsTyping(false); setIsLoading(false); setCreatureActivity('idle')
      console.error('Failed to send message:', err)
      // The platform rolled the turn back — mirror that in the UI: drop the
      // optimistic user bubble and hand the user their words back to retry.
      setMessages(
        useAppStore.getState().messages.filter((m) => m.id !== tmpId),
      )
      setInput(text)
      setError(friendlyError(err))
      inputRef.current?.focus()
    }
  }, [platform, input, isLoading, addMessage, setIsLoading, setStarchildState, setMessages, setCreatureActivity, speakAndReveal])

  const handleAcceptQuest = useCallback(async () => {
    setAcceptingQuest(true); setShowQuestOffer(false)
    try { await platform.acceptQuest(); setCurrentView('tree') }
    catch (err) { console.error('Failed to accept quest:', err) }
    finally { setAcceptingQuest(false) }
  }, [platform, setShowQuestOffer, setCurrentView])

  const handleDeclineQuest = useCallback(() => { setShowQuestOffer(false); inputRef.current?.focus() }, [setShowQuestOffer])

  const handleRequestProof = useCallback((quest: { id: string; title: string; description: string | null }) => {
    const displayText = `i did the quest: "${quest.title}"`
    const triggerText = `[proof:${quest.id}] ${displayText}`
    setInput(''); setError(null); setIsLoading(true); setIsTyping(true)
    setCreatureActivity('thinking')
    const tmpId = `quest-proof-${Date.now()}`
    addMessage({ id: tmpId, role: 'user', content: displayText, created_at: new Date().toISOString() })
    streamAccRef.current = ''
    ;(async () => {
      try {
        for await (const token of platform.sendMessage(triggerText)) {
          streamAccRef.current += token
        }
        setIsLoading(false)
        try { setStarchildState(await platform.getState()) } catch { /* non-critical */ }
        await speakAndReveal(streamAccRef.current, `reveal-${Date.now()}`)
        inputRef.current?.focus()
      } catch (err) {
        setIsTyping(false); setIsLoading(false); setCreatureActivity('idle')
        // The platform rolled the proof turn back (quest stays completable) —
        // drop the optimistic user bubble so the thread matches what happened.
        setMessages(
          useAppStore.getState().messages.filter((m) => m.id !== tmpId),
        )
        setError(friendlyError(err))
      }
    })()
  }, [platform, addMessage, setIsLoading, setStarchildState, setMessages, setCreatureActivity, speakAndReveal])

  useEffect(() => {
    return platform.subscribe('quest-completed', (payload) => {
      const p = payload as { starchild_state?: StarchildState; xp_reward?: number } | null
      if (p?.starchild_state) setStarchildState(p.starchild_state)
      if (p?.xp_reward) { setXpGain(p.xp_reward); setTimeout(() => setXpGain(null), 3000) }
    })
  }, [platform, setStarchildState])

  const handleMicToggle = useCallback(async () => {
    if (isRecording && micStreamRef.current) {
      const { stream, context, processor, chunks } = micStreamRef.current
      const actualSampleRate = context.sampleRate
      processor.disconnect(); context.close(); stream.getTracks().forEach((t) => t.stop())
      micStreamRef.current = null; setIsRecording(false)
      if (chunks.length === 0) return
      setIsTranscribing(true)
      try {
        const totalLen = chunks.reduce((acc, c) => acc + c.length, 0)
        const pcm = new Float32Array(totalLen)
        let offset = 0
        for (const c of chunks) { pcm.set(c, offset); offset += c.length }
        const sampleRate = actualSampleRate, numChannels = 1, bytesPerSample = 2
        const dataLength = pcm.length * bytesPerSample
        const buffer = new ArrayBuffer(44 + dataLength)
        const view = new DataView(buffer)
        const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)) }
        writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataLength, true); writeStr(8, 'WAVE'); writeStr(12, 'fmt ')
        view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numChannels, true)
        view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * numChannels * bytesPerSample, true)
        view.setUint16(32, numChannels * bytesPerSample, true); view.setUint16(34, bytesPerSample * 8, true)
        writeStr(36, 'data'); view.setUint32(40, dataLength, true)
        for (let i = 0; i < pcm.length; i++) {
          const s = Math.max(-1, Math.min(1, pcm[i]))
          view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
        }
        const bytes = new Uint8Array(buffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
        const text = await platform.transcribe(btoa(binary))
        if (text) {
          setInput((prev) => (prev ? prev + ' ' + text : text))
          if (inputRef.current) { inputRef.current.style.height = 'auto'; inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px` }
        }
      } catch (err) {
        console.error('Transcription failed:', err)
        setError(typeof err === 'string' ? err : 'Voice transcription failed.')
      } finally { setIsTranscribing(false) }
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } })
      const context = new AudioContext()
      const source = context.createMediaStreamSource(stream)
      const processor = context.createScriptProcessor(4096, 1, 1)
      const chunks: Float32Array[] = []
      processor.onaudioprocess = (e) => { chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))) }
      source.connect(processor); processor.connect(context.destination)
      micStreamRef.current = { stream, context, processor, chunks }
      setIsRecording(true)
    } catch (err) {
      console.error('Microphone access failed:', err)
      setError('Could not access microphone. Please allow microphone access.')
    }
  }, [isRecording, platform])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
  }
  const canSend = input.trim().length > 0 && !isLoading

  return (
    <div className="absolute inset-0 flex" style={{ animation: 'fade-in .7s ease' }}>
      {/* creature presence — wide layout only */}
      {!narrow && <CreaturePresence />}

      {/* chat column */}
      <section className="flex-1 min-w-0 flex flex-col">
        {/* compact creature strip — narrow layout */}
        {narrow && (
          <div className="shrink-0 px-5 py-3.5" style={{ borderBottom: '1px solid rgba(74,63,96,.4)' }}>
            <CreaturePresence compact />
          </div>
        )}

        {/* header */}
        <header className="shrink-0 flex items-baseline justify-between gap-4" style={{ padding: '20px 30px 14px' }}>
          <div>
            <h1 className="m-0 text-[19px] font-extrabold" style={{ color: 'var(--text-primary)' }}>between us</h1>
            <p className="mt-0.5 text-[13px]" style={{ color: 'var(--text-muted)' }}>private by design — end-to-end encrypted, stored only here</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMusic}
              aria-label={bgMusicMuted ? 'Turn music on' : 'Turn music off'}
              className="cursor-pointer text-[13px] font-bold px-[15px] py-[9px] rounded-[18px]"
              style={!bgMusicMuted
                ? { border: '1px solid rgba(184,160,216,.5)', color: 'var(--accent-lavender)', background: 'rgba(184,160,216,.12)' }
                : { border: '1px solid rgba(74,63,96,.7)', color: 'var(--text-muted)', background: 'rgba(48,41,69,.5)' }}
            >
              {bgMusicMuted ? '♪ music off' : '♪ music on'}
            </button>
            {platform.supportsTts && (
              <button
                onClick={() => setTtsEnabled(!ttsEnabled)}
                className="cursor-pointer text-[13px] font-bold px-[15px] py-[9px] rounded-[18px]"
                style={ttsEnabled
                  ? { border: '1px solid rgba(232,216,168,.5)', color: 'var(--accent-gold)', background: 'rgba(232,216,168,.12)' }
                  : { border: '1px solid rgba(74,63,96,.7)', color: 'var(--text-muted)', background: 'rgba(48,41,69,.5)' }}
              >
                {ttsEnabled ? '🔊 voice on' : '🔈 voice off'}
              </button>
            )}
          </div>
        </header>

        {/* active quest card (real) */}
        {ready && <div className="px-[30px]"><ActiveQuest onRequestProof={handleRequestProof} /></div>}

        {/* thread */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[18px]" style={{ padding: '10px 30px 8px' }} role="log" aria-label="Chat messages" aria-live="polite">
          {messages.length === 0 && !isTyping ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-4">
              {initFailed ? (
                <>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    the awakening didn't take hold — something interrupted it.
                  </p>
                  <button
                    onClick={() => void initConversation()}
                    className="px-5 py-2.5 text-[14px] font-bold rounded-[18px]"
                    style={{ border: 'none', color: '#1c1526', background: 'linear-gradient(150deg,#c8b0e0,#b8a0d8)', boxShadow: '0 10px 20px -8px rgba(184,160,216,.6)' }}
                  >
                    try again ✦
                  </button>
                </>
              ) : (
                <p className="text-sm italic" style={{ color: 'var(--text-muted)' }}>consciousness stirring...</p>
              )}
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} onDelete={handleDeleteMessage} />
              ))}
              <AnimatePresence>
                {isTyping && (
                  <motion.div key="thinking" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ type: 'spring', stiffness: 280, damping: 22 }}>
                    <Thinking />
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {/* inline quest offer */}
          <AnimatePresence>
            {showQuestOffer && (
              <motion.div
                className="flex items-center justify-start gap-2.5" style={{ marginLeft: 58 }}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ type: 'spring', stiffness: 280, damping: 22 }}
              >
                <motion.button
                  onClick={handleAcceptQuest} disabled={acceptingQuest}
                  aria-label="Accept quest"
                  className="px-5 py-2.5 text-[14px] font-bold rounded-[18px] disabled:opacity-50"
                  style={{ border: 'none', color: '#1c1526', background: 'linear-gradient(150deg,#c8b0e0,#b8a0d8)', boxShadow: '0 10px 20px -8px rgba(184,160,216,.6)' }}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                >
                  {acceptingQuest ? 'placing on tree...' : 'accept ✦'}
                </motion.button>
                <motion.button
                  onClick={handleDeclineQuest}
                  className="px-4 py-2.5 text-[14px] font-semibold rounded-[18px]"
                  style={{ color: 'var(--text-muted)', background: 'rgba(48,41,69,.6)', border: '1px solid var(--outline)' }}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                >
                  decline & clarify
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>

        {/* xp gain */}
        <AnimatePresence>
          {xpGain && (
            <motion.div className="flex items-center justify-center py-2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <motion.span className="text-lg font-bold px-4 py-1 rounded-xl" style={{ color: 'var(--accent-mint)', backgroundColor: 'rgba(168,216,184,0.1)' }} animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.5 }}>
                +{xpGain} XP ✦
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* error */}
        <AnimatePresence>
          {error && (
            <motion.div
              key="error" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className="mx-[30px] mb-2 px-3 py-2 text-xs rounded-2xl"
              style={{ backgroundColor: 'rgba(200,80,80,0.12)', border: '1px solid rgba(200,80,80,0.3)', color: 'var(--accent-rose)' }}
              role="alert"
            >
              {error}
              <button onClick={() => setError(null)} className="ml-2 font-bold hover:opacity-70" style={{ color: 'var(--accent-rose)' }} aria-label="Dismiss error">×</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* input dock */}
        <div className="shrink-0" style={{ padding: '12px 30px 24px' }}>
          <div
            className="flex items-end gap-2.5"
            style={{ padding: '9px 9px 9px 20px', borderRadius: 28, background: 'linear-gradient(145deg,#2a2440,#201b2f)', border: '1px solid #4a3f60', boxShadow: '0 18px 38px -16px rgba(0,0,0,.7), inset 0 2px 2px rgba(255,255,255,.05), inset 0 -6px 14px rgba(0,0,0,.3)' }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="talk to your starchild..."
              rows={1}
              disabled={isLoading}
              aria-label="Message input"
              className="flex-1 resize-none bg-transparent outline-none disabled:opacity-50"
              style={{ color: 'var(--text-primary)', fontSize: '16.5px', lineHeight: 1.5, maxHeight: 120, padding: '8px 0' }}
            />
            {platform.supportsVoice && (
              <motion.button
                onClick={handleMicToggle}
                disabled={isLoading || isTranscribing}
                aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
                className={`shrink-0 flex items-center justify-center rounded-full ${isRecording ? 'mic-recording' : ''}`}
                style={{
                  width: 48, height: 48,
                  ...(isRecording
                    ? { border: '1px solid rgba(232,168,184,.6)', color: 'var(--accent-rose)', background: 'rgba(232,168,184,.16)' }
                    : isTranscribing
                      ? { border: '1px solid rgba(74,63,96,.7)', color: 'var(--accent-lavender)', background: 'rgba(48,41,69,.6)', cursor: 'wait' }
                      : { border: '1px solid rgba(74,63,96,.7)', color: 'var(--text-secondary)', background: 'rgba(48,41,69,.6)' }),
                }}
                whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }}
              >
                <MicIcon />
              </motion.button>
            )}
            <motion.button
              onClick={handleSend}
              disabled={!canSend}
              aria-label="Send message"
              className="shrink-0 flex items-center justify-center rounded-full"
              style={{
                width: 48, height: 48, border: 'none',
                color: '#1c1526',
                background: canSend ? 'linear-gradient(150deg,#c8b0e0,#b8a0d8)' : 'rgba(48,41,69,.6)',
                boxShadow: canSend ? '0 10px 22px -8px rgba(184,160,216,.7), inset 0 2px 2px rgba(255,255,255,.4)' : 'none',
                cursor: canSend ? 'pointer' : 'not-allowed',
                opacity: canSend ? 1 : 0.6,
              }}
              whileHover={canSend ? { scale: 1.06 } : {}}
              whileTap={canSend ? { scale: 0.92 } : {}}
            >
              <SendIcon />
            </motion.button>
          </div>
        </div>
      </section>
    </div>
  )
}
