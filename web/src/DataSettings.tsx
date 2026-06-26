/**
 * DataSettings.tsx — the web shell's "Your Data" panel (PRD §5).
 *
 * Wires the encrypted, versioned `.starchild` portability into the browser UI.
 * Everything flows through the shared `Platform` seam (`usePlatform()`), exactly
 * like the other web components — this panel never touches IndexedDB or crypto
 * directly:
 *
 *   Export → passphrase → `platform.exportData(passphrase)` → download a
 *            `.starchild` file (an Argon2id + AES-256-GCM blob of all your data).
 *   Import → file picker → passphrase → `platform.importData(file, passphrase)`
 *            → `replaceAll` into IndexedDB → reload the app so every view
 *            re-reads the freshly-restored data.
 *
 * Copy is deliberate: this is YOUR data, it lives in this browser, back it up —
 * and there is NO passphrase recovery (the holder owns it).
 */

import { useRef, useState } from 'react'
import { usePlatform } from '../../src/platform/usePlatform'

// The `.starchild` file extension (mirrors `EXPORT_FILE_EXTENSION` in
// `export.ts`). Kept as a local literal so this UI never statically imports the
// crypto-heavy `export.ts` — that module stays lazy-loaded through the platform
// seam (`web.ts` dynamic import), keeping it out of the main bundle chunk.
const EXPORT_FILE_EXTENSION = '.starchild'

// ─── Shared styling (mirrors src/components/Settings.tsx) ─────────────────────

const actionBtnClass =
  'w-full py-2 rounded-lg text-sm font-medium transition-all duration-150'

const disabledBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-secondary)',
  color: 'var(--text-muted)',
  cursor: 'not-allowed',
}
const skyBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--accent-sky)',
  color: 'var(--bg-deep)',
}
const mintBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--accent-mint)',
  color: 'var(--bg-deep)',
}
const secondaryBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-card)',
  color: 'var(--text-secondary)',
}
const inputWrapperStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  backgroundColor: 'var(--bg-input)',
  border: '1.5px solid var(--outline)',
  borderRadius: '8px',
  padding: '8px 12px',
}

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

function PassphraseInput({
  id,
  value,
  onChange,
  placeholder,
  onEnter,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  onEnter?: () => void
}) {
  return (
    <div style={inputWrapperStyle}>
      <input
        id={id}
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) onEnter()
        }}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="flex-1 bg-transparent text-sm outline-none"
        style={{ color: 'var(--text-primary)' }}
        aria-label={placeholder}
      />
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

