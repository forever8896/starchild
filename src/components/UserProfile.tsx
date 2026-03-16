/**
 * UserProfile.tsx — Starchild stats and bond overview
 *
 * Usage:
 *   <UserProfile />
 *
 * Loads starchildState on mount via invoke('get_state').
 * Displays: hunger, mood, energy, bond, XP bar, level.
 */

import { useEffect, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore, type StarchildState, type Memory } from '../store'
import { getIdentityInfo, getAttestations, MILESTONES, type IdentityInfo, type Attestation } from '../chain'

// ─── Stat bar ─────────────────────────────────────────────────────────────────

interface StatBarProps {
  label: string
  value: number        // 0–100
  fillColor: string    // CSS var or color for the bar fill
  icon: string
}

function StatBar({ label, value, fillColor, icon }: StatBarProps) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div
      className="flex flex-col gap-1.5"
      role="meter"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="flex items-center justify-between">
        <span
          className="flex items-center gap-1.5 text-sm"
          style={{ color: 'var(--text-muted)' }}
        >
          <span aria-hidden="true">{icon}</span>
          {label}
        </span>
        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          {clamped}
        </span>
      </div>
      <div
        className="h-2 w-full rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <div
          className="h-full rounded-full bar-fill"
          style={{ width: `${clamped}%`, backgroundColor: fillColor }}
        />
      </div>
    </div>
  )
}

// ─── XP bar ───────────────────────────────────────────────────────────────────

function XpBar({ xp, level }: { xp: number; level: number }) {
  // Simple XP formula: each level needs level * 100 XP
  const xpForLevel  = level * 100
  const xpIntoLevel = xp % xpForLevel
  const pct         = Math.min(100, Math.round((xpIntoLevel / xpForLevel) * 100))

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
          <span aria-hidden="true">⚡</span>
          Experience
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {xpIntoLevel} / {xpForLevel} XP
        </span>
      </div>
      <div
        className="h-3 w-full rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
        role="meter"
        aria-label="Experience points"
        aria-valuenow={xpIntoLevel}
        aria-valuemin={0}
        aria-valuemax={xpForLevel}
      >
        <div
          className="h-full rounded-full bar-fill"
          style={{ width: `${pct}%`, backgroundColor: 'var(--accent-lavender)' }}
        />
      </div>
      <p className="text-[11px] text-right" style={{ color: 'var(--text-muted)' }}>
        {pct}% to level {level + 1}
      </p>
    </div>
  )
}

// ─── Mood badge ───────────────────────────────────────────────────────────────

type MoodStyle = { color: string; background: string; border: string }

const MOOD_STYLES: Record<string, MoodStyle> = {
  Ecstatic: {
    color: 'var(--accent-mint)',
    background: 'rgba(168, 216, 184, 0.12)',
    border: 'var(--outline)',
  },
  Happy: {
    color: 'var(--accent-mint)',
    background: 'rgba(168, 216, 184, 0.10)',
    border: 'var(--outline)',
  },
  Content: {
    color: 'var(--accent-sky)',
    background: 'rgba(168, 200, 232, 0.10)',
    border: 'var(--outline)',
  },
  Restless: {
    color: 'var(--accent-gold)',
    background: 'rgba(232, 216, 168, 0.10)',
    border: 'var(--outline)',
  },
  Hungry: {
    color: 'var(--accent-peach)',
    background: 'rgba(255, 184, 140, 0.10)',
    border: 'var(--outline)',
  },
  Starving: {
    color: 'var(--accent-rose)',
    background: 'rgba(232, 168, 184, 0.12)',
    border: 'var(--outline)',
  },
}

