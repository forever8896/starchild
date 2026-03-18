/**
 * Settings.tsx — App settings panel
 *
 * Usage:
 *   <Settings />
 *
 * - Loads Venice API key status on mount via invoke('get_setting', { key: 'venice_api_key' })
 * - Saves key via invoke('save_settings', { key: 'venice_api_key', value: apiKey })
 * - Password input with show/hide toggle
 * - Telegram / WhatsApp section (placeholder for future phases)
 */

import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../store'
import {
  hasWallet,
  createWallet,
  getIdentityInfo,
  registerIdentity,
  checkRegistrationStatus,
  type RegistrationStatus,
} from '../chain'

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2
        className="text-xs font-semibold uppercase tracking-widest"
        style={{ color: 'var(--text-muted)' }}
      >
        {title}
      </h2>
      <div
        className="flex flex-col gap-4 p-4"
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1.5px solid var(--outline)',
          borderRadius: '16px',
        }}
      >
        {children}
      </div>
    </section>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ set }: { set: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={
        set
          ? {
              backgroundColor: 'rgba(168, 216, 184, 0.15)',
              color: 'var(--accent-mint)',
              border: '1px solid rgba(168, 216, 184, 0.3)',
            }
          : {
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-muted)',
              border: '1px solid var(--outline)',
            }
      }
      aria-label={set ? 'API key is set' : 'API key is not set'}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: set ? 'var(--accent-mint)' : 'var(--text-muted)' }}
        aria-hidden="true"
      />
      {set ? 'Connected' : 'Not set'}
    </span>
  )
}

// ─── Eye / eye-off icons ──────────────────────────────────────────────────────

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      className="w-4 h-4" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      className="w-4 h-4" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

// ─── Registration status badge ───────────────────────────────────────────────

// Inline style objects per status — avoids dynamic className strings
const STATUS_BADGE_STYLE: Record<RegistrationStatus, React.CSSProperties> = {
  none: {
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-muted)',
    border: '1px solid var(--outline)',
  },
  pending: {
    backgroundColor: 'rgba(232, 216, 168, 0.12)',
    color: 'var(--accent-gold)',
    border: '1px solid rgba(232, 216, 168, 0.3)',
  },
  confirmed: {
    backgroundColor: 'rgba(168, 200, 232, 0.12)',
    color: 'var(--accent-sky)',
    border: '1px solid rgba(168, 200, 232, 0.3)',
  },
  registered: {
    backgroundColor: 'rgba(168, 216, 184, 0.15)',
    color: 'var(--accent-mint)',
    border: '1px solid rgba(168, 216, 184, 0.3)',
  },
  error: {
    backgroundColor: 'rgba(232, 168, 184, 0.12)',
    color: 'var(--accent-rose)',
    border: '1px solid rgba(232, 168, 184, 0.3)',
  },
}

const STATUS_DOT_COLOR: Record<RegistrationStatus, string> = {
  none:       'var(--text-muted)',
  pending:    'var(--accent-gold)',
  confirmed:  'var(--accent-sky)',
  registered: 'var(--accent-mint)',
  error:      'var(--accent-rose)',
}

const STATUS_LABELS: Record<RegistrationStatus, string> = {
  none:       'Not registered',
  pending:    'Pending...',
  confirmed:  'Confirmed',
  registered: 'Registered',
  error:      'Error',
}

function RegistrationBadge({ status }: { status: RegistrationStatus }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={STATUS_BADGE_STYLE[status]}
      aria-label={`Registration status: ${STATUS_LABELS[status]}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full${status === 'pending' ? ' animate-pulse' : ''}`}
        style={{ backgroundColor: STATUS_DOT_COLOR[status] }}
        aria-hidden="true"
      />
      {STATUS_LABELS[status]}
    </span>
  )
}

// ─── Shared style helpers ─────────────────────────────────────────────────────

/** A subtle info row (wallet address, agent ID, tx hash, etc.) */
const infoRowStyle: React.CSSProperties = {
  backgroundColor: 'rgba(42, 36, 56, 0.6)',
  borderRadius: '8px',
  padding: '8px 12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

/** Disabled button state */
const disabledBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-secondary)',
  color: 'var(--text-muted)',
  cursor: 'not-allowed',
}

/** Primary (lavender) enabled button */
const primaryBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--accent-lavender)',
  color: 'var(--bg-deep)',
}

/** Sky-blue enabled button */
const skyBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--accent-sky)',
  color: 'var(--bg-deep)',
}

/** Mint (green) enabled button */
const mintBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--accent-mint)',
  color: 'var(--bg-deep)',
}

