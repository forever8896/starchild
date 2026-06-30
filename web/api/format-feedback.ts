// web/api/format-feedback.ts — runtime-agnostic helpers for the feedback sink.
//
// Pure string functions only (no Node/edge APIs) so BOTH the production edge
// function (api/feedback.ts) and the dev middleware (dev-proxy.ts) can import
// them, keeping validation + formatting identical in dev and prod.

export interface FeedbackBody {
  rating?: unknown
  message?: unknown
  contact?: unknown
  context?: { stage?: unknown; completedQuests?: unknown }
}

export interface CleanFeedback {
  rating: number | null
  message: string
  contact: string | null
  stage: string
  completedQuests: number | null
}

export const MAX_MESSAGE = 4000
export const MAX_CONTACT = 200

/** Validate + normalize an incoming feedback body. Throws on invalid input. */
export function cleanFeedback(body: FeedbackBody): CleanFeedback {
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) throw new Error('message is required')
  if (message.length > MAX_MESSAGE) throw new Error('message too long')

  let rating: number | null = null
  if (typeof body.rating === 'number' && Number.isFinite(body.rating)) {
    rating = Math.min(5, Math.max(1, Math.round(body.rating)))
  }

  let contact: string | null = null
  if (typeof body.contact === 'string' && body.contact.trim()) {
    contact = body.contact.trim().slice(0, MAX_CONTACT)
  }

  const stage = typeof body.context?.stage === 'string' ? body.context.stage : 'unknown'
  const completedQuests =
    typeof body.context?.completedQuests === 'number' &&
    Number.isFinite(body.context.completedQuests)
      ? body.context.completedQuests
      : null

  return { rating, message, contact, stage, completedQuests }
}

/** Human-readable message for a chat/webhook destination. */
export function formatFeedback(f: CleanFeedback): string {
  const quests =
    f.completedQuests != null
      ? ` (${f.completedQuests} quest${f.completedQuests === 1 ? '' : 's'} done)`
      : ''
  return [
    '🌟 New Starchild feedback',
    `Rating: ${f.rating != null ? `${f.rating}/5` : '—'}`,
    `Stage: ${f.stage}${quests}`,
    `Reward to: ${f.contact ?? '(none given)'}`,
    '',
    f.message,
  ].join('\n')
}

/** Build the POST body for the configured webhook (Telegram vs generic). */
export function webhookRequest(
  webhookUrl: string,
  telegramChatId: string | undefined,
  text: string,
): { body: string; headers: Record<string, string> } {
  const headers = { 'Content-Type': 'application/json' }
  if (webhookUrl.includes('api.telegram.org')) {
    return {
      headers,
      body: JSON.stringify({ chat_id: telegramChatId, text, disable_web_page_preview: true }),
    }
  }
  // Discord uses `content`, Slack uses `text`; sending both satisfies either.
  return { headers, body: JSON.stringify({ content: text, text }) }
}