function MoodBadge({ mood }: { mood: string }) {
  const s: MoodStyle = MOOD_STYLES[mood] ?? {
    color: 'var(--text-muted)',
    background: 'var(--bg-secondary)',
    border: 'var(--outline)',
  }
  return (
    <span
      className="px-3 py-1 rounded-full text-sm font-semibold border"
      style={{ color: s.color, backgroundColor: s.background, borderColor: s.border }}
    >
      {mood}
    </span>
  )
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function SkeletonBar() {
  return (
    <div className="flex flex-col gap-1.5 animate-pulse">
      <div className="flex justify-between">
        <div className="h-4 w-24 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }} />
        <div className="h-4 w-8 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }} />
      </div>
      <div className="h-2 w-full rounded-full" style={{ backgroundColor: 'var(--bg-secondary)' }} />
    </div>
  )
}

// ─── UserProfile ─────────────────────────────────────────────────────────────

export default function UserProfile() {
  const starchildState    = useAppStore((s) => s.starchildState)
  const setStarchildState = useAppStore((s) => s.setStarchildState)

  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // ── Load state on mount ───────────────────────────────────────────────
  useEffect(() => {
    // If we already have data from a recent chat message, skip refetch
    if (starchildState) return

    let cancelled = false
    setIsLoading(true)

    async function load() {
      try {
        const state = await invoke<StarchildState>('get_state')
        if (!cancelled) setStarchildState(state)
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load Starchild state:', err)
          setLoadError('Could not load Starchild stats.')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [starchildState, setStarchildState])

  // ── Refresh handler ───────────────────────────────────────────────────
  async function handleRefresh() {
    setIsLoading(true)
    setLoadError(null)
    try {
      const state = await invoke<StarchildState>('get_state')
      setStarchildState(state)
    } catch (err) {
      console.error('Failed to refresh state:', err)
      setLoadError('Failed to refresh stats.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: 'var(--bg-deep)' }}>
      <div className="max-w-lg mx-auto px-6 py-8 flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              Starchild
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Your companion's current state
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            aria-label="Refresh stats"
            className="p-2 rounded-lg transition-colors duration-150 disabled:opacity-40"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'
              ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-card)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'
              ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
            }}
          >
            {/* Refresh icon */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
              className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
          </button>
        </div>

        {/* Error */}
        {loadError && (
          <div
            className="px-3 py-2 rounded-2xl text-sm border"
            style={{
              backgroundColor: 'rgba(232, 168, 184, 0.10)',
              borderColor: 'var(--outline)',
              color: 'var(--accent-rose)',
            }}
            role="alert"
          >
            {loadError}
          </div>
        )}

        {/* Level + Mood header card */}
        <div
          className="rounded-2xl p-5 flex items-center justify-between"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1.5px solid var(--outline)',
          }}
        >
          {isLoading && !starchildState ? (
            <div className="animate-pulse flex gap-3 items-center">
              <div className="w-12 h-12 rounded-full" style={{ backgroundColor: 'var(--bg-secondary)' }} />
              <div className="flex flex-col gap-2">
                <div className="h-4 w-24 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }} />
                <div className="h-3 w-16 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }} />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                {/* Level orb */}
                <div
                  className="flex flex-col items-center justify-center w-14 h-14 rounded-full"
                  style={{
                    backgroundColor: 'var(--glow-lavender)',
                    border: '2px solid var(--outline)',
                  }}
                >
                  <span
                    className="text-[10px] font-semibold tracking-widest uppercase leading-none"
                    style={{ color: 'var(--accent-lavender)' }}
                  >
                    Lv
                  </span>
                  <span
                    className="text-2xl font-bold leading-none"
                    style={{ color: 'var(--accent-lavender)' }}
                  >
                    {starchildState?.level ?? 1}
                  </span>
                </div>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Starchild
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {(starchildState?.xp ?? 0).toLocaleString()} total XP
                  </p>
                </div>
              </div>
              <MoodBadge mood={starchildState?.mood ?? 'Content'} />
            </>
          )}
        </div>

        {/* Stats card */}
        <div
          className="rounded-2xl p-5 flex flex-col gap-5"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1.5px solid var(--outline)',
          }}
        >
          <h2
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' }}
          >
            Vital Stats
          </h2>

          {isLoading && !starchildState ? (
            <>
              <SkeletonBar />
              <SkeletonBar />
              <SkeletonBar />
              <SkeletonBar />
            </>
          ) : (
            <>
              <StatBar
                label="Hunger"
                value={starchildState?.hunger ?? 0}
                fillColor="var(--accent-peach)"
                icon="🍖"
              />
              <StatBar
                label="Energy"
                value={starchildState?.energy ?? 0}
                fillColor="var(--accent-gold)"
                icon="⚡"
              />
              <StatBar
                label="Bond"
                value={starchildState?.bond ?? 0}
                fillColor="var(--accent-rose)"
                icon="🔗"
              />
              <XpBar
                xp={starchildState?.xp ?? 0}
                level={starchildState?.level ?? 1}
              />
            </>
          )}
        </div>

        {/* Bond description card */}
        <div
          className="rounded-2xl p-5 flex flex-col gap-3"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1.5px solid var(--outline)',
          }}
        >
          <h2
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' }}
          >
            Bond Strength
          </h2>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div
                className="h-2.5 w-full rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
                role="meter"
                aria-label="Bond strength"
                aria-valuenow={starchildState?.bond ?? 0}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bar-fill"
                  style={{
                    width: `${starchildState?.bond ?? 0}%`,
                    backgroundColor: 'var(--accent-rose)',
                  }}
                />
              </div>
            </div>
            <span
              className="text-sm font-semibold w-10 text-right"
              style={{ color: 'var(--accent-rose)' }}
            >
              {starchildState?.bond ?? 0}%
            </span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Bond grows as you share more of your life with Starchild. The more
            honest and frequent your conversations, the stronger your connection.
          </p>
        </div>

        {/* On-Chain Identity card */}
        <IdentityCard />

        {/* Achievement Attestations */}
        <AttestationsSection />

        {/* Memories card */}
        <MemoriesSection />
      </div>
    </div>
  )
}