/** Rose (red/danger) enabled button */
const roseBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--accent-rose)',
  color: 'var(--bg-deep)',
}

/** Secondary/neutral button */
const secondaryBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-card)',
  color: 'var(--text-secondary)',
}

/** Shared base class string for full-width action buttons */
const actionBtnClass = 'w-full py-2 rounded-lg text-sm font-medium transition-all duration-150'

/** Input wrapper — border changes on focus-within via inline style + CSS class trick */
const inputWrapperStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  backgroundColor: 'var(--bg-input)',
  border: '1.5px solid var(--outline)',
  borderRadius: '8px',
  padding: '8px 12px',
}

// ─── Voice section ──────────────────────────────────────────────────────────

const VOICE_OPTIONS = [
  { id: 'af_heart', label: 'Heart', desc: 'Warm female (default)' },
  { id: 'af_nova', label: 'Nova', desc: 'Bright female' },
  { id: 'af_bella', label: 'Bella', desc: 'Soft female' },
  { id: 'af_sky', label: 'Sky', desc: 'Clear female' },
  { id: 'am_adam', label: 'Adam', desc: 'Warm male' },
  { id: 'am_echo', label: 'Echo', desc: 'Deep male' },
  { id: 'am_michael', label: 'Michael', desc: 'Steady male' },
  { id: 'bf_emma', label: 'Emma', desc: 'British female' },
  { id: 'bm_george', label: 'George', desc: 'British male' },
] as const

