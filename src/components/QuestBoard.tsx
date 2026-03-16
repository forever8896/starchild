/**
 * QuestBoard.tsx — Quest management with CRUD operations
 *
 * Usage:
 *   <QuestBoard />
 *
 * Lists active and completed quests, allows creating new quests,
 * completing them (earning XP), and deleting them.
 */

import React, { useEffect, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { type Quest } from '../store'
import { useAppStore } from '../store'
import { mintAttestation, MILESTONES } from '../chain'
import QuestSuggestions from './QuestSuggestions'
import questBoardBg from '../assets/quest-board-bg.png'

// ─── Constants ──────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'health', label: 'Health', accent: 'var(--accent-mint)' },
  { value: 'career', label: 'Career', accent: 'var(--accent-sky)' },
  { value: 'learning', label: 'Learning', accent: 'var(--accent-gold)' },
  { value: 'relationships', label: 'Relationships', accent: 'var(--accent-rose)' },
  { value: 'creative', label: 'Creative', accent: 'var(--accent-lavender)' },
] as const

const QUEST_TYPES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
] as const

function getCategoryStyle(category: string | null): React.CSSProperties {
  const accent = CATEGORIES.find((c) => c.value === category)?.accent ?? 'var(--text-muted)'
  return {
    color: accent,
    backgroundColor: `color-mix(in srgb, ${accent} 15%, transparent)`,
    borderColor: `color-mix(in srgb, ${accent} 35%, transparent)`,
  }
}

function getCategoryLabel(category: string | null): string {
  const found = CATEGORIES.find((c) => c.value === category)
  return found?.label ?? 'General'
}

// ─── Create Quest Form ──────────────────────────────────────────────────────

interface CreateFormProps {
  onCreated: () => void
  onCancel: () => void
}

