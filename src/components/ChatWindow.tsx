/**
 * ChatWindow.tsx — Horizontal layout: Starchild creature (left) + Chat (right)
 *
 * Full-screen skyline background behind everything.
 * Creature on the left, chat on the right. No sidebar.
 * Cinematic clay surfaces with framer-motion spring animations.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useAppStore, type Message } from '../store'
import StarchildAvatar from './StarchildAvatar'
import ActiveQuest from './ActiveQuest'
import starchildLogo from '../assets/starchild-logo.png'

// ─── Typing indicator ────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 px-4 py-1" aria-label="Starchild is typing" aria-live="polite">
      <div className="clay flex items-center gap-1.5 px-4 py-2.5" style={{ borderRadius: '22px 22px 22px 6px' }}>
        <span className="typing-dot w-2 h-2 rounded-full inline-block" style={{ backgroundColor: 'var(--accent-lavender)' }} />
        <span className="typing-dot w-2 h-2 rounded-full inline-block" style={{ backgroundColor: 'var(--accent-lavender)' }} />
        <span className="typing-dot w-2 h-2 rounded-full inline-block" style={{ backgroundColor: 'var(--accent-lavender)' }} />
      </div>
    </div>
  )
}

// ─── Single message bubble ───────────────────────────────────────────────────

function SpeakerIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
      <path d="M10.5 3.75a.75.75 0 00-1.264-.546L5.203 7H2.667a.75.75 0 00-.7.48A6.985 6.985 0 001.5 10c0 .887.165 1.737.468 2.52.111.29.39.48.7.48h2.535l4.033 3.796A.75.75 0 0010.5 16.25V3.75zM15.95 5.05a.75.75 0 00-1.06 1.061 5.5 5.5 0 010 7.778.75.75 0 001.06 1.06 7 7 0 000-9.899z" />
    </svg>
  )
}

function PlayButton({ message }: { message: Message }) {
  const ttsPlaying = useAppStore((s) => s.ttsPlaying)
  const setTtsPlaying = useAppStore((s) => s.setTtsPlaying)
  const isPlaying = ttsPlaying === message.id

  async function handlePlay() {
    if (isPlaying) {
      setTtsPlaying(null)
      // Stop any playing TTS audio
      if ((window as any).__ttsAudio) {
        ;(window as any).__ttsAudio.pause()
        ;(window as any).__ttsAudio = null
      }
      return
    }
    try {
      setTtsPlaying(message.id)
      const b64 = await invoke<string>('venice_tts_speak', { text: message.content })
      const audio = new Audio(`data:audio/mp3;base64,${b64}`)
      ;(window as any).__ttsAudio = audio
      audio.onended = () => { setTtsPlaying(null); (window as any).__ttsAudio = null }
      audio.onerror = (e) => { console.error('TTS audio error:', e); setTtsPlaying(null); (window as any).__ttsAudio = null }
      await audio.play()
    } catch (err) {
      console.error('TTS failed:', err)
      setTtsPlaying(null)
    }
  }

  return (
    <button
      onClick={handlePlay}
      className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 w-5 h-5 flex items-center justify-center rounded-full"
      style={{
        backgroundColor: isPlaying ? 'var(--accent-lavender)' : 'var(--bg-deep)',
        color: isPlaying ? '#1a1525' : 'var(--text-muted)',
      }}
      aria-label={isPlaying ? 'Stop speaking' : 'Listen'}
      title={isPlaying ? 'Stop' : 'Listen'}
    >
      <SpeakerIcon />
    </button>
  )
}

// ─── Character-by-character reveal synced to TTS audio ──────────────────────
// Reads directly from window.__ttsAudio.currentTime/duration on each frame.
// No events, no race conditions — just follows the actual audio playback.

function useCharReveal(content: string, isAssistant: boolean, messageId: string) {
  const isFirstMessage = messageId.startsWith('first-')
  const shouldReveal = isAssistant && isFirstMessage
  const [chars, setChars] = useState(shouldReveal ? 0 : content.length)
  const doneRef = useRef(!shouldReveal)
  const rafRef = useRef<number | null>(null)
  const audioDetectedRef = useRef(false)

  useEffect(() => {
    if (doneRef.current) return

    function tick() {
      const audio = (window as any).__ttsAudio as HTMLAudioElement | undefined

      if (audio && audio.duration && audio.duration > 0 && !audio.paused) {
        // Audio is playing — sync chars to playback position
        audioDetectedRef.current = true
        const progress = Math.min(audio.currentTime / audio.duration, 1)
        setChars(Math.floor(progress * content.length))
        if (progress >= 1) {
          doneRef.current = true
          setChars(content.length)
          return
        }
      } else if (audioDetectedRef.current && (!audio || audio.ended)) {
        // Audio was playing but now finished or removed
        doneRef.current = true
        setChars(content.length)
        return
      }
      // Keep polling — audio might not have started yet
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    // Fallback: if no audio has EVER been detected within 15s, show everything
    // (Venice API can take 5-8s to generate audio for long messages)
    const fallback = setTimeout(() => {
      if (!doneRef.current && !audioDetectedRef.current) {
        doneRef.current = true
        setChars(content.length)
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
      }
    }, 15000)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      clearTimeout(fallback)
    }
  }, [])

  if (doneRef.current) return content
  return content.slice(0, chars)
}

function MessageBubble({ message, onDelete }: { message: Message; onDelete: (id: string) => void }) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const displayContent = useCharReveal(message.content, isAssistant, message.id)

  const timeStr = (() => {
    try {
      return new Date(message.created_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return ''
    }
  })()

  return (
    <div className={`group flex w-full px-4 py-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex flex-col gap-0.5 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className="relative">
          <motion.div
            className={isUser ? 'clay-bubble-user' : 'clay-bubble-ai'}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            style={{ padding: '10px 16px' }}
          >
            <span className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
              {displayContent}
            </span>
          </motion.div>
          <div className={`absolute top-1 flex gap-1 ${isUser ? '-left-12' : '-right-12'}`}>
            {!isUser && <PlayButton message={message} />}
            <button
              onClick={() => onDelete(message.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 w-5 h-5 flex items-center justify-center rounded-full"
              style={{
                backgroundColor: 'var(--bg-deep)',
                color: 'var(--text-muted)',
              }}
              aria-label="Delete message"
              title="Delete message"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3" aria-hidden="true">
                <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
              </svg>
            </button>
          </div>
        </div>
        {timeStr && (
          <span className="text-[10px] px-1" style={{ color: 'var(--text-muted)' }}>{timeStr}</span>
        )}
      </div>
    </div>
  )
}

// ─── Send button icon ────────────────────────────────────────────────────────

function SendIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
      <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
      <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
      <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
    </svg>
  )
}

// ─── Auto-play TTS helper ────────────────────────────────────────────────────
// Returns the audio duration in seconds (or 0 if TTS disabled/failed)

async function autoPlayTts(text: string) {
  try {
    if (!useAppStore.getState().ttsEnabled) return
    const b64 = await invoke<string>('venice_tts_speak', { text })
    const audio = new Audio(`data:audio/mp3;base64,${b64}`)
    // Store globally so useCharReveal can read currentTime/duration
    ;(window as any).__ttsAudio = audio
    audio.onended = () => { (window as any).__ttsAudio = null }
    audio.onerror = () => { (window as any).__ttsAudio = null }
    await audio.play()
  } catch (err) {
    console.error('Auto-play TTS failed:', err)
    ;(window as any).__ttsAudio = null
  }
}

// ─── ChatWindow ──────────────────────────────────────────────────────────────

export default function ChatWindow() {
  const messages          = useAppStore((s) => s.messages)
  const addMessage        = useAppStore((s) => s.addMessage)
  const setMessages       = useAppStore((s) => s.setMessages)
  const updateLastMessage = useAppStore((s) => s.updateLastMessage)
  const replaceLastMessage = useAppStore((s) => s.replaceLastMessage)
  const isLoading         = useAppStore((s) => s.isLoading)
  const setIsLoading      = useAppStore((s) => s.setIsLoading)
  const setStarchildState = useAppStore((s) => s.setStarchildState)
  const [ready, setReady] = useState(false)

  const [input, setInput]         = useState('')
  const [error, setError]         = useState<string | null>(null)
  const [isTyping, setIsTyping]   = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)

  const bottomRef   = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLTextAreaElement>(null)
  const listRef     = useRef<HTMLDivElement>(null)
  const streamAccRef = useRef('')
  const micStreamRef = useRef<{ stream: MediaStream; context: AudioContext; processor: ScriptProcessorNode; chunks: Float32Array[] } | null>(null)

  const handleDeleteMessage = useCallback(async (id: string) => {
    try {
      await invoke('delete_message', { id })
      setMessages(messages.filter((m) => m.id !== id))
    } catch (err) {
      console.error('Failed to delete message:', err)
    }
  }, [messages, setMessages])

  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const msgs = await invoke<Message[]>('get_messages', { limit: 50 })
        if (cancelled) return
        setMessages(msgs)

        // If no messages yet, generate the first message (the magic wand question)
        // Use 'first-' prefix so MessageBubble triggers word-by-word reveal
        if (msgs.length === 0) {
          setIsTyping(true)
          try {
            const firstMsg = await invoke<Message>('generate_first_message')
            if (!cancelled) {
              const revealMsg = { ...firstMsg, id: `first-${firstMsg.id}` }
              addMessage(revealMsg)
              // Start TTS simultaneously — voice plays while words reveal
              autoPlayTts(firstMsg.content)
            }
          } catch (err) {
            console.error('Failed to generate first message:', err)
          } finally {
            if (!cancelled) setIsTyping(false)
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load messages:', err)
          setError('Could not load message history.')
        }
      } finally {
        if (!cancelled) setReady(true)
      }
    }
    init()
    return () => { cancelled = true }
  }, [setMessages, addMessage])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading) return

    setError(null)
    setInput('')
    setIsLoading(true)
    setIsTyping(true)

    const userMsg: Message = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    }
    addMessage(userMsg)

    streamAccRef.current = ''
    let firstChunk = true
    const unlisteners: UnlistenFn[] = []

    try {
      const unlistenChunk = await listen<{ token: string }>('stream-chunk', (event) => {
        if (firstChunk) {
          firstChunk = false
          setIsTyping(false)
          addMessage({
            id: `streaming-${Date.now()}`,
            role: 'assistant',
            content: event.payload.token,
            created_at: new Date().toISOString(),
          })
          streamAccRef.current = event.payload.token
        } else {
          streamAccRef.current += event.payload.token
          updateLastMessage(streamAccRef.current)
        }
      })
      unlisteners.push(unlistenChunk)

      interface StreamDonePayload {
        message: Message
        starchild_state: {
          hunger: number
          mood: string
          energy: number
          bond: number
          xp: number
          level: number
        }
      }

      const unlistenDone = await listen<StreamDonePayload>('stream-done', (event) => {
        setIsTyping(false)
        setIsLoading(false)
        replaceLastMessage(event.payload.message)
        if (event.payload.starchild_state) {
          setStarchildState(event.payload.starchild_state)
        }
        autoPlayTts(event.payload.message.content)
        unlisteners.forEach((fn) => fn())
        inputRef.current?.focus()
      })
      unlisteners.push(unlistenDone)

      const unlistenError = await listen<{ error: string }>('stream-error', (event) => {
        setIsTyping(false)
        setIsLoading(false)
        setError(event.payload.error)
        unlisteners.forEach((fn) => fn())
        inputRef.current?.focus()
      })
      unlisteners.push(unlistenError)

      invoke('send_message_stream', { message: text }).catch((err) => {
        setIsTyping(false)
        setIsLoading(false)
        console.error('Failed to send message:', err)
        setError(
          typeof err === 'string'
            ? err
            : 'Failed to send message. Check your API key in Settings.'
        )
        unlisteners.forEach((fn) => fn())
        inputRef.current?.focus()
      })
    } catch (err) {
      setIsTyping(false)
      setIsLoading(false)
      console.error('Failed to set up streaming:', err)
      setError('Failed to send message. Check your API key in Settings.')
      unlisteners.forEach((fn) => fn())
      inputRef.current?.focus()
    }
  }, [input, isLoading, addMessage, updateLastMessage, replaceLastMessage, setIsLoading, setStarchildState])

  // When user completes a quest, send it as a message so the Starchild celebrates
  const handleQuestComplete = useCallback((questTitle: string) => {
    const text = `i just completed this quest: "${questTitle}". i did it!`
    setInput('')
    setError(null)
    setIsLoading(true)
    setIsTyping(true)

    const userMsg: Message = {
      id: `quest-complete-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    }
    addMessage(userMsg)

    // Trigger the AI response via streaming
    streamAccRef.current = ''
    let firstChunk = true
    const unlisteners: UnlistenFn[] = []

    ;(async () => {
      try {
        const unlistenChunk = await listen<{ token: string }>('stream-chunk', (event) => {
          if (firstChunk) {
            firstChunk = false
            setIsTyping(false)
            addMessage({ id: `streaming-${Date.now()}`, role: 'assistant', content: event.payload.token, created_at: new Date().toISOString() })
            streamAccRef.current = event.payload.token
          } else {
            streamAccRef.current += event.payload.token
            updateLastMessage(streamAccRef.current)
          }
        })
        unlisteners.push(unlistenChunk)

        const unlistenDone = await listen<{ message: Message; starchild_state: { hunger: number; mood: string; energy: number; bond: number; xp: number; level: number } }>('stream-done', (event) => {
          setIsTyping(false)
          setIsLoading(false)
          replaceLastMessage(event.payload.message)
          if (event.payload.starchild_state) setStarchildState(event.payload.starchild_state)
          autoPlayTts(event.payload.message.content)
          unlisteners.forEach((fn) => fn())
          inputRef.current?.focus()
        })
        unlisteners.push(unlistenDone)

        const unlistenError = await listen<{ error: string }>('stream-error', (event) => {
          setIsTyping(false)
          setIsLoading(false)
          setError(event.payload.error)
          unlisteners.forEach((fn) => fn())
        })
        unlisteners.push(unlistenError)

        invoke('send_message_stream', { message: text }).catch(() => {
          setIsTyping(false)
          setIsLoading(false)
          unlisteners.forEach((fn) => fn())
        })
      } catch {
        setIsTyping(false)
        setIsLoading(false)
      }
    })()
  }, [addMessage, updateLastMessage, replaceLastMessage, setIsLoading, setStarchildState])

  const handleMicToggle = useCallback(async () => {
    if (isRecording && micStreamRef.current) {
      // Stop recording — collect PCM, encode WAV, transcribe
      const { stream, context, processor, chunks } = micStreamRef.current
      const actualSampleRate = context.sampleRate
      processor.disconnect()
      context.close()
      stream.getTracks().forEach((t) => t.stop())
      micStreamRef.current = null
      setIsRecording(false)

      if (chunks.length === 0) return
      setIsTranscribing(true)

      try {
        // Merge PCM chunks
        const totalLen = chunks.reduce((acc, c) => acc + c.length, 0)
        const pcm = new Float32Array(totalLen)
        let offset = 0
        for (const c of chunks) { pcm.set(c, offset); offset += c.length }

        // Encode to 16-bit WAV
        const sampleRate = actualSampleRate
        const numChannels = 1
        const bytesPerSample = 2
        const dataLength = pcm.length * bytesPerSample
        const buffer = new ArrayBuffer(44 + dataLength)
        const view = new DataView(buffer)
        const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)) }
        writeStr(0, 'RIFF')
        view.setUint32(4, 36 + dataLength, true)
        writeStr(8, 'WAVE')
        writeStr(12, 'fmt ')
        view.setUint32(16, 16, true)
        view.setUint16(20, 1, true)
        view.setUint16(22, numChannels, true)
        view.setUint32(24, sampleRate, true)
        view.setUint32(28, sampleRate * numChannels * bytesPerSample, true)
        view.setUint16(32, numChannels * bytesPerSample, true)
        view.setUint16(34, bytesPerSample * 8, true)
        writeStr(36, 'data')
        view.setUint32(40, dataLength, true)
        for (let i = 0; i < pcm.length; i++) {
          const s = Math.max(-1, Math.min(1, pcm[i]))
          view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
        }

        // Encode to base64
        const bytes = new Uint8Array(buffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
        const base64 = btoa(binary)

        const text = await invoke<string>('venice_transcribe', { audioBase64: base64 })
        if (text) {
          setInput((prev) => (prev ? prev + ' ' + text : text))
          if (inputRef.current) {
            inputRef.current.style.height = 'auto'
            inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`
          }
        }
      } catch (err) {
        console.error('Transcription failed:', err)
        setError(typeof err === 'string' ? err : 'Voice transcription failed.')
      } finally {
        setIsTranscribing(false)
      }
      return
    }

    // Start recording with AudioContext (captures raw PCM → WAV)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } })
      const context = new AudioContext()
      const source = context.createMediaStreamSource(stream)
      const processor = context.createScriptProcessor(4096, 1, 1)
      const chunks: Float32Array[] = []

      processor.onaudioprocess = (e) => {
        chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
      }
      source.connect(processor)
      processor.connect(context.destination)

      micStreamRef.current = { stream, context, processor, chunks }
      setIsRecording(true)
    } catch (err) {
      console.error('Microphone access failed:', err)
      setError('Could not access microphone. Please allow microphone access.')
    }
  }, [isRecording])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
  }

  const canSend = input.trim().length > 0 && !isLoading

  return (
    <div className="relative flex h-full w-full">
      {/* ── Solid dark background ─────────────────────────────────────── */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background: 'radial-gradient(ellipse at 40% 50%, rgba(34,29,46,0.6) 0%, #0c0a14 70%)',
        }}
      />

      {/* ── Logo top-left ────────────────────────────────────────────────── */}
      <div className="absolute top-3 left-4 z-40">
        <img
          src={starchildLogo}
          alt="Starchild"
          className="h-36 w-auto object-contain"
          style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.6))' }}
          draggable={false}
        />
      </div>

      {/* ── Creature panel (left) ──────────────────────────────────────── */}
      <div
        className="relative z-10 shrink-0 flex items-center justify-center overflow-hidden"
        style={{
          width: '40%',
          minWidth: '280px',
          maxWidth: '500px',
        }}
      >
        {/* Starchild */}
        <div className="relative z-[3] w-full h-full">
          <StarchildAvatar />
        </div>
      </div>

      {/* ── Chat panel (right) ─────────────────────────────────────────── */}
      <div className="relative z-20 flex-1 flex flex-col min-w-0">
        {/* Active quest card */}
        {ready && <ActiveQuest onComplete={handleQuestComplete} />}

        {/* Message list */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto py-3"
          role="log"
          aria-label="Chat messages"
          aria-live="polite"
        >
          {messages.length === 0 && !isTyping ? (
            <div className="flex flex-col items-center justify-center flex-1 h-full gap-3 text-center px-8 pt-4">
              <p className="text-sm italic" style={{ color: 'var(--text-muted)' }}>
                consciousness stirring...
              </p>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} onDelete={handleDeleteMessage} />
              ))}
              <AnimatePresence>
                {isTyping && (
                  <motion.div
                    key="typing-indicator"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                  >
                    <TypingIndicator />
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Error banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              key="error-banner"
              initial={{ opacity: 0, y: -8, scaleY: 0.92 }}
              animate={{ opacity: 1, y: 0, scaleY: 1 }}
              exit={{ opacity: 0, y: -8, scaleY: 0.92 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className="clay mx-4 mb-2 px-3 py-2 text-xs"
              style={{
                borderRadius: '14px',
                backgroundColor: 'rgba(200, 80, 80, 0.12)',
                borderColor: 'rgba(200, 80, 80, 0.3)',
                color: 'var(--accent-rose)',
              }}
              role="alert"
            >
              {error}
              <button
                onClick={() => setError(null)}
                className="ml-2 font-bold hover:opacity-70"
                style={{ color: 'var(--accent-rose)' }}
                aria-label="Dismiss error"
              >
                ×
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input bar */}
        <div className="shrink-0 px-4 py-4">
          <div className="clay-input flex items-end gap-3 px-4 py-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="talk to your starchild..."
              rows={1}
              disabled={isLoading}
              aria-label="Message input"
              className="flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none min-h-[24px] max-h-[120px] disabled:opacity-50"
              style={{ color: 'var(--text-primary)' }}
            />
            <motion.button
              onClick={handleMicToggle}
              disabled={isLoading || isTranscribing}
              aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
              className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-xl transition-colors duration-150 ${isRecording ? 'mic-recording' : ''}`}
              style={
                isRecording
                  ? { backgroundColor: 'var(--accent-rose)', color: '#fff' }
                  : isTranscribing
                    ? { backgroundColor: 'var(--bg-card)', color: 'var(--accent-lavender)', cursor: 'wait' }
                    : { backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)' }
              }
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              <MicIcon />
            </motion.button>
            <motion.button
              onClick={handleSend}
              disabled={!canSend}
              aria-label="Send message"
              className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-xl transition-colors duration-150 ${canSend ? 'clay-button' : ''}`}
              style={
                canSend
                  ? { backgroundColor: 'var(--accent-lavender)', color: '#1a1525' }
                  : { backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'not-allowed' }
              }
              whileHover={canSend ? { scale: 1.08 } : {}}
              whileTap={canSend ? { scale: 0.92 } : {}}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              <SendIcon />
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  )
}