function VoiceSection() {
  const ttsEnabled = useAppStore((s) => s.ttsEnabled)
  const setTtsEnabled = useAppStore((s) => s.setTtsEnabled)
  const ttsVoice = useAppStore((s) => s.ttsVoice)
  const setTtsVoice = useAppStore((s) => s.setTtsVoice)
  const [testPlaying, setTestPlaying] = useState(false)

  async function handleTest() {
    if (testPlaying) return
    setTestPlaying(true)
    try {
      const b64 = await invoke<string>('venice_tts_speak', {
        text: 'Hello, I am your Starchild. Together we will find your spark.',
      })
      const audio = new Audio(`data:audio/mp3;base64,${b64}`)
      audio.onended = () => setTestPlaying(false)
      audio.onerror = () => setTestPlaying(false)
      await audio.play()
    } catch (err) {
      console.error('TTS test failed:', err)
      setTestPlaying(false)
    }
  }

  async function handleVoiceChange(voice: string) {
    setTtsVoice(voice)
    try {
      await invoke('venice_tts_set_voice', { voice })
    } catch (err) {
      console.error('Failed to set voice:', err)
    }
  }

  return (
    <Section title="Voice">
      <div className="flex flex-col gap-3">
        {/* Auto-speak toggle */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Auto-speak replies
            </span>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Starchild speaks each reply aloud via Venice AI
            </p>
          </div>
          <button
            onClick={() => setTtsEnabled(!ttsEnabled)}
            className="relative w-10 h-5 rounded-full transition-colors duration-200"
            style={{ backgroundColor: ttsEnabled ? 'var(--accent-lavender)' : 'rgba(255,255,255,0.1)' }}
            role="switch"
            aria-checked={ttsEnabled}
          >
            <span
              className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform duration-200"
              style={{
                backgroundColor: '#fff',
                transform: ttsEnabled ? 'translateX(20px)' : 'translateX(0)',
              }}
            />
          </button>
        </div>

        {/* Voice picker */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Voice
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {VOICE_OPTIONS.map((v) => (
              <button
                key={v.id}
                onClick={() => handleVoiceChange(v.id)}
                className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg text-[11px] transition-colors duration-150"
                style={{
                  backgroundColor: ttsVoice === v.id ? 'rgba(184, 160, 216, 0.2)' : 'transparent',
                  border: ttsVoice === v.id ? '1px solid var(--accent-lavender)' : '1px solid var(--outline)',
                  color: ttsVoice === v.id ? 'var(--accent-lavender)' : 'var(--text-secondary)',
                }}
              >
                <span className="font-medium">{v.label}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '9px' }}>{v.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Test button */}
        <button
          onClick={handleTest}
          disabled={testPlaying}
          className="text-xs px-3 py-1.5 rounded-lg transition-colors duration-150 self-start"
          style={{
            backgroundColor: testPlaying ? 'rgba(184, 160, 216, 0.1)' : 'rgba(184, 160, 216, 0.15)',
            color: 'var(--accent-lavender)',
            border: '1px solid rgba(184, 160, 216, 0.3)',
          }}
        >
          {testPlaying ? 'Playing...' : 'Test voice'}
        </button>
      </div>
    </Section>
  )
}

// ─── Identity section ────────────────────────────────────────────────────────

function IdentitySection() {
  const identityInfo    = useAppStore((s) => s.identityInfo)
  const setIdentityInfo = useAppStore((s) => s.setIdentityInfo)

  const [isLoading, setIsLoading]         = useState(true)
  const [isRegistering, setIsRegistering] = useState(false)
  const [isGenerating, setIsGenerating]   = useState(false)
  const [walletExists, setWalletExists]   = useState(false)
  const [regError, setRegError]           = useState<string | null>(null)

  // Load identity info on mount
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const walletOk = await hasWallet()
        if (!cancelled) setWalletExists(walletOk)

        const info = await getIdentityInfo()
        if (!cancelled) setIdentityInfo(info)

        // If pending, check for confirmation
        if (info.status === 'pending') {
          const updated = await checkRegistrationStatus()
          if (!cancelled) setIdentityInfo(updated)
        }
      } catch (err) {
        console.error('Failed to load identity info:', err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [setIdentityInfo])

  // Generate wallet
  async function handleGenerateWallet() {
    setIsGenerating(true)
    setRegError(null)
    try {
      const address = await createWallet()
      setWalletExists(true)
      setIdentityInfo({
        status: 'none',
        agentId: null,
        walletAddress: address,
        txHash: null,
      })
    } catch (err) {
      setRegError(err instanceof Error ? err.message : 'Failed to generate wallet')
    } finally {
      setIsGenerating(false)
    }
  }

  // Register identity
  async function handleRegister() {
    setIsRegistering(true)
    setRegError(null)
    try {
      const result = await registerIdentity('Starchild')
      setIdentityInfo(result)
      if (result.error) {
        setRegError(result.error)
      }
    } catch (err) {
      setRegError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setIsRegistering(false)
    }
  }

  const status      = identityInfo?.status ?? 'none'
  const canRegister = walletExists && (status === 'none' || status === 'error')
  const isRegistered = status === 'registered'

  function shortenAddress(addr: string): string {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  return (
    <Section title="On-Chain Identity (ERC-8004)">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Base Mainnet
          </p>
          <RegistrationBadge status={status} />
        </div>

        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Register your Starchild as an autonomous agent on Base using the ERC-8004 standard.
          This gives your companion a verifiable on-chain identity.
        </p>

        {isLoading ? (
          <div
            className="flex items-center gap-2 text-xs animate-pulse"
            style={{ color: 'var(--text-muted)' }}
          >
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--outline)' }} />
            Loading identity status...
          </div>
        ) : (
          <>
            {/* Wallet info */}
            {identityInfo?.walletAddress && (
              <div style={infoRowStyle}>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Wallet</span>
                <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                  {shortenAddress(identityInfo.walletAddress)}
                </span>
              </div>
            )}

            {/* Agent ID */}
            {identityInfo?.agentId && (
              <div style={infoRowStyle}>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Agent ID</span>
                <span className="text-xs font-mono" style={{ color: 'var(--accent-lavender)' }}>
                  #{identityInfo.agentId}
                </span>
              </div>
            )}

            {/* Tx hash */}
            {identityInfo?.txHash && (
              <div style={infoRowStyle}>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Tx</span>
                <span className="text-xs font-mono" style={{ color: 'var(--accent-sky)' }}>
                  {shortenAddress(identityInfo.txHash)}
                </span>
              </div>
            )}

            {/* Generate wallet button */}
            {!walletExists && (
              <button
                onClick={handleGenerateWallet}
                disabled={isGenerating}
                className={actionBtnClass}
                style={isGenerating ? disabledBtnStyle : skyBtnStyle}
              >
                {isGenerating ? 'Generating...' : 'Generate Wallet'}
              </button>
            )}

            {/* Register button */}
            {canRegister && (
              <button
                onClick={handleRegister}
                disabled={isRegistering}
                className={actionBtnClass}
                style={isRegistering ? disabledBtnStyle : primaryBtnStyle}
              >
                {isRegistering ? 'Registering on Base...' : 'Register ERC-8004 Identity'}
              </button>
            )}

            {/* Registered success */}
            {isRegistered && (
              <p className="text-xs text-center" style={{ color: 'var(--accent-mint)' }} role="status">
                Your Starchild has an on-chain identity on Base Mainnet.
              </p>
            )}

            {/* Pending info */}
            {status === 'pending' && (
              <p className="text-xs text-center" style={{ color: 'var(--accent-gold)' }}>
                Transaction submitted. Waiting for confirmation...
              </p>
            )}

            {/* Error */}
            {regError && (
              <p className="text-xs text-center" style={{ color: 'var(--accent-rose)' }} role="alert">
                {regError}
              </p>
            )}

            {/* ETH needed notice */}
            {walletExists && !isRegistered && !regError && status !== 'pending' && (
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Registration requires a small amount of ETH on Base for gas.
                Send ETH to your wallet address above.
              </p>
            )}
          </>
        )}
      </div>
    </Section>
  )
}

// ─── Connector status badge (Telegram / WhatsApp) ────────────────────────────

type ConnectorStatus = 'connected' | 'starting' | 'waiting_for_qr' | 'error' | 'stopped' | string

function connectorBadgeStyle(status: ConnectorStatus): React.CSSProperties {
  if (status === 'connected') {
    return {
      backgroundColor: 'rgba(168, 216, 184, 0.15)',
      color: 'var(--accent-mint)',
      border: '1px solid rgba(168, 216, 184, 0.3)',
    }
  }
  if (status === 'starting' || status === 'waiting_for_qr') {
    return {
      backgroundColor: 'rgba(232, 216, 168, 0.12)',
      color: 'var(--accent-gold)',
      border: '1px solid rgba(232, 216, 168, 0.3)',
    }
  }
  if (status === 'error') {
    return {
      backgroundColor: 'rgba(232, 168, 184, 0.12)',
      color: 'var(--accent-rose)',
      border: '1px solid rgba(232, 168, 184, 0.3)',
    }
  }
  return {
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-muted)',
    border: '1px solid var(--outline)',
  }
}

function connectorDotColor(status: ConnectorStatus): string {
  if (status === 'connected')  return 'var(--accent-mint)'
  if (status === 'starting' || status === 'waiting_for_qr') return 'var(--accent-gold)'
  if (status === 'error')      return 'var(--accent-rose)'
  return 'var(--text-muted)'
}

// ─── Telegram section ────────────────────────────────────────────────────────

function TelegramSection() {
  const telegramStatus      = useAppStore((s) => s.telegramStatus)
  const telegramBotUsername = useAppStore((s) => s.telegramBotUsername)
  const setTelegramStatus      = useAppStore((s) => s.setTelegramStatus)
  const setTelegramBotUsername = useAppStore((s) => s.setTelegramBotUsername)

  const [botToken, setBotToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check status on mount
  useEffect(() => {
    let cancelled = false

    async function checkStatus() {
      try {
        const result = await invoke<{ status: string; bot_username: string | null }>('get_telegram_status')
        if (cancelled) return
        if (result.status === 'connected') {
          setTelegramStatus('connected')
          setTelegramBotUsername(result.bot_username)
        } else if (result.status.startsWith('error:')) {
          setTelegramStatus('error')
          setError(result.status.replace('error: ', ''))
        } else if (result.status === 'starting') {
          setTelegramStatus('starting')
        }
      } catch {
        // Bot commands not available yet — that's fine
      }
    }

    checkStatus()
    return () => { cancelled = true }
  }, [setTelegramStatus, setTelegramBotUsername])

  // Load saved token
  useEffect(() => {
    let cancelled = false
    async function loadToken() {
      try {
        const token = await invoke<string | null>('get_setting', { key: 'telegram_bot_token' })
        if (!cancelled && token) setBotToken(token)
      } catch {
        // ignore
      }
    }
    loadToken()
    return () => { cancelled = true }
  }, [])

  async function handleStart() {
    if (!botToken.trim()) return
    setIsStarting(true)
    setError(null)
    setTelegramStatus('starting')

    try {
      const result = await invoke<{ status: string; bot_username: string | null }>('start_telegram_bot', {
        token: botToken.trim(),
      })
      if (result.status === 'connected') {
        setTelegramStatus('connected')
        setTelegramBotUsername(result.bot_username)
      } else if (result.status === 'starting') {
        setTelegramStatus('starting')
      }
    } catch (err) {
      setTelegramStatus('error')
      setError(typeof err === 'string' ? err : 'Failed to start Telegram bot')
    } finally {
      setIsStarting(false)
    }
  }

  async function handleStop() {
    setIsStopping(true)
    try {
      await invoke('stop_telegram_bot')
      setTelegramStatus('stopped')
      setTelegramBotUsername(null)
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Failed to stop bot')
    } finally {
      setIsStopping(false)
    }
  }

  const isConnected = telegramStatus === 'connected'
  const isRunning   = telegramStatus === 'connected' || telegramStatus === 'starting'
  const dotPulse    = telegramStatus === 'starting'

  return (
    <Section title="Telegram">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden="true">✈️</span>
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Bot Connector
            </p>
          </div>
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
            style={connectorBadgeStyle(telegramStatus ?? 'stopped')}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full${dotPulse ? ' animate-pulse' : ''}`}
              style={{ backgroundColor: connectorDotColor(telegramStatus ?? 'stopped') }}
              aria-hidden="true"
            />
            {isConnected ? 'Connected' :
             telegramStatus === 'starting' ? 'Starting...' :
             telegramStatus === 'error' ? 'Error' : 'Stopped'}
          </span>
        </div>

        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Connect a Telegram bot so you can chat with Starchild from your phone.
          Create a bot via{' '}
          <span style={{ color: 'var(--accent-sky)' }}>@BotFather</span> on Telegram.
        </p>

        {isConnected && telegramBotUsername && (
          <div style={infoRowStyle}>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Bot</span>
            <span className="text-xs font-mono" style={{ color: 'var(--accent-sky)' }}>
              @{telegramBotUsername}
            </span>
          </div>
        )}

        {/* Token input — hidden when connected */}
        {!isConnected && (
          <div style={inputWrapperStyle}>
            <input
              type={showToken ? 'text' : 'password'}
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleStart() }}
              placeholder="Paste your Telegram bot token…"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--text-primary)' }}
              aria-label="Telegram bot token"
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="transition-colors duration-150"
              style={{ color: 'var(--text-muted)' }}
              aria-label={showToken ? 'Hide token' : 'Show token'}
            >
              {showToken ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        )}

        {/* Start / Stop button */}
        {isRunning ? (
          <button
            onClick={handleStop}
            disabled={isStopping}
            className={actionBtnClass}
            style={isStopping ? disabledBtnStyle : roseBtnStyle}
          >
            {isStopping ? 'Stopping...' : 'Stop Bot'}
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={!botToken.trim() || isStarting}
            className={actionBtnClass}
            style={botToken.trim() && !isStarting ? skyBtnStyle : disabledBtnStyle}
          >
            {isStarting ? 'Starting...' : 'Start Bot'}
          </button>
        )}

        {error && (
          <p className="text-xs text-center" style={{ color: 'var(--accent-rose)' }} role="alert">
            {error}
          </p>
        )}
      </div>
    </Section>
  )
}

// ─── WhatsApp section ────────────────────────────────────────────────────────

function WhatsAppSection() {
  const whatsappStatus  = useAppStore((s) => s.whatsappStatus)
  const whatsappPhone   = useAppStore((s) => s.whatsappPhone)
  const whatsappQrCode  = useAppStore((s) => s.whatsappQrCode)
  const setWhatsappStatus  = useAppStore((s) => s.setWhatsappStatus)
  const setWhatsappPhone   = useAppStore((s) => s.setWhatsappPhone)
  const setWhatsappQrCode  = useAppStore((s) => s.setWhatsappQrCode)

  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check status on mount
  useEffect(() => {
    let cancelled = false

    async function checkStatus() {
      try {
        const result = await invoke<{ status: string; phone: string | null; qr_code: string | null }>('get_whatsapp_status')
        if (cancelled) return
        if (result.status === 'connected') {
          setWhatsappStatus('connected')
          setWhatsappPhone(result.phone)
          setWhatsappQrCode(null)
        } else if (result.status === 'waiting_for_qr') {
          setWhatsappStatus('waiting_for_qr')
          setWhatsappQrCode(result.qr_code)
        } else if (result.status.startsWith('error:')) {
          setWhatsappStatus('error')
          setError(result.status.replace('error: ', ''))
        }
      } catch {
        // Bot commands not available yet — that's fine
      }
    }

    checkStatus()
    return () => { cancelled = true }
  }, [setWhatsappStatus, setWhatsappPhone, setWhatsappQrCode])

  // Poll for QR code updates when waiting
  useEffect(() => {
    if (whatsappStatus !== 'waiting_for_qr') return

    const interval = setInterval(async () => {
      try {
        const result = await invoke<{ status: string; phone: string | null; qr_code: string | null }>('get_whatsapp_status')
        if (result.status === 'connected') {
          setWhatsappStatus('connected')
          setWhatsappPhone(result.phone)
          setWhatsappQrCode(null)
        } else if (result.status === 'waiting_for_qr' && result.qr_code) {
          setWhatsappQrCode(result.qr_code)
        }
      } catch {
        // ignore
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [whatsappStatus, setWhatsappStatus, setWhatsappPhone, setWhatsappQrCode])

  async function handleStart() {
    setIsStarting(true)
    setError(null)
    setWhatsappStatus('waiting_for_qr')

    try {
      const result = await invoke<{ status: string; phone: string | null; qr_code: string | null }>('start_whatsapp_bot')
      if (result.status === 'connected') {
        setWhatsappStatus('connected')
        setWhatsappPhone(result.phone)
        setWhatsappQrCode(null)
      } else if (result.status === 'waiting_for_qr') {
        setWhatsappStatus('waiting_for_qr')
        setWhatsappQrCode(result.qr_code)
      }
    } catch (err) {
      setWhatsappStatus('error')
      setError(typeof err === 'string' ? err : 'Failed to start WhatsApp connector')
    } finally {
      setIsStarting(false)
    }
  }

  async function handleStop() {
    setIsStopping(true)
    try {
      await invoke('stop_whatsapp_bot')
      setWhatsappStatus('stopped')
      setWhatsappPhone(null)
      setWhatsappQrCode(null)
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Failed to stop WhatsApp')
    } finally {
      setIsStopping(false)
    }
  }

  const isConnected  = whatsappStatus === 'connected'
  const isRunning    = whatsappStatus === 'connected' || whatsappStatus === 'waiting_for_qr'
  const dotPulse     = whatsappStatus === 'waiting_for_qr'

  return (
    <Section title="WhatsApp">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden="true">💬</span>
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              WhatsApp Connector
            </p>
          </div>
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
            style={connectorBadgeStyle(whatsappStatus ?? 'stopped')}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full${dotPulse ? ' animate-pulse' : ''}`}
              style={{ backgroundColor: connectorDotColor(whatsappStatus ?? 'stopped') }}
              aria-hidden="true"
            />
            {isConnected ? 'Connected' :
             whatsappStatus === 'waiting_for_qr' ? 'Scan QR...' :
             whatsappStatus === 'error' ? 'Error' : 'Stopped'}
          </span>
        </div>

        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Connect WhatsApp to chat with Starchild from your phone.
          Scan the QR code with WhatsApp to pair.
        </p>

        {isConnected && whatsappPhone && (
          <div style={infoRowStyle}>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Phone</span>
            <span className="text-xs font-mono" style={{ color: 'var(--accent-mint)' }}>
              {whatsappPhone}
            </span>
          </div>
        )}

        {/* QR Code display */}
        {whatsappStatus === 'waiting_for_qr' && whatsappQrCode && (
          <div className="flex flex-col items-center gap-2 py-3">
            <div className="bg-white p-3 rounded-lg">
              <pre className="text-[4px] leading-[4px] text-black font-mono select-all whitespace-pre">
                {whatsappQrCode}
              </pre>
            </div>
            <p className="text-xs text-center" style={{ color: 'var(--accent-gold)' }}>
              Open WhatsApp → Settings → Linked Devices → Scan this QR code
            </p>
          </div>
        )}

        {whatsappStatus === 'waiting_for_qr' && !whatsappQrCode && (
          <div
            className="flex items-center gap-2 text-xs animate-pulse py-2"
            style={{ color: 'var(--accent-gold)' }}
          >
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'rgba(232, 216, 168, 0.4)' }} />
            Generating QR code...
          </div>
        )}

        {/* Start / Stop button */}
        {isRunning ? (
          <button
            onClick={handleStop}
            disabled={isStopping}
            className={actionBtnClass}
            style={isStopping ? disabledBtnStyle : roseBtnStyle}
          >
            {isStopping ? 'Stopping...' : 'Disconnect'}
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={isStarting}
            className={actionBtnClass}
            style={!isStarting ? mintBtnStyle : disabledBtnStyle}
          >
            {isStarting ? 'Starting...' : 'Connect WhatsApp'}
          </button>
        )}

        {error && (
          <p className="text-xs text-center" style={{ color: 'var(--accent-rose)' }} role="alert">
            {error}
          </p>
        )}
      </div>
    </Section>
  )
}