function CreateQuestForm({ onCreated, onCancel }: CreateFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [questType, setQuestType] = useState('daily')
  const [category, setCategory] = useState('health')
  const [xpReward, setXpReward] = useState(10)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setSubmitting(true)
    try {
      await invoke('create_quest', {
        request: {
          title: title.trim(),
          description: description.trim() || null,
          quest_type: questType,
          category,
          xp_reward: xpReward,
          due_at: null,
        },
      })
      onCreated()
    } catch (err) {
      console.error('Failed to create quest:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-card)', border: '2px solid var(--outline)' }}>
      <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>New Quest</h3>

      <input
        type="text"
        placeholder="Quest title..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        className="px-3 py-2 rounded-lg text-sm focus:outline-none" style={{ backgroundColor: 'var(--bg-input)', border: '1.5px solid var(--outline)', color: 'var(--text-primary)' }} data-class=""
        autoFocus
      />

      <textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="px-3 py-2 rounded-lg text-sm focus:outline-none" style={{ backgroundColor: 'var(--bg-input)', border: '1.5px solid var(--outline)', color: 'var(--text-primary)' }} data-class=" resize-none"
      />

      <div className="flex gap-3">
        {/* Category */}
        <div className="flex-1">
          <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none" style={{ backgroundColor: 'var(--bg-input)', border: '1.5px solid var(--outline)', color: 'var(--text-primary)' }}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Type */}
        <div className="flex-1">
          <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Type</label>
          <select
            value={questType}
            onChange={(e) => setQuestType(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none" style={{ backgroundColor: 'var(--bg-input)', border: '1.5px solid var(--outline)', color: 'var(--text-primary)' }}
          >
            {QUEST_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* XP */}
        <div className="w-20">
          <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>XP</label>
          <input
            type="number"
            min={1}
            max={100}
            value={xpReward}
            onChange={(e) => setXpReward(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none" style={{ backgroundColor: 'var(--bg-input)', border: '1.5px solid var(--outline)', color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm transition-opacity hover:opacity-70"
          style={{ color: 'var(--text-muted)' }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim() || submitting}
          className="px-4 py-1.5 text-sm font-medium rounded-xl transition-all press-scale disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--accent-lavender)', color: '#1a1525' }}
        >
          {submitting ? 'Creating...' : 'Create Quest'}
        </button>
      </div>
    </form>
  )
}

// ─── Quest Card ─────────────────────────────────────────────────────────────

interface QuestCardProps {
  quest: Quest
  onComplete: (id: string) => void
  onDelete: (id: string) => void
}

function QuestCard({ quest, onComplete, onDelete }: QuestCardProps) {
  const isCompleted = quest.status === 'completed'

  return (
    <div
      className="flex items-start gap-3 p-3 rounded-xl transition-all"
      style={{
        backgroundColor: isCompleted ? 'var(--bg-primary)' : 'var(--bg-card)',
        border: `1.5px solid var(--outline)`,
        opacity: isCompleted ? 0.6 : 1,
      }}
    >
      {/* Checkbox / complete button */}
      <button
        onClick={() => !isCompleted && onComplete(quest.id)}
        disabled={isCompleted}
        className="flex items-center justify-center w-5 h-5 mt-0.5 rounded shrink-0 transition-all press-scale"
        style={{
          border: `2px solid ${isCompleted ? 'var(--accent-lavender)' : 'var(--outline-strong)'}`,
          backgroundColor: isCompleted ? 'rgba(184, 160, 216, 0.2)' : 'transparent',
          cursor: isCompleted ? 'default' : 'pointer',
        }}
        aria-label={isCompleted ? 'Completed' : 'Mark complete'}
      >
        {isCompleted && (
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--accent-lavender)' }}>
            <path d="M2 6l3 3 5-5" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-medium"
            style={{
              color: isCompleted ? 'var(--text-muted)' : 'var(--text-primary)',
              textDecoration: isCompleted ? 'line-through' : 'none',
            }}
          >
            {quest.title}
          </span>
          <span
            className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded border"
            style={getCategoryStyle(quest.category)}
          >
            {getCategoryLabel(quest.category)}
          </span>
        </div>

        {quest.description && (
          <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{quest.description}</p>
        )}

        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{quest.quest_type}</span>
          <span className="text-[10px]" style={{ color: 'var(--accent-lavender)' }}>+{quest.xp_reward} XP</span>
          {quest.streak_count > 0 && (
            <span className="text-[10px]" style={{ color: 'var(--accent-peach)' }}>
              {quest.streak_count} streak
            </span>
          )}
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={() => onDelete(quest.id)}
        className="hover:opacity-70 transition-opacity p-1"
        style={{ color: 'var(--text-muted)' }}
        aria-label="Delete quest"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  )
}

// ─── Milestone Toast ─────────────────────────────────────────────────────────

function MilestoneToast({
  milestone,
  onMint,
  onDismiss,
}: {
  milestone: string
  onMint: () => void
  onDismiss: () => void
}) {
  const info = MILESTONES[milestone]
  const [minting, setMinting] = useState(false)
  const [result, setResult] = useState<'success' | 'error' | null>(null)

  const handleMint = async () => {
    setMinting(true)
    try {
      await mintAttestation(milestone)
      setResult('success')
      setTimeout(onDismiss, 2000)
    } catch (err) {
      console.error('Failed to mint attestation:', err)
      setResult('error')
    } finally {
      setMinting(false)
    }
  }

  return (
    <div className="p-4 rounded-xl flex flex-col gap-2 animate-in" style={{ backgroundColor: 'var(--bg-card)', border: '2px solid var(--accent-lavender)', boxShadow: '0 0 20px var(--glow-lavender)' }}>
      <div className="flex items-center gap-2">
        <span className="text-lg">✦</span>
        <span className="text-sm font-semibold" style={{ color: 'var(--accent-lavender)' }}>
          Achievement Unlocked!
        </span>
      </div>
      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{info?.label ?? milestone}</p>
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{info?.description ?? 'A new milestone reached'}</p>

      {result === 'success' ? (
        <p className="text-xs font-medium" style={{ color: 'var(--accent-mint)' }}>Attestation minted on-chain!</p>
      ) : result === 'error' ? (
        <p className="text-xs font-medium" style={{ color: 'var(--accent-rose)' }}>
          Minting failed. You can try again from Profile.
        </p>
      ) : (
        <div className="flex gap-2 mt-1">
          <button
            onClick={handleMint}
            disabled={minting}
            className="px-3 py-1.5 text-xs font-medium rounded-xl transition-all press-scale disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent-lavender)', color: '#1a1525' }}
          >
            {minting ? 'Minting...' : 'Mint On-Chain'}
          </button>
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 text-xs transition-opacity hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
          >
            Later
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function QuestBoard() {
  const [quests, setQuests] = useState<Quest[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [filter, setFilter] = useState<'active' | 'completed' | 'all'>('active')
  const [loading, setLoading] = useState(true)
  const setStarchildState = useAppStore((s) => s.setStarchildState)
  const setHasQuests = useAppStore((s) => s.setHasQuests)

  const loadQuests = useCallback(async (statusFilter: string | null) => {
    try {
      const result = await invoke<Quest[]>('get_quests', { status: statusFilter })
      setQuests(result)
      if (result.length > 0) setHasQuests(true)
    } catch (err) {
      console.error('Failed to load quests:', err)
    } finally {
      setLoading(false)
    }
  }, [setHasQuests])

  useEffect(() => {
    const status = filter === 'all' ? null : filter
    loadQuests(status)
  }, [filter, loadQuests])

  const setPendingMilestones = useAppStore((s) => s.setPendingMilestones)
  const pendingMilestones = useAppStore((s) => s.pendingMilestones)

  const handleComplete = async (id: string) => {
    try {
      const result = await invoke<{
        quest: Quest
        starchild_state: { hunger: number; mood: string; energy: number; bond: number; xp: number; level: number }
        levelled_up: boolean
        milestones: string[]
      }>('complete_quest', { id })

      setStarchildState(result.starchild_state)
      loadQuests(filter === 'all' ? null : filter)

      // If milestones were achieved, show them
      if (result.milestones.length > 0) {
        setPendingMilestones([...pendingMilestones, ...result.milestones])
      }
    } catch (err) {
      console.error('Failed to complete quest:', err)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await invoke('delete_quest', { id })
      loadQuests(filter === 'all' ? null : filter)
    } catch (err) {
      console.error('Failed to delete quest:', err)
    }
  }

  const handleCreated = () => {
    setShowCreate(false)
    loadQuests(filter === 'all' ? null : filter)
  }

  const activeCount = quests.filter((q) => q.status === 'active').length
  const completedCount = quests.filter((q) => q.status === 'completed').length

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-deep)' }}>
      {/* Header */}
      <div className="relative overflow-hidden" style={{ borderBottom: '2px solid var(--outline)' }}>
        {/* Constellation background */}
        <img
          src={questBoardBg}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-20"
          draggable={false}
          aria-hidden="true"
        />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 0%, var(--bg-deep) 100%)' }} />

        <div className="relative flex items-center justify-between px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Quest Board</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {activeCount} active · {completedCount} completed
            </p>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-xl transition-all press-scale"
            style={{ color: 'var(--accent-lavender)', backgroundColor: 'var(--glow-lavender)', border: '1.5px solid var(--outline)' }}
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3v10M3 8h10" />
            </svg>
            New Quest
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Milestone toasts */}
        {pendingMilestones.length > 0 && (
          <div className="flex flex-col gap-2 mb-4">
            {pendingMilestones.map((m) => (
              <MilestoneToast
                key={m}
                milestone={m}
                onMint={() => {}}
                onDismiss={() => {
                  const dismissMilestone = useAppStore.getState().dismissMilestone
                  dismissMilestone(m)
                }}
              />
            ))}
          </div>
        )}

        {/* Starchild suggestions */}
        <div className="mb-4">
          <QuestSuggestions onQuestCreated={() => loadQuests(filter === 'all' ? null : filter)} />
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="mb-4">
            <CreateQuestForm onCreated={handleCreated} onCancel={() => setShowCreate(false)} />
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit" style={{ backgroundColor: 'var(--bg-primary)', border: '1.5px solid var(--outline)' }}>
          {(['active', 'completed', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1 text-xs font-medium rounded-lg transition-all capitalize press-scale"
              style={
                filter === f
                  ? { backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }
                  : { color: 'var(--text-muted)' }
              }
            >
              {f}
            </button>
          ))}
        </div>

        {/* Quest list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 rounded-full animate-spin" style={{ border: '2px solid var(--outline)', borderTopColor: 'var(--accent-lavender)' }} />
          </div>
        ) : quests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="text-3xl opacity-30">
              {filter === 'completed' ? '◈' : '✦'}
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {filter === 'completed'
                ? 'No completed quests yet. Keep going!'
                : 'No active quests. Create one to start growing!'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {quests.map((quest) => (
              <QuestCard
                key={quest.id}
                quest={quest}
                onComplete={handleComplete}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
