/**
 * Settings.tsx — the web shell's single settings surface ("You & this space").
 *
 * One calm, scrollable page in the cosmic/clay language — no more separate
 * "Me" and "Your Data" overlays. Four sections, each a soft clay card:
 *   • Intelligence — the trial (E2EE) vs your own Venice key (BYOK)
 *   • Voice        — which voice the Starchild speaks in
 *   • Your data    — encrypted .starchild backup: export / import
 *   • Danger zone  — erase everything (type-to-confirm, no undo)
 *
 * Everything flows through the shared `Platform` seam (`usePlatform()`); this
 * file never touches IndexedDB or crypto directly.
 */

import { useEffect, useRef, useState } from 'react'
import { usePlatform } from '../../src/platform/usePlatform'
import { ACCESS_URL } from './access'
import { TTS_VOICES, DEFAULT_TTS_VOICE, TTS_VOICE_SETTING, isTtsVoice } from './voices'

const VENICE_KEY = 'venice_api_key'
const EXPORT_EXT = '.starchild'

// Launch is sponsored-demo-only — the lock→key tier stays hidden until the
// Venice admin key is live. Flip to true to re-enable it.
const SHOW_LOCK_TIER = false

// ─── Design atoms ──────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: 'linear-gradient(155deg, rgba(44,37,66,.9), rgba(30,25,45,.94))',
  border: '1px solid #4a3f60',
  borderRadius: 24,
  boxShadow: '0 18px 40px -18px rgba(0,0,0,.7), inset 0 2px 2px rgba(255,255,255,.05)',
  padding: 24,
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(20,17,30,.6)',
  border: '1px solid #4a3f60',
  borderRadius: 14,
  padding: '11px 14px',
  color: 'var(--text-primary)',
  fontSize: 14,
  outline: 'none',
  width: '100%',
}

function SectionCard({
  accent,
  title,
  subtitle,
  children,
}: {
  accent: string
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section style={cardStyle} className="flex flex-col gap-4">
      <header className="flex items-center gap-2.5">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: accent, boxShadow: `0 0 10px ${accent}` }} />
        <div>
          <h2 className="text-[16px] font-extrabold leading-tight" style={{ color: 'var(--text-primary)' }}>{title}</h2>
          {subtitle && <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}

function Btn({
  onClick, disabled, tone = 'primary', children, ...rest
}: {
  onClick?: () => void
  disabled?: boolean
  tone?: 'primary' | 'ghost' | 'danger' | 'mint'
  children: React.ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const tones: Record<string, React.CSSProperties> = {
    primary: { background: 'linear-gradient(150deg,#c8b0e0,#b8a0d8)', color: '#1c1526', border: 'none' },
    mint: { background: 'linear-gradient(150deg,#bfe6cd,#a8d8b8)', color: '#14231a', border: 'none' },
    danger: { background: 'linear-gradient(150deg,#e8a8b8,#d98aa0)', color: '#2a1420', border: 'none' },
    ghost: { background: 'rgba(48,41,69,.6)', color: 'var(--text-secondary)', border: '1px solid #4a3f60' },
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2.5 rounded-2xl text-[14px] font-bold transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ ...tones[tone], ...(disabled ? { filter: 'saturate(0.6)' } : {}) }}
      {...rest}
    >
      {children}
    </button>
  )
}

// ─── Intelligence (trial vs BYOK) ─────────────────────────────────────────────