// ─── Your Data section ──────────────────────────────────────────────────────

function YourDataSection() {
  const [isExporting, setIsExporting] = useState(false)
  const [isClearing, setIsClearing]   = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [exportSuccess, setExportSuccess] = useState(false)
  const [clearSuccess, setClearSuccess]   = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setApiKeySet        = useAppStore((s) => s.setApiKeySet)
  const setStarchildState   = useAppStore((s) => s.setStarchildState)
  const setMessages         = useAppStore((s) => s.setMessages)
  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete)

  async function handleExport() {
    setIsExporting(true)
    setError(null)
    try {
      const data = await invoke<Record<string, unknown>>('export_all_data')
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `starchild-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setExportSuccess(true)
      setTimeout(() => setExportSuccess(false), 3000)
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Failed to export data')
    } finally {
      setIsExporting(false)
    }
  }

  async function handleClear() {
    setIsClearing(true)
    setError(null)
    try {
      await invoke('clear_all_data')
      // Reset frontend state
      setMessages([])
      setApiKeySet(false)
      setStarchildState({
        hunger: 50,
        mood: 'Content',
        energy: 100,
        bond: 0,
        xp: 0,
        level: 1,
      })
      setShowConfirm(false)
      setOnboardingComplete(false)
      setClearSuccess(true)
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Failed to clear data')
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <Section title="Your Data">
      <div className="flex flex-col gap-3">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          All your data is stored locally on this device. You can export
          everything as JSON or clear all data to start fresh.
        </p>

        {/* Export */}
        <button
          onClick={handleExport}
          disabled={isExporting}
          className={actionBtnClass}
          style={isExporting ? disabledBtnStyle : skyBtnStyle}
        >
          {isExporting ? 'Exporting...' : 'Export All Data (JSON)'}
        </button>

        {exportSuccess && (
          <p className="text-xs text-center" style={{ color: 'var(--accent-mint)' }} role="status">
            Data exported successfully.
          </p>
        )}

        {/* Clear all data */}
        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            className={`${actionBtnClass}`}
            style={{
              backgroundColor: 'var(--bg-card)',
              color: 'var(--accent-rose)',
              border: '1px solid rgba(232, 168, 184, 0.3)',
            }}
          >
            Clear All Data
          </button>
        ) : (
          <div
            className="flex flex-col gap-2 p-3 rounded-lg"
            style={{
              backgroundColor: 'rgba(232, 168, 184, 0.07)',
              border: '1px solid rgba(232, 168, 184, 0.25)',
            }}
          >
            <p className="text-xs text-center font-medium" style={{ color: 'var(--accent-rose)' }}>
              This will permanently delete all conversations, memories, quests,
              and settings. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-150"
                style={secondaryBtnStyle}
              >
                Cancel
              </button>
              <button
                onClick={handleClear}
                disabled={isClearing}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-150"
                style={isClearing ? disabledBtnStyle : roseBtnStyle}
              >
                {isClearing ? 'Clearing...' : 'Yes, Delete Everything'}
              </button>
            </div>
          </div>
        )}

        {clearSuccess && (
          <p className="text-xs text-center" style={{ color: 'var(--accent-mint)' }} role="status">
            All data cleared. Starchild has been reset to a fresh start.
          </p>
        )}

        {error && (
          <p className="text-xs text-center" style={{ color: 'var(--accent-rose)' }} role="alert">
            {error}
          </p>
        )}
      </div>
    </Section>
  )
}

// ─── Notifications section ──────────────────────────────────────────────────

function NotificationsSection() {
  const [reminderHour, setReminderHour] = useState<number>(9)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const val = await invoke<string | null>('get_setting', { key: 'checkin_reminder_hour' })
        if (!cancelled && val) setReminderHour(parseInt(val, 10))
      } catch {
        // default 9
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function handleSave() {
    setIsSaving(true)
    try {
      await invoke('save_settings', {
        key: 'checkin_reminder_hour',
        value: String(reminderHour),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      // ignore
    } finally {
      setIsSaving(false)
    }
  }

  async function handleTestNotification() {
    try {
      await invoke('send_checkin_notification')
    } catch (err) {
      console.error('Notification test failed:', err)
    }
  }

  const hours = Array.from({ length: 24 }, (_, i) => i)
  function formatHour(h: number) {
    if (h === 0)  return '12:00 AM'
    if (h < 12)   return `${h}:00 AM`
    if (h === 12) return '12:00 PM'
    return `${h - 12}:00 PM`
  }

  return (
    <Section title="Notifications">
      <div className="flex flex-col gap-3">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Starchild will send you desktop notifications for daily check-ins
          and when a quest streak is about to break (due within 2 hours).
        </p>

        <div className="flex items-center justify-between">
          <label
            htmlFor="reminder-hour"
            className="text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            Daily check-in time
          </label>
          <select
            id="reminder-hour"
            value={reminderHour}
            onChange={(e) => setReminderHour(parseInt(e.target.value, 10))}
            className="rounded-lg px-3 py-1.5 text-sm outline-none"
            style={{
              backgroundColor: 'var(--bg-input)',
              border: '1.5px solid var(--outline)',
              color: 'var(--text-primary)',
            }}
          >
            {hours.map((h) => (
              <option key={h} value={h}>{formatHour(h)}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className={actionBtnClass}
          style={!isSaving ? primaryBtnStyle : disabledBtnStyle}
        >
          {isSaving ? 'Saving...' : 'Save Notification Time'}
        </button>

        {saved && (
          <p className="text-xs text-center" style={{ color: 'var(--accent-mint)' }} role="status">
            Notification time saved.
          </p>
        )}

        <button
          onClick={handleTestNotification}
          className={actionBtnClass}
          style={{
            ...secondaryBtnStyle,
            border: '1px solid var(--outline)',
          }}
        >
          Test Notification
        </button>
      </div>
    </Section>
  )
}

// ─── Settings component ───────────────────────────────────────────────────────

export default function Settings() {
  const apiKeySet    = useAppStore((s) => s.apiKeySet)
  const setApiKeySet = useAppStore((s) => s.setApiKeySet)

  const [apiKey, setApiKey]           = useState('')
  const [showKey, setShowKey]         = useState(false)
  const [isSaving, setIsSaving]       = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError]     = useState<string | null>(null)

  // ── Check if key exists on mount ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function checkKey() {
      try {
        const value = await invoke<string | null>('get_setting', { key: 'venice_api_key' })
        if (!cancelled) {
          setApiKeySet(!!value && value.length > 0)
        }
      } catch (err) {
        console.error('Failed to check API key:', err)
      }
    }

    checkKey()
    return () => { cancelled = true }
  }, [setApiKeySet])

  // ── Save key ──────────────────────────────────────────────────────────
  async function handleSave() {
    if (!apiKey.trim()) return

    setIsSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      await invoke('save_settings', { key: 'venice_api_key', value: apiKey.trim() })
      setApiKeySet(true)
      setSaveSuccess(true)
      setApiKey('')
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      console.error('Failed to save API key:', err)
      setSaveError(
        typeof err === 'string' ? err : 'Failed to save settings. Please try again.'
      )
    } finally {
      setIsSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSave()
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-lg mx-auto px-6 py-8 flex flex-col gap-6">
        {/* Page header */}
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Settings
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Configure your Starchild connection
          </p>
        </div>

        {/* Venice AI section */}
        <Section title="Venice AI">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="api-key-input"
                className="text-sm font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                API Key
              </label>
              <StatusBadge set={apiKeySet} />
            </div>

            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Your key is stored locally and never leaves this device. Get one at{' '}
              <span style={{ color: 'var(--accent-lavender)' }}>venice.ai</span>.
            </p>

            {/* Input + toggle */}
            <div style={inputWrapperStyle}>
              <input
                id="api-key-input"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={apiKeySet ? '••••••••••••••••••••' : 'Paste your Venice API key…'}
                autoComplete="off"
                spellCheck={false}
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: 'var(--text-primary)' }}
                aria-label="Venice API key"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="transition-colors duration-150"
                style={{ color: 'var(--text-muted)' }}
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
              >
                {showKey ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={!apiKey.trim() || isSaving}
              className={actionBtnClass}
              style={apiKey.trim() && !isSaving ? primaryBtnStyle : disabledBtnStyle}
            >
              {isSaving ? 'Saving…' : 'Save API Key'}
            </button>

            {/* Feedback */}
            {saveSuccess && (
              <p className="text-xs text-center" style={{ color: 'var(--accent-mint)' }} role="status">
                API key saved successfully.
              </p>
            )}
            {saveError && (
              <p className="text-xs text-center" style={{ color: 'var(--accent-rose)' }} role="alert">
                {saveError}
              </p>
            )}
          </div>
        </Section>

        {/* Voice */}
        <VoiceSection />

        {/* On-Chain Identity */}
        <IdentitySection />

        {/* Integrations */}
        <TelegramSection />

        <WhatsAppSection />

        {/* Notifications */}
        <NotificationsSection />

        {/* Your Data */}
        <YourDataSection />

        {/* About */}
        <Section title="About">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-muted)' }}>App</span>
              <span style={{ color: 'var(--text-secondary)' }}>Starchild</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-muted)' }}>Version</span>
              <span style={{ color: 'var(--text-secondary)' }}>0.1.0</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-muted)' }}>Built with</span>
              <span style={{ color: 'var(--text-secondary)' }}>Tauri · React · Venice AI</span>
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}
