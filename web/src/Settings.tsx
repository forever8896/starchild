/**
 * Settings.tsx — the web shell's lightweight settings / data panel.
 *
 * The desktop `src/components/Settings.tsx` is deeply native-coupled (Telegram /
 * WhatsApp bots, OS notifications, native Venice TTS) via direct Tauri `invoke`,
 * so the web edition ships its own focused panel here under the web adapter dir
 * (PRD §4.2: web-only modules live in `web/src/*`). It reaches storage ONLY
 * through the shared `Platform` seam (`usePlatform()`), never IndexedDB directly.
 *
 * What it does (PRD §6 — inference funding):
 *   • shows whether inference is running on the bounded TRIAL proxy or BYOK,
 *   • lets the user paste & save their own Venice key (→ BYOK, fully private),
 *   • lets the user clear that key (→ back to the trial).
 *
 * The saved key lives in IndexedDB under `venice_api_key`; `web.ts`'s
 * `resolveInference()` reads it and switches `venice-proxy.ts` to BYOK whenever a
 * non-empty key is present, else the trial proxy.
 */

import { useEffect, useState } from 'react'
import { usePlatform } from '../../src/platform/usePlatform'
import { ACCESS_URL } from './access'

const VENICE_KEY = 'venice_api_key'

// ─── Icons ────────────────────────────────────────────────────────────────────

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

// ─── Status badge (Trial vs BYOK) ────────────────────────────────────────────

function ModeBadge({ byok }: { byok: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={
        byok
          ? {
              backgroundColor: 'rgba(168, 216, 184, 0.15)',
              color: 'var(--accent-mint)',
              border: '1px solid rgba(168, 216, 184, 0.3)',
            }
          : {
              backgroundColor: 'rgba(232, 216, 168, 0.12)',
              color: 'var(--accent-gold)',
              border: '1px solid rgba(232, 216, 168, 0.3)',
            }
      }
      aria-label={byok ? 'Using your own Venice key' : 'Using the free trial'}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: byok ? 'var(--accent-mint)' : 'var(--accent-gold)' }}
        aria-hidden="true"
      />
      {byok ? 'Your key (BYOK)' : 'Free trial'}
    </span>
  )
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputWrapperStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  backgroundColor: 'var(--bg-input)',
  border: '1.5px solid var(--outline)',
  borderRadius: '8px',
  padding: '8px 12px',
}

const actionBtnClass = 'w-full py-2 rounded-lg text-sm font-medium transition-all duration-150'

const primaryBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--accent-lavender)',
  color: 'var(--bg-deep)',
}

const disabledBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-secondary)',
  color: 'var(--text-muted)',
  cursor: 'not-allowed',
}

// ─── Settings panel ───────────────────────────────────────────────────────────

