// web/src/feedback.ts — client side of the gated feedback loop.
//
// The feedback form (FeedbackForm.tsx) collects voluntary feedback and POSTs it
// to the in-house `/api/feedback` endpoint (dev: web/dev-proxy.ts · prod:
// web/api/feedback.ts), which relays it to the operator so it can be rewarded
// from the incentive fund. The flag keys below live in the same IndexedDB
// settings store as the rest of the web shell's flags (read/written through the
// shared `Platform` seam — never IndexedDB directly).

/** Set to 'true' once the human has completed their first quest. */
export const FEEDBACK_UNLOCKED_KEY = 'feedback_unlocked'
/** Set to 'true' after a successful submission (so the nudge never returns). */
export const FEEDBACK_SUBMITTED_KEY = 'feedback_submitted'
/** Set to 'true' once the one-time unlock nudge has been shown/dismissed. */
export const FEEDBACK_NUDGE_SEEN_KEY = 'feedback_nudge_seen'

/** The unlock milestone, sent as context so submissions are legible. */
export const FEEDBACK_STAGE = 'first-quest-completed'

export interface FeedbackInput {
  rating: number | null
  message: string
  contact: string
}

export interface FeedbackContext {
  stage: string
  completedQuests: number
}

/** POST feedback to the in-house endpoint. Throws a readable Error on failure. */
export async function submitFeedback(
  input: FeedbackInput,
  context: FeedbackContext,
): Promise<void> {
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rating: input.rating,
      message: input.message.trim(),
      contact: input.contact.trim() || null,
      context,
    }),
  })
  if (res.ok) return

  let msg = `Could not send feedback (${res.status}).`
  try {
    const j = (await res.json()) as { error?: string }
    if (j?.error) msg = j.error
  } catch {
    // keep the default message
  }
  throw new Error(msg)
}
