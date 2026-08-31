// web/api/feedback.ts — in-house feedback sink (web launch: the first usage of
// the Starchild incentive fund).
//
// The web app's GATED feedback form (unlocks after the first completed quest)
// POSTs here. We forward each submission to a single destination webhook the
// operator configures in env — a Telegram bot, or a Discord/Slack incoming
// webhook — so feedback lands somewhere Kilian reads and can reward from the
// incentive fund. We never STORE or LOG feedback content here; we only relay it.
// If no destination is configured we fail CLOSED.
//
// ── Environment variables ────────────────────────────────────────────────────
//   FEEDBACK_WEBHOOK_URL      (required) Destination. A Telegram bot
//                             `…/botXXX/sendMessage` URL, or a Discord/Slack
//                             incoming webhook URL.
//   FEEDBACK_TELEGRAM_CHAT_ID (required iff the URL is a Telegram bot) chat id.
//   FEEDBACK_ALLOWED_ORIGIN   (optional) CORS origin to allow. Default '*'.
//
// Deploys as a Vercel Edge Function (Web `Request`/`Response`), beside the
// sponsored-demo proxy.

import {
  cleanFeedback,
  formatFeedback,
  webhookRequest,
  type FeedbackBody,
} from './format-feedback'

export const config = { runtime: 'edge' }

const ALLOWED_ORIGIN = process.env.FEEDBACK_ALLOWED_ORIGIN ?? '*'

function cors(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  // No destination configured → fail closed (never silently swallow feedback).
  const webhookUrl = process.env.FEEDBACK_WEBHOOK_URL
  if (!webhookUrl) return json({ error: 'feedback unavailable' }, 503)

  let body: FeedbackBody
  try {
    body = (await req.json()) as FeedbackBody
  } catch {
    return json({ error: 'invalid json' }, 400)
  }

  let clean
  try {
    clean = cleanFeedback(body)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'invalid feedback' }, 400)
  }

  const text = formatFeedback(clean)
  const { body: outBody, headers } = webhookRequest(
    webhookUrl,
    process.env.FEEDBACK_TELEGRAM_CHAT_ID,
    text,
  )

  try {
    const res = await fetch(webhookUrl, { method: 'POST', headers, body: outBody })
    if (!res.ok) return json({ error: 'delivery failed' }, 502)
  } catch {
    return json({ error: 'delivery failed' }, 502)
  }

  return json({ ok: true })
}