function IntelligenceSection() {
  const platform = usePlatform()
  const [byok, setByok] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void platform.getSetting(VENICE_KEY).then((v) => {
      if (!cancelled) setByok(!!v && v.trim().length > 0)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [platform])

  async function save() {
    const trimmed = apiKey.trim()
    if (!trimmed) return
    setBusy(true); setError(null); setSaved(false)
    try {
      await platform.setSetting(VENICE_KEY, trimmed)
      setByok(true); setApiKey(''); setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your key.')
    } finally { setBusy(false) }
  }
  async function clear() {
    setBusy(true); setError(null)
    try { await platform.setSetting(VENICE_KEY, ''); setByok(false); setApiKey('') }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not clear your key.') }
    finally { setBusy(false) }
  }

  return (
    <SectionCard
      accent="#b8a0d8"
      title="The spark I think with"
      subtitle={byok ? 'Running on your own Venice key' : 'Running on the free, end-to-end-encrypted trial'}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
          style={byok
            ? { background: 'rgba(168,216,184,.15)', color: 'var(--accent-mint)', border: '1px solid rgba(168,216,184,.3)' }
            : { background: 'rgba(232,216,168,.12)', color: 'var(--accent-gold)', border: '1px solid rgba(232,216,168,.3)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: byok ? 'var(--accent-mint)' : 'var(--accent-gold)' }} />
          {byok ? 'Your key (BYOK)' : 'Free trial · E2EE'}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        The free trial is end-to-end encrypted and just works. Bring your own Venice
        key to lift its limits — same privacy, your budget. It lives only in this
        browser; we never see it.
      </p>

      <div className="flex items-center gap-2">
        <input
          type={showKey ? 'text' : 'password'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void save() }}
          placeholder="paste a Venice key… (venice.ai)"
          autoComplete="off"
          spellCheck={false}
          style={inputStyle}
          aria-label="Venice API key"
        />
        <button
          onClick={() => setShowKey((v) => !v)}
          className="shrink-0 px-3 py-2 rounded-xl text-xs"
          style={{ background: 'rgba(48,41,69,.6)', color: 'var(--text-muted)', border: '1px solid #4a3f60' }}
          aria-label={showKey ? 'Hide key' : 'Show key'}
        >
          {showKey ? 'hide' : 'show'}
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Btn onClick={save} disabled={!apiKey.trim() || busy}>{busy ? 'saving…' : 'save my key'}</Btn>
        {byok && <Btn tone="ghost" onClick={clear} disabled={busy}>back to the free trial</Btn>}
        {saved && <span className="text-[12.5px] font-bold" style={{ color: 'var(--accent-mint)' }}>✓ saved</span>}
      </div>

      {error && <p className="text-[12.5px]" style={{ color: 'var(--accent-rose)' }} role="alert">{error}</p>}

      {SHOW_LOCK_TIER && (
        <a href={ACCESS_URL} target="_blank" rel="noreferrer" className="text-[12.5px] underline" style={{ color: 'var(--accent-lavender)' }}>
          No key? Lock $STARCHILD for a funded, private key →
        </a>
      )}
    </SectionCard>
  )
}

// ─── Voice ─────────────────────────────────────────────────────────────────────

function VoiceSection() {
  const platform = usePlatform()
  const [voice, setVoice] = useState<string>(DEFAULT_TTS_VOICE)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    void platform.getSetting(TTS_VOICE_SETTING).then((v) => {
      const s = (v ?? '').trim()
      if (!cancelled && isTtsVoice(s)) setVoice(s)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [platform])

  async function change(next: string) {
    setVoice(next); setSaved(false)
    try {
      await platform.setSetting(TTS_VOICE_SETTING, next)
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch { /* default keeps working */ }
  }

  return (
    <SectionCard accent="#e8d8a8" title="The voice it speaks in" subtitle="Auto-plays each reply · silence it with 🔊 in the chat header">
      <div className="flex items-center gap-3">
        <label htmlFor="voice-select" className="text-[13px] shrink-0" style={{ color: 'var(--text-secondary)' }}>Speaks as</label>
        <select
          id="voice-select"
          value={voice}
          onChange={(e) => void change(e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          {TTS_VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        {saved && <span className="text-[12px] shrink-0 font-bold" style={{ color: 'var(--accent-mint)' }}>✓</span>}
      </div>
      <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Speaking sends <em>its</em> words — and the mic sends <em>your</em> recorded
        speech (only when you press it) — to Venice's voice service, which isn't
        end-to-end encrypted like the chat. Type instead for full silence on the wire.
      </p>
    </SectionCard>
  )
}

// ─── Your data (export + import) ──────────────────────────────────────────────

function DataSection() {
  const platform = usePlatform()
  const fileRef = useRef<HTMLInputElement>(null)

  const [exPass, setExPass] = useState('')
  const [exConfirm, setExConfirm] = useState('')
  const [exBusy, setExBusy] = useState(false)
  const [exDone, setExDone] = useState(false)

  const [file, setFile] = useState<File | null>(null)
  const [imPass, setImPass] = useState('')
  const [imBusy, setImBusy] = useState(false)
  const [imConfirm, setImConfirm] = useState(false)

  const [error, setError] = useState<string | null>(null)

  const canExport = exPass.length > 0 && exPass === exConfirm && !exBusy
  const exMismatch = exConfirm.length > 0 && exPass !== exConfirm
  const canImport = !!file && imPass.length > 0 && !imBusy

  async function doExport() {
    if (!canExport) return
    setExBusy(true); setError(null); setExDone(false)
    try {
      const blob = await platform.exportData(exPass)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `starchild-${new Date().toISOString().slice(0, 10)}${EXPORT_EXT}`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setExDone(true); setExPass(''); setExConfirm('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.')
    } finally { setExBusy(false) }
  }

  async function doImport() {
    if (!file || imPass.length === 0) return
    setImBusy(true); setError(null)
    try {
      await platform.importData(file, imPass)
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed — wrong passphrase?')
      setImBusy(false); setImConfirm(false)
    }
  }

  return (
    <SectionCard accent="#a8c8e8" title="Where your heart's kept" subtitle="Everything lives only in this browser — encrypted, no account, no server">
      {/* Export */}
      <div className="flex flex-col gap-2.5">
        <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          Save it all into one encrypted <code style={{ color: 'var(--accent-sky)' }}>{EXPORT_EXT}</code> file.
          No recovery — if you lose the passphrase, the file can never be opened.
        </p>
        <input type="password" value={exPass} onChange={(e) => setExPass(e.target.value)} placeholder="choose a passphrase…" autoComplete="off" style={inputStyle} aria-label="Export passphrase" />
        <input type="password" value={exConfirm} onChange={(e) => setExConfirm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void doExport() }} placeholder="confirm passphrase…" autoComplete="off" style={inputStyle} aria-label="Confirm export passphrase" />
        {exMismatch && <p className="text-[12px]" style={{ color: 'var(--accent-rose)' }}>Passphrases don't match.</p>}
        <div className="flex items-center gap-2">
          <Btn tone="mint" onClick={doExport} disabled={!canExport}>{exBusy ? 'encrypting…' : '↓ export a backup'}</Btn>
          {exDone && <span className="text-[12.5px] font-bold" style={{ color: 'var(--accent-mint)' }}>✓ downloading — keep it safe</span>}
        </div>
      </div>

      <div style={{ height: 1, background: 'rgba(74,63,96,.5)' }} />

      {/* Import */}
      <div className="flex flex-col gap-2.5">
        <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          Restore from a backup — this <span style={{ color: 'var(--accent-rose)' }}>replaces</span> everything here.
        </p>
        <input ref={fileRef} type="file" accept={EXPORT_EXT} className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); setImConfirm(false) }} />
        <Btn tone="ghost" onClick={() => fileRef.current?.click()}>{file ? `selected: ${file.name}` : `↑ choose a ${EXPORT_EXT} file`}</Btn>
        {file && (
          <input type="password" value={imPass} onChange={(e) => setImPass(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && canImport) setImConfirm(true) }} placeholder="the file's passphrase…" autoComplete="off" style={inputStyle} aria-label="Import passphrase" />
        )}
        {!imConfirm ? (
          <Btn tone="ghost" onClick={() => setImConfirm(true)} disabled={!canImport}>import &amp; replace</Btn>
        ) : (
          <div className="flex flex-col gap-2 p-3 rounded-2xl" style={{ background: 'rgba(232,168,184,.07)', border: '1px solid rgba(232,168,184,.25)' }}>
            <p className="text-[12.5px] text-center font-medium" style={{ color: 'var(--accent-rose)' }}>
              This overwrites everything in this browser. Export first if you want to keep it.
            </p>
            <div className="flex gap-2">
              <Btn tone="ghost" onClick={() => setImConfirm(false)} disabled={imBusy}>cancel</Btn>
              <Btn tone="mint" onClick={doImport} disabled={imBusy}>{imBusy ? 'importing…' : 'yes, replace it'}</Btn>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-[12.5px] text-center" style={{ color: 'var(--accent-rose)' }} role="alert">{error}</p>}
    </SectionCard>
  )
}

// ─── Danger zone (delete everything) ──────────────────────────────────────────

function DangerSection() {
  const platform = usePlatform()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canDelete = typed.trim().toLowerCase() === 'delete' && !busy && !!platform.clearAllData

  async function doDelete() {
    if (!canDelete || !platform.clearAllData) return
    setBusy(true); setError(null)
    try {
      await platform.clearAllData()
      // Clean slate — reload to first-run onboarding.
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not erase your data.')
      setBusy(false)
    }
  }

  return (
    <section
      style={{ ...cardStyle, border: '1px solid rgba(232,168,184,.35)', background: 'linear-gradient(155deg, rgba(52,34,44,.6), rgba(30,25,45,.94))' }}
      className="flex flex-col gap-4"
    >
      <header className="flex items-center gap-2.5">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: 'var(--accent-rose)', boxShadow: '0 0 10px var(--accent-rose)' }} />
        <div>
          <h2 className="text-[16px] font-extrabold leading-tight" style={{ color: 'var(--text-primary)' }}>Let this one go</h2>
          <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Erase everything and start over — the Starchild forgets you completely</p>
        </div>
      </header>

      {!open ? (
        <Btn tone="ghost" onClick={() => setOpen(true)}>erase all my data…</Btn>
      ) : (
        <div className="flex flex-col gap-2.5">
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            This deletes your whole world — conversation, creature, quests, everything
            your Starchild has come to know, and your saved key. It cannot be undone.
            Export a backup first if there's any doubt. Type <b style={{ color: 'var(--accent-rose)' }}>delete</b> to confirm.
          </p>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && canDelete) void doDelete() }} placeholder="type: delete" autoComplete="off" spellCheck={false} style={{ ...inputStyle, borderColor: 'rgba(232,168,184,.4)' }} aria-label="Type delete to confirm" />
          <div className="flex gap-2">
            <Btn tone="ghost" onClick={() => { setOpen(false); setTyped('') }} disabled={busy}>keep my Starchild</Btn>
            <Btn tone="danger" onClick={doDelete} disabled={!canDelete}>{busy ? 'erasing…' : 'erase everything forever'}</Btn>
          </div>
          {error && <p className="text-[12.5px]" style={{ color: 'var(--accent-rose)' }} role="alert">{error}</p>}
        </div>
      )}
    </section>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function Settings({ onClose }: { onClose?: () => void; onOpenData?: () => void }) {
  return (
    <div className="h-full overflow-y-auto" role="dialog" aria-label="Settings">
      <div className="max-w-xl mx-auto px-6 py-8 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[.2em]" style={{ color: 'var(--accent-lavender)' }}>you &amp; this space</p>
            <h1 className="text-[28px] font-extrabold mt-1" style={{ color: 'var(--text-primary)' }}>quiet, private, yours</h1>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-xl shrink-0"
              style={{ background: 'rgba(48,41,69,.6)', color: 'var(--text-muted)', border: '1px solid #4a3f60' }}
              aria-label="Back to chat"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
                <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
              </svg>
            </button>
          )}
        </div>

        <IntelligenceSection />
        <VoiceSection />
        <DataSection />
        <DangerSection />
      </div>
    </div>
  )
}