function ExportSection() {
  const platform = usePlatform()
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canExport = pass.length > 0 && pass === confirm && !busy

  async function handleExport() {
    if (!canExport) return
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      const blob = await platform.exportData(pass)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `starchild-${new Date().toISOString().slice(0, 10)}${EXPORT_FILE_EXTENSION}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setDone(true)
      setPass('')
      setConfirm('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setBusy(false)
    }
  }

  const mismatch = confirm.length > 0 && pass !== confirm

  return (
    <Section title="Export my Starchild">
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Save everything — your conversation, your creature, quests and settings —
        into one encrypted <code style={{ color: 'var(--accent-sky)' }}>{EXPORT_FILE_EXTENSION}</code>{' '}
        file. Import it on desktop or in another browser to pick up exactly where
        you left off.
      </p>
      <p className="text-xs" style={{ color: 'var(--accent-gold)' }}>
        Choose a passphrase to lock the file. There is no recovery — if you lose
        the passphrase, the file can never be opened. Keep it somewhere safe.
      </p>

      <div className="flex flex-col gap-2">
        <label htmlFor="export-pass" className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          Passphrase
        </label>
        <PassphraseInput
          id="export-pass"
          value={pass}
          onChange={setPass}
          placeholder="Choose a passphrase…"
        />
        <PassphraseInput
          id="export-pass-confirm"
          value={confirm}
          onChange={setConfirm}
          placeholder="Confirm passphrase…"
          onEnter={handleExport}
        />
        {mismatch && (
          <p className="text-xs" style={{ color: 'var(--accent-rose)' }}>
            Passphrases don’t match.
          </p>
        )}
      </div>

      <button
        onClick={handleExport}
        disabled={!canExport}
        className={actionBtnClass}
        style={canExport ? skyBtnStyle : disabledBtnStyle}
      >
        {busy ? 'Encrypting…' : 'Export my Starchild'}
      </button>

      {done && (
        <p className="text-xs text-center" style={{ color: 'var(--accent-mint)' }} role="status">
          Exported. Your <code>{EXPORT_FILE_EXTENSION}</code> file is downloading — store it safely.
        </p>
      )}
      {error && (
        <p className="text-xs text-center" style={{ color: 'var(--accent-rose)' }} role="alert">
          {error}
        </p>
      )}
    </Section>
  )
}

// ─── Import ───────────────────────────────────────────────────────────────────

function ImportSection() {
  const platform = usePlatform()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const canImport = !!file && pass.length > 0 && !busy

  async function handleImport() {
    if (!file || pass.length === 0) return
    setBusy(true)
    setError(null)
    try {
      await platform.importData(file, pass)
      // Reload so every view re-reads the freshly-restored IndexedDB data.
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
      setBusy(false)
      setConfirming(false)
    }
  }

  return (
    <Section title="Import">
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Restore from a <code style={{ color: 'var(--accent-mint)' }}>{EXPORT_FILE_EXTENSION}</code>{' '}
        file you exported here or on desktop. This{' '}
        <span style={{ color: 'var(--accent-rose)' }}>replaces</span> everything
        currently in this browser with the contents of the file.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept={EXPORT_FILE_EXTENSION}
        className="hidden"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null)
          setError(null)
          setConfirming(false)
        }}
      />

      <button
        onClick={() => fileRef.current?.click()}
        className={actionBtnClass}
        style={{ ...secondaryBtnStyle, border: '1px solid var(--outline)' }}
      >
        {file ? `Selected: ${file.name}` : 'Choose a .starchild file…'}
      </button>

      {file && (
        <div className="flex flex-col gap-2">
          <label htmlFor="import-pass" className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Passphrase
          </label>
          <PassphraseInput
            id="import-pass"
            value={pass}
            onChange={setPass}
            placeholder="Enter the file’s passphrase…"
            onEnter={() => canImport && setConfirming(true)}
          />
        </div>
      )}

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          disabled={!canImport}
          className={actionBtnClass}
          style={canImport ? mintBtnStyle : disabledBtnStyle}
        >
          Import &amp; replace my data
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
            This overwrites the conversation, creature, quests and settings in this
            browser. Export first if you want to keep them. This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-150"
              style={secondaryBtnStyle}
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={busy}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-150"
              style={busy ? disabledBtnStyle : mintBtnStyle}
            >
              {busy ? 'Importing…' : 'Yes, replace everything'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-center" style={{ color: 'var(--accent-rose)' }} role="alert">
          {error}
        </p>
      )}
    </Section>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export default function DataSettings({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto"
      style={{ backgroundColor: 'rgba(8, 6, 14, 0.78)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Your data"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg px-6 py-8 flex flex-col gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              Your data
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Everything lives in this browser. Back it up — or move it.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full shrink-0"
            style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)' }}
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
              <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
            </svg>
          </button>
        </div>

        <p
          className="text-xs p-3 rounded-lg"
          style={{
            color: 'var(--text-muted)',
            backgroundColor: 'rgba(42, 36, 56, 0.5)',
            border: '1px solid var(--outline)',
          }}
        >
          Starchild keeps your data on your device only — never on a server. If you
          clear your browser storage it’s gone, so export a backup now and then,
          and import it to move to desktop or a new browser.
        </p>

        <ExportSection />
        <ImportSection />
      </div>
    </div>
  )
}