// ─── Identity card ───────────────────────────────────────────────────────────

function IdentityCard() {
  const [info, setInfo] = useState<IdentityInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await getIdentityInfo()
        if (!cancelled) setInfo(data)
      } catch (err) {
        console.error('Failed to load identity:', err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Don't render if no identity at all
  if (!isLoading && (!info || info.status === 'none')) return null

  function shortenAddr(addr: string): string {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  function statusColor(status: string): string {
    if (status === 'registered') return 'var(--accent-mint)'
    if (status === 'pending') return 'var(--accent-gold)'
    return 'var(--text-muted)'
  }

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1.5px solid var(--outline)',
      }}
    >
      <h2
        className="text-xs font-semibold uppercase tracking-widest"
        style={{ color: 'var(--text-muted)' }}
      >
        On-Chain Identity
      </h2>

      {isLoading ? (
        <div className="animate-pulse flex flex-col gap-2">
          <div className="h-4 w-32 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }} />
          <div className="h-3 w-48 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }} />
        </div>
      ) : info && (
        <div className="flex flex-col gap-2">
          {/* Status */}
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${info.status === 'pending' ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: statusColor(info.status) }}
            />
            <span
              className="text-sm font-medium"
              style={{ color: statusColor(info.status) }}
            >
              {info.status === 'registered' ? 'Verified Agent' :
               info.status === 'pending' ? 'Registration Pending' :
               'Registration Error'}
            </span>
          </div>

          {/* Agent ID */}
          {info.agentId && (
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Agent ID</span>
              <span className="font-mono font-semibold" style={{ color: 'var(--accent-lavender)' }}>
                #{info.agentId}
              </span>
            </div>
          )}

          {/* Network */}
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: 'var(--text-muted)' }}>Network</span>
            <span style={{ color: 'var(--text-secondary)' }}>Base Mainnet</span>
          </div>

          {/* Wallet */}
          {info.walletAddress && (
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Wallet</span>
              <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>
                {shortenAddr(info.walletAddress)}
              </span>
            </div>
          )}

          {/* Standard */}
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: 'var(--text-muted)' }}>Standard</span>
            <span style={{ color: 'var(--text-secondary)' }}>ERC-8004</span>
          </div>

          <p className="text-[11px] leading-relaxed mt-1" style={{ color: 'var(--text-muted)' }}>
            Your Starchild is a verifiable autonomous agent on the blockchain.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Attestations section ─────────────────────────────────────────────────────

