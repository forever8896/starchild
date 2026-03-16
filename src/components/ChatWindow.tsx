/**
 * ChatWindow.tsx — Horizontal layout: Starchild creature (left) + Chat (right)
 *
 * Full-screen skyline background behind everything.
 * Creature on the left, chat on the right. No sidebar.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useAppStore, type Message } from '../store'
import StarchildAvatar from './StarchildAvatar'
import SkylineBackground from './SkylineBackground'
import SparkTest from './SparkTest'
import ActiveQuest from './ActiveQuest'
import starchildLogo from '../assets/starchild-logo.png'

// ─── Typing indicator ────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 px-4 py-1" aria-label="Starchild is typing" aria-live="polite">
      <div
        className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl rounded-bl-sm backdrop-blur-md"
        style={{
          backgroundColor: 'rgba(48, 41, 69, 0.7)',
          border: '1px solid var(--outline)',
        }}
      >
        <span className="typing-dot w-2 h-2 rounded-full inline-block" style={{ backgroundColor: 'var(--accent-lavender)' }} />
        <span className="typing-dot w-2 h-2 rounded-full inline-block" style={{ backgroundColor: 'var(--accent-lavender)' }} />
        <span className="typing-dot w-2 h-2 rounded-full inline-block" style={{ backgroundColor: 'var(--accent-lavender)' }} />
      </div>
    </div>
  )
}

// ─── Single message bubble ───────────────────────────────────────────────────

function MessageBubble({ message, onDelete }: { message: Message; onDelete: (id: string) => void }) {
  const isUser = message.role === 'user'

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
    <div className={`group flex w-full px-4 py-1 animate-msg-in ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex flex-col gap-0.5 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className="relative">
          <div
            className="px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap break-words backdrop-blur-md"
            style={
              isUser
                ? {
                    backgroundColor: 'rgba(184, 160, 216, 0.85)',
                    color: '#1a1525',
                    borderRadius: '18px 18px 4px 18px',
                    border: '1px solid rgba(184, 160, 216, 0.5)',
                  }
                : {
                    backgroundColor: 'rgba(48, 41, 69, 0.75)',
                    color: 'var(--text-primary)',
                    borderRadius: '18px 18px 18px 4px',
                    border: '1px solid var(--outline)',
                  }
            }
          >
            {message.content}
          </div>
          <button
            onClick={() => onDelete(message.id)}
            className={[
              'absolute top-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150',
              'w-5 h-5 flex items-center justify-center rounded-full',
              isUser ? '-left-6' : '-right-6',
            ].join(' ')}
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
  const sparkTestComplete = useAppStore((s) => s.sparkTestComplete)
  const setSparkTestComplete = useAppStore((s) => s.setSparkTestComplete)
  const sparkTestChecked = useAppStore((s) => s.sparkTestChecked)
  const setSparkTestChecked = useAppStore((s) => s.setSparkTestChecked)

  const [input, setInput]         = useState('')
  const [error, setError]         = useState<string | null>(null)
  const [isTyping, setIsTyping]   = useState(false)

  const bottomRef   = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLTextAreaElement>(null)
  const listRef     = useRef<HTMLDivElement>(null)
  const streamAccRef = useRef('')

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
    async function check() {
      try {
        const value = await invoke<string | null>('get_setting', { key: 'spark_test_complete' })
        if (!cancelled) {
          setSparkTestComplete(value === 'true')
          setSparkTestChecked(true)
        }
      } catch {
        if (!cancelled) setSparkTestChecked(true)
      }
    }
    check()
    return () => { cancelled = true }
  }, [setSparkTestComplete, setSparkTestChecked])

  useEffect(() => {
    if (!sparkTestChecked) return
    let cancelled = false
    async function load() {
      try {
        const msgs = await invoke<Message[]>('get_messages', { limit: 50 })
        if (!cancelled) setMessages(msgs)
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load messages:', err)
          setError('Could not load message history.')
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [sparkTestChecked, setMessages])

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

  return (
    <div className="relative flex h-full w-full">
      {/* ── Full-screen skyline background (behind everything) ─────────── */}
      <SkylineBackground />

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
          width: '35%',
          minWidth: '240px',
          maxWidth: '400px',
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
        {sparkTestComplete && <ActiveQuest onComplete={handleQuestComplete} />}

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
              {!sparkTestChecked ? (
                <div
                  className="w-5 h-5 rounded-full animate-spin"
                  style={{ border: '2px solid var(--outline)', borderTopColor: 'var(--accent-lavender)' }}
                />
              ) : (
                <p className="text-sm italic" style={{ color: 'var(--text-muted)' }}>
                  consciousness stirring...
                </p>
              )}
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} onDelete={handleDeleteMessage} />
              ))}
              {isTyping && <TypingIndicator />}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Error banner */}
        {error && (
          <div
            className="mx-4 mb-2 px-3 py-2 rounded-xl text-xs"
            style={{
              backgroundColor: 'rgba(200, 80, 80, 0.15)',
              border: '1px solid rgba(200, 80, 80, 0.3)',
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
          </div>
        )}

        {/* Spark Test choices (during first-run) */}
        {sparkTestChecked && !sparkTestComplete && <SparkTest />}

        {/* Input bar */}
        <div
          className="shrink-0 px-4 py-3"
          style={{ display: sparkTestComplete ? undefined : 'none' }}
        >
          <div
            className="flex items-end gap-2 px-4 py-2.5 rounded-2xl transition-all duration-200 backdrop-blur-md"
            style={{
              backgroundColor: 'rgba(42, 36, 56, 0.8)',
              border: '1px solid var(--outline)',
            }}
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
              className="flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none min-h-[24px] max-h-[120px] disabled:opacity-50"
              style={{ color: 'var(--text-primary)' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              aria-label="Send message"
              className="shrink-0 flex items-center justify-center w-8 h-8 rounded-xl transition-all duration-150 press-scale"
              style={
                input.trim() && !isLoading
                  ? { backgroundColor: 'var(--accent-lavender)', color: '#1a1525' }
                  : { backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'not-allowed' }
              }
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
