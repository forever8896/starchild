/**
 * FeedbackForm.tsx — the web shell's gated feedback panel.
 *
 * This is the web launch's first usage of the Starchild incentive fund: it
 * unlocks only AFTER the human has completed their first quest (App.tsx gates on
 * the `quest-completed` event + the persisted `feedback_unlocked` flag), so
 * feedback comes from people who actually went through the experience — which is
 * the feedback worth rewarding, and the gate kills drive-by spam on its own.
 *
 * Submissions POST to the in-house `/api/feedback` endpoint (see web/api). This
 * is a web-only adapter component (PRD §4.2), so it talks to `submitFeedback`
 * directly rather than widening the shared `Platform` seam; it still reads/writes
 * flags only through `usePlatform()`.
 *
 * Privacy: voluntary, and only what the human types here leaves the device — no
 * conversation content, no telemetry. Consistent with the product promise.
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { usePlatform } from '../../src/platform/usePlatform'
import { submitFeedback, FEEDBACK_STAGE, FEEDBACK_SUBMITTED_KEY } from './feedback'

function CloseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

type Status = 'idle' | 'sending' | 'done' | 'error'

export default function FeedbackForm({ onClose }: { onClose: () => void }) {
  const platform = usePlatform()
  const [rating, setRating] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [completedQuests, setCompletedQuests] = useState(0)

  // Context only — the count of completed quests, never conversation content.
  useEffect(() => {
    let cancelled = false
    platform
      .getQuests('completed')
      .then((qs) => {
        if (!cancelled) setCompletedQuests(qs.length)
      })
      .catch(() => {
        /* context is best-effort */
      })
    return () => {
      cancelled = true
    }
  }, [platform])

  const canSend = message.trim().length > 0 && status !== 'sending'

  async function handleSubmit() {
    if (!canSend) return
    setStatus('sending')
    setError('')
    try {
      await submitFeedback(
        { rating, message, contact },
        { stage: FEEDBACK_STAGE, completedQuests },
      )
      // Stop the unlock nudge from ever returning.
      await platform.setSetting(FEEDBACK_SUBMITTED_KEY, 'true')
      setStatus('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send feedback.')
      setStatus('error')
    }
  }

  return (
    <div
      className="absolute inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(12,10,20,0.72)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl p-6 flex flex-col gap-5"
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1.5px solid var(--outline)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Shape Starchild
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              You completed your first quest. Tell me what's working and what isn't —
              genuine feedback shapes the core product, and is rewarded from the community
              incentive fund.
            </p>
          </div>
          <button
            onClick={onClose}
            className="clay-nav-button flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {status === 'done' ? (
          <div className="flex flex-col gap-3 py-4 items-center text-center">
            <div className="text-3xl">🌟</div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Thank you — your feedback reached me. If it helps shape Starchild, it gets
              rewarded from the incentive fund.
            </p>
            <button
              onClick={onClose}
              className="mt-2 px-4 py-2 rounded-lg text-sm font-medium"
              style={{ backgroundColor: 'var(--accent-mint)', color: 'var(--bg-deep)' }}
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <label
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'var(--text-muted)' }}
              >
                How is it so far? (optional)
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = rating != null && n <= rating
                  return (
                    <button
                      key={n}
                      onClick={() => setRating(rating === n ? null : n)}
                      className="w-9 h-9 rounded-lg text-sm font-medium transition-all"
                      style={
                        active
                          ? { backgroundColor: 'var(--accent-gold)', color: 'var(--bg-deep)' }
                          : {
                              backgroundColor: 'var(--bg-card)',
                              color: 'var(--text-muted)',
                              border: '1.5px solid var(--outline)',
                            }
                      }
                      aria-label={`${n} out of 5`}
                    >
                      {n}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'var(--text-muted)' }}
              >
                Your feedback
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                maxLength={4000}
                placeholder="What felt good? What was confusing or missing? What would make Starchild more useful to you?"
                className="clay-input w-full resize-none text-sm"
                style={{ padding: '12px' }}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'var(--text-muted)' }}
              >
                Wallet or ENS — optional
              </label>
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                maxLength={200}
                placeholder="0x… or name.eth (so the fund can reward you)"
                className="clay-input w-full text-sm"
                style={{ padding: '10px 12px' }}
              />
            </div>

            {error && (
              <p className="text-xs" style={{ color: 'var(--accent-rose)' }}>
                {error}
              </p>
            )}

            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Voluntary, and only what you type here leaves your device. No conversation
              content, no tracking.
            </p>

            <button
              onClick={handleSubmit}
              disabled={!canSend}
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={
                canSend
                  ? { backgroundColor: 'var(--accent-mint)', color: 'var(--bg-deep)' }
                  : {
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-muted)',
                      cursor: 'not-allowed',
                    }
              }
            >
              {status === 'sending' ? 'Sending…' : 'Send feedback'}
            </button>
          </>
        )}
      </motion.div>
    </div>
  )
}