export default function Settings({
  onClose,
  onOpenData,
}: {
  onClose?: () => void
  /** Open the encrypted export/import ("Your data") panel, if the shell wires one. */
  onOpenData?: () => void
}) {
  const platform = usePlatform()

  const [byok, setByok] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Determine the current inference tier on mount: a non-empty saved key = BYOK.
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const value = await platform.getSetting(VENICE_KEY)
        if (!cancelled) setByok(!!value && value.trim().length > 0)
      } catch {
        // First run / empty store — treat as trial.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [platform])

  async function handleSave() {
    const trimmed = apiKey.trim()
    if (!trimmed) return
    setIsSaving(true)
    setError(null)
    setSaveSuccess(false)
    try {
      await platform.setSetting(VENICE_KEY, trimmed)
      setByok(true)
      setApiKey('')
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save your Venice key.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleClear() {
    setIsClearing(true)
    setError(null)
    setSaveSuccess(false)
    try {
      // Empty value = no key; `resolveInference()` falls back to the trial proxy.
      await platform.setSetting(VENICE_KEY, '')
      setByok(false)
      setApiKey('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear your Venice key.')
    } finally {
      setIsClearing(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSave()
  }

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ backgroundColor: 'var(--bg-deep)' }}
      role="dialog"
      aria-label="Settings"
    >
      <div className="max-w-lg mx-auto px-6 py-8 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              Settings
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Connect your own Venice key for live, private replies
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg"
              style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-card)' }}
              aria-label="Close settings"
              title="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
                className="w-4 h-4" aria-hidden="true">
                <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
              </svg>
            </button>
          )}
        </div>

        {/* Venice AI / inference */}
        <section className="flex flex-col gap-3">
          <h2
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' }}
          >
            Inference
          </h2>
          <div
            className="flex flex-col gap-3 p-4"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1.5px solid var(--outline)',
              borderRadius: '16px',
            }}
          >
            <div className="flex items-center justify-between">
              <label
                htmlFor="venice-key-input"
                className="text-sm font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                Venice API key
              </label>
              <ModeBadge byok={byok} />
            </div>

            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {byok
                ? 'Live replies are running on your own Venice key. It is stored only in this browser and goes straight to Venice — we never see it.'
                : 'You are on the free trial (a shared, rate-limited demo). Paste your own Venice key for unlimited, fully private replies. Get one at '}
              {!byok && <span style={{ color: 'var(--accent-lavender)' }}>venice.ai</span>}
              {!byok && '.'}
            </p>

            {/* Key input + show/hide */}
            <div style={inputWrapperStyle}>
              <input
                id="venice-key-input"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={byok ? 'Paste a new key to replace…' : 'Paste your Venice API key…'}
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

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={!apiKey.trim() || isSaving}
              className={actionBtnClass}
              style={apiKey.trim() && !isSaving ? primaryBtnStyle : disabledBtnStyle}
            >
              {isSaving ? 'Saving…' : byok ? 'Replace key' : 'Save key & go live'}
            </button>

            {/* Clear (only when a key is set) */}
            {byok && (
              <button
                onClick={handleClear}
                disabled={isClearing}
                className={actionBtnClass}
                style={{
                  backgroundColor: 'var(--bg-card)',
                  color: 'var(--accent-rose)',
                  border: '1px solid rgba(232, 168, 184, 0.3)',
                }}
              >
                {isClearing ? 'Clearing…' : 'Clear key (back to trial)'}
              </button>
            )}

            {saveSuccess && (
              <p className="text-xs text-center" style={{ color: 'var(--accent-mint)' }} role="status">
                Saved. You are now on your own key.
              </p>
            )}
            {error && (
              <p className="text-xs text-center" style={{ color: 'var(--accent-rose)' }} role="alert">
                {error}
              </p>
            )}
          </div>

          {/* Token-lock tier → claim a funded, private key on the commons */}
          <a
            href={ACCESS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col gap-1 p-4 transition-opacity duration-150 hover:opacity-90"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1.5px solid var(--outline)',
              borderRadius: '16px',
              textDecoration: 'none',
            }}
          >
            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Free private access — lock $STARCHILD ↗
            </span>
            <span className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              No Venice key? Lock $STARCHILD on the commons and get a funded, private Starchild
              key — capped and expiring with your lock. Claim it there, then paste it above.
            </span>
          </a>
        </section>

        {/* Your data */}
        <section className="flex flex-col gap-3">
          <h2
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' }}
          >
            Your data
          </h2>
          <div
            className="flex flex-col gap-3 p-4"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1.5px solid var(--outline)',
              borderRadius: '16px',
            }}
          >
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Everything — your conversation, your creature, your key — lives only
              in this browser (IndexedDB). Nothing is sent to a server except the
              encrypted inference call to Venice. Clearing your browser storage
              erases it, so back up regularly.
            </p>
            {onOpenData && (
              <button
                onClick={onOpenData}
                className={actionBtnClass}
                style={{
                  backgroundColor: 'var(--accent-sky)',
                  color: 'var(--bg-deep)',
                }}
              >
                Back up or move my data…
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
