import type { Plugin } from 'vite'
import { cleanFeedback, formatFeedback, webhookRequest } from './api/format-feedback'

/**
 * Dev-only sponsored-demo shim (PRD §6.1).
 *
 * In production the sponsored demo is the edge function `web/api/proxy.ts`. The
 * Vite dev server doesn't run that, so this middleware serves `POST /api/proxy`
 * from `VENICE_TRIAL_KEY` — letting the demo work in `npm run dev` WITHOUT the
 * user pasting a key. It mirrors the prod proxy's intent: pins a cheap model,
 * caps tokens, and logs no prompt/response content. If no key is configured it
 * returns a graceful "rest mode" so the UI can prompt for BYOK instead.
 */
export function devProxy(): Plugin {
  return {
    name: 'starchild-dev-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/proxy', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        const key = process.env.VENICE_TRIAL_KEY
        if (!key) {
          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({
            restMode: true,
            message: 'Sponsored demo not configured in dev. Set VENICE_TRIAL_KEY, or add your own Venice key in Settings (BYOK).',
          }))
          return
        }
        try {
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const body = JSON.parse(Buffer.concat(chunks).toString() || '{}')
          const model = process.env.TRIAL_MODEL || 'llama-3.3-70b'
          const upstream = await fetch('https://api.venice.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, messages: body.messages ?? [], stream: true, max_tokens: 600 }),
          })
          res.statusCode = upstream.status
          res.setHeader('content-type', upstream.headers.get('content-type') || 'text/event-stream')
          if (!upstream.body) { res.end(); return }
          const reader = upstream.body.getReader()
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            res.write(Buffer.from(value))
          }
          res.end()
        } catch (e) {
          res.statusCode = 502
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'dev proxy failed' }))
        }
      })

      // Dev sink for the gated feedback form (prod: web/api/feedback.ts). Relays
      // to FEEDBACK_WEBHOOK_URL when set; otherwise logs to the dev console so
      // the form is testable in `npm run dev` without a webhook configured.
      server.middlewares.use('/api/feedback', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        try {
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const body = JSON.parse(Buffer.concat(chunks).toString() || '{}')
          let clean
          try {
            clean = cleanFeedback(body)
          } catch (e) {
            res.statusCode = 400
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'invalid feedback' }))
            return
          }
          const text = formatFeedback(clean)
          const webhookUrl = process.env.FEEDBACK_WEBHOOK_URL
          if (webhookUrl) {
            const { body: outBody, headers } = webhookRequest(
              webhookUrl, process.env.FEEDBACK_TELEGRAM_CHAT_ID, text,
            )
            await fetch(webhookUrl, { method: 'POST', headers, body: outBody }).catch(() => {})
          } else {
            console.log(`\n[dev feedback] (set FEEDBACK_WEBHOOK_URL to forward)\n${text}\n`)
          }
          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
        } catch (e) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'dev feedback failed' }))
        }
      })
    },
  }
}
