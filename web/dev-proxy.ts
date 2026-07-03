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
          // E2EE: relay ciphertext to the enclave, injecting the TEE headers.
          const e2ee = body.e2ee === true
          const model = e2ee
            ? (process.env.TRIAL_E2EE_MODEL || 'e2ee-glm-4-7-p')
            : (process.env.TRIAL_MODEL || 'llama-3.3-70b')
          const headers: Record<string, string> = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
          if (e2ee) {
            headers['X-Venice-TEE-Client-Pub-Key'] = String(body.clientPubHex || '')
            headers['X-Venice-TEE-Model-Pub-Key'] = String(body.modelPubHex || '')
            headers['X-Venice-TEE-Signing-Algo'] = 'ecdsa'
          }
          const upstream = await fetch('https://api.venice.ai/api/v1/chat/completions', {
            method: 'POST',
            headers,
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

      // Dev attestation relay (prod: web/api/attest.ts). Injects the trial key
      // and fetches Venice's TEE attestation so the browser can establish an
      // E2EE session in `npm run dev`.
      server.middlewares.use('/api/attest', async (req, res) => {
        if (req.method !== 'GET') { res.statusCode = 405; res.end(); return }
        const key = process.env.VENICE_TRIAL_KEY
        const send = (status: number, obj: unknown) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(obj))
        }
        if (!key) { send(503, { error: 'trial unavailable' }); return }
        try {
          const u = new URL(req.url || '', 'http://localhost')
          const model = u.searchParams.get('model') || 'e2ee-glm-4-7-p'
          const nonce = u.searchParams.get('nonce') || ''
          if (!/^[0-9a-fA-F]{16,128}$/.test(nonce)) { send(400, { error: 'valid hex nonce required' }); return }
          const upstream = await fetch(
            `https://api.venice.ai/api/v1/tee/attestation?model=${encodeURIComponent(model)}&nonce=${encodeURIComponent(nonce)}`,
            { headers: { Authorization: `Bearer ${key}` } },
          )
          if (!upstream.ok) { send(502, { error: 'attestation failed' }); return }
          const att = await upstream.json() as Record<string, any>
          send(200, {
            signing_public_key: att.signing_public_key ?? att.signing_key ?? null,
            verified: att.verified ?? null,
            nonce: att.nonce ?? att.request_nonce ?? null,
            model: att.model ?? model,
            stale_after: att.stale_after ?? att.freshness?.stale_after ?? null,
            tee_hardware: att.tee_hardware ?? null,
            upstream_model: att.upstream_model ?? null,
            signing_address: att.signing_address ?? null,
            server_verification: att.server_verification ?? null,
          })
        } catch (e) {
          send(502, { error: e instanceof Error ? e.message : 'attestation failed' })
        }
      })

      // Dev voice relay (prod: web/api/tts.ts). Injects the trial key and calls
      // Venice TTS so the Starchild speaks in `npm run dev`. Text is never logged.
      server.middlewares.use('/api/tts', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        const key = process.env.VENICE_TRIAL_KEY
        const send = (status: number, obj: unknown) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(obj))
        }
        if (!key) { send(503, { error: 'voice unavailable' }); return }
        try {
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const body = JSON.parse(Buffer.concat(chunks).toString() || '{}')
          const text = typeof body.text === 'string' ? body.text.trim() : ''
          if (!text || text.length > 1200) { send(400, { error: 'text required (≤1200 chars)' }); return }
          const upstream = await fetch('https://api.venice.ai/api/v1/audio/speech', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              input: text,
              model: process.env.TRIAL_TTS_MODEL || 'tts-minimax-speech-02-hd',
              voice: typeof body.voice === 'string' && body.voice ? body.voice : 'YoungKnight',
              response_format: 'mp3',
            }),
          })
          if (!upstream.ok || !upstream.body) { send(502, { error: 'voice failed' }); return }
          res.statusCode = 200
          res.setHeader('content-type', 'audio/mpeg')
          const reader = upstream.body.getReader()
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            res.write(Buffer.from(value))
          }
          res.end()
        } catch (e) {
          send(502, { error: e instanceof Error ? e.message : 'dev tts failed' })
        }
      })

      // Dev transcription relay (prod: web/api/stt.ts). Raw WAV bytes in →
      // Venice Whisper → { text }. Neither audio nor text is ever logged.
      server.middlewares.use('/api/stt', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        const key = process.env.VENICE_TRIAL_KEY
        const send = (status: number, obj: unknown) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(obj))
        }
        if (!key) { send(503, { error: 'transcription unavailable' }); return }
        try {
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const audio = Buffer.concat(chunks)
          if (audio.length < 128 || audio.length > 12 * 1024 * 1024) {
            send(400, { error: 'audio required (≤12MB)' }); return
          }
          const form = new FormData()
          form.append('file', new Blob([new Uint8Array(audio)], { type: 'application/octet-stream' }), 'speech.wav')
          form.append('model', process.env.TRIAL_STT_MODEL || 'openai/whisper-large-v3')
          const upstream = await fetch('https://api.venice.ai/api/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}` },
            body: form,
          })
          if (!upstream.ok) { send(502, { error: 'transcription failed' }); return }
          const out = await upstream.json() as { text?: unknown }
          send(200, { text: typeof out?.text === 'string' ? out.text : '' })
        } catch (e) {
          send(502, { error: e instanceof Error ? e.message : 'dev stt failed' })
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