function AttestationsSection() {
  const [attestations, setAttestations] = useState<Attestation[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await getAttestations()
        if (!cancelled) setAttestations(data)
      } catch (err) {
        console.error('Failed to load attestations:', err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Don't render if no attestations
  if (!isLoading && attestations.length === 0) return null

  function shortenHash(hash: string): string {
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`
  }

  function statusBadge(status: string) {
    switch (status) {
      case 'confirmed':
        return (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border"
            style={{
              color: 'var(--accent-mint)',
              backgroundColor: 'rgba(168, 216, 184, 0.10)',
              borderColor: 'var(--outline)',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: 'var(--accent-mint)' }}
            />
            On-Chain
          </span>
        )
      case 'pending':
        return (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border"
            style={{
              color: 'var(--accent-gold)',
              backgroundColor: 'rgba(232, 216, 168, 0.10)',
              borderColor: 'var(--outline)',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: 'var(--accent-gold)' }}
            />
            Pending
          </span>
        )
      default:
        return (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border"
            style={{
              color: 'var(--accent-rose)',
              backgroundColor: 'rgba(232, 168, 184, 0.10)',
              borderColor: 'var(--outline)',
            }}
          >
            Error
          </span>
        )
    }
  }

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1.5px solid var(--outline)',
      }}
    >
      <div className="flex items-center justify-between">
        <h2
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--text-muted)' }}
        >
          Achievement Attestations
        </h2>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {attestations.length} earned
        </span>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2 animate-pulse">
          <div className="h-12 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }} />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {attestations.map((att) => {
            const info = MILESTONES[att.achievement_type]
            return (
              <div
                key={att.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl"
                style={{ backgroundColor: 'var(--bg-card-hover)' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {info?.label ?? att.achievement_type}
                    </span>
                    {statusBadge(att.status)}
                  </div>
                  {info && (
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {info.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    {att.tx_hash && (
                      <span className="text-[10px] font-mono" style={{ color: 'var(--accent-sky)' }}>
                        tx: {shortenHash(att.tx_hash)}
                      </span>
                    )}
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {att.created_at}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-[11px] leading-relaxed mt-1" style={{ color: 'var(--text-muted)' }}>
        Achievements are recorded on Base Mainnet as metadata on your ERC-8004 identity.
      </p>
    </div>
  )
}

// ─── Memories section ─────────────────────────────────────────────────────────

function MemoriesSection() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const loadMemories = useCallback(async () => {
    setIsLoading(true)
    try {
      const mems = await invoke<Memory[]>('get_memories', { limit: 50 })
      setMemories(mems)
    } catch (err) {
      console.error('Failed to load memories:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMemories()
  }, [loadMemories])

  async function handleDelete(id: string) {
    try {
      await invoke('delete_memory', { id })
      setMemories((prev) => prev.filter((m) => m.id !== id))
    } catch (err) {
      console.error('Failed to delete memory:', err)
    }
  }

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1.5px solid var(--outline)',
      }}
    >
      <div className="flex items-center justify-between">
        <h2
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--text-muted)' }}
        >
          What Starchild Knows About You
        </h2>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {memories.length} memories
        </span>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2 animate-pulse">
          <div className="h-8 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }} />
          <div className="h-8 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }} />
        </div>
      ) : memories.length === 0 ? (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          No memories yet. Chat with Starchild and it will start remembering
          things about you.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
          {memories.map((mem) => (
            <div
              key={mem.id}
              className="flex items-start justify-between gap-2 px-3 py-2 rounded-xl group"
              style={{ backgroundColor: 'var(--bg-card-hover)' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {mem.content}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {mem.category && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: 'var(--outline)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {mem.category}
                    </span>
                  )}
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {Math.round(mem.importance * 100)}% importance
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleDelete(mem.id)}
                className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-all duration-150"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-rose)'
                  ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(232, 168, 184, 0.12)'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'
                  ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
                }}
                aria-label={`Delete memory: ${mem.content}`}
                title="Delete this memory"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
                  className="w-3.5 h-3.5" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
