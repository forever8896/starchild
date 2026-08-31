// web/api/stt.ts — Trial speech-to-text (mic → Venice Whisper) relay.
//
// Lets trial users SPEAK to their Starchild: the browser records WAV, POSTs the
// raw bytes here, and gets `{ text }` back (BYOK talks to Venice directly with
// the user's key). The model is pinned server-side; the key never leaves.
//
// PRIVACY: this is the USER'S OWN VOICE — the most intimate content in the app —
// and there is no E2EE transcription enclave, so audio transits in plaintext to
// Venice Whisper. It is inherently opt-in twice over (the mic button is an
// explicit act, and the browser demands mic permission), and the Settings voice
// card states it plainly. NOTHING is logged here — no audio, no text, ever.
//
// COST: whisper-large-v3 ≈ $0.0001/audio-second (a 30s message ≈ 0.03¢) —
// far cheaper than TTS. Still metered into the shared monthly ceiling and
// per-IP rate limited, sized-capped to keep abuse boring.
//
// ── Environment ──────────────────────────────────────────────────────────────
//   VENICE_TRIAL_KEY          (required) same demo key as /api/proxy.
//   UPSTASH_REDIS_REST_URL    (required) shared limits state (fail-closed).
//   UPSTASH_REDIS_REST_TOKEN  (required)
//   TRIAL_STT_MODEL           (optional) default openai/whisper-large-v3.
//   TRIAL_STT_MAX_BYTES       (optional) per-request audio cap. Def 12MB (~2min WAV).
//   TRIAL_STT_RATE_LIMIT      (optional) requests per IP per hour. Def 30.
//   TRIAL_STT_USD_PER_SEC     (optional) $ per audio second for metering. Def 0.0001.
//   TRIAL_MONTHLY_BUDGET_USD  (optional) shared ceiling (same as proxy). Def 50.
//   VENICE_BASE_URL           (optional) default https://api.venice.ai/api/v1.
//   TRIAL_ALLOWED_ORIGIN      (optional) CORS origin. Default: none (same-origin).

export const config = { runtime: 'edge' }

const VENICE_BASE_URL = process.env.VENICE_BASE_URL ?? 'https://api.venice.ai/api/v1'
const STT_MODEL = process.env.TRIAL_STT_MODEL ?? 'openai/whisper-large-v3'
const MAX_BYTES = int(process.env.TRIAL_STT_MAX_BYTES, 12 * 1024 * 1024)
const RATE_LIMIT = int(process.env.TRIAL_STT_RATE_LIMIT, 30)
const RATE_WINDOW_SEC = 3600
const USD_PER_SEC = num(process.env.TRIAL_STT_USD_PER_SEC, 0.0001)
const MONTHLY_BUDGET_USD = num(process.env.TRIAL_MONTHLY_BUDGET_USD, 50)
const ALLOWED_ORIGIN = process.env.TRIAL_ALLOWED_ORIGIN ?? ''

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

// 16-bit mono 44.1 kHz WAV ≈ 88,200 bytes/second — good enough for metering.
const WAV_BYTES_PER_SEC = 88_200

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const key = process.env.VENICE_TRIAL_KEY
  if (!key || !REDIS_URL || !REDIS_TOKEN) return json({ error: 'transcription unavailable' }, 503)

  const audio = new Uint8Array(await req.arrayBuffer())
  if (audio.length < 128) return json({ error: 'audio required' }, 400)
  if (audio.length > MAX_BYTES) return json({ error: 'audio too long' }, 400)

  const ip = clientIp(req)

  // 1) Per-IP rate limit.
  try {
    const n = await redisIncrTtl(`stt:rl:${ip}`, RATE_WINDOW_SEC)
    if (n > RATE_LIMIT) {
      return json({ error: 'rate limited' }, 429, { 'Retry-After': String(RATE_WINDOW_SEC) })
    }
  } catch {
    return json({ error: 'transcription unavailable' }, 503)
  }

  // 2) Shared monthly ceiling.
  try {
    const spent = await redisGetNum(budgetKey())
    if (spent >= MONTHLY_BUDGET_USD) return json({ error: 'transcription resting' }, 503)
  } catch {
    return json({ error: 'transcription unavailable' }, 503)
  }

  // 3) Meter by estimated duration (size is known up front), then transcribe.
  try {
    const seconds = audio.length / WAV_BYTES_PER_SEC
    await redisIncrByFloat(budgetKey(), seconds * USD_PER_SEC, monthTtlSec())
  } catch {
    // Best-effort metering; the Venice key's own cap is the hard backstop.
  }

  const form = new FormData()
  form.append('file', new Blob([audio], { type: 'application/octet-stream' }), 'speech.wav')
  form.append('model', STT_MODEL)

  const upstream = await fetch(`${VENICE_BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })

  if (!upstream.ok) {
    console.error('stt upstream error', upstream.status) // status only — never content
    return json({ error: 'transcription failed' }, 502)
  }

  let text = ''
  try {
    const out = (await upstream.json()) as { text?: unknown }
    text = typeof out?.text === 'string' ? out.text : ''
  } catch {
    return json({ error: 'transcription failed' }, 502)
  }

  return json({ text }, 200)
}

// ── Upstash Redis over REST (edge-safe; mirrors tts.ts) ─────────────────────
async function redisCmd(cmd: (string | number)[]): Promise<unknown> {
  const res = await fetch(REDIS_URL as string, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  })
  if (!res.ok) throw new Error(`redis ${res.status}`)
  return (await res.json()).result
}
async function redisIncrTtl(k: string, ttlSec: number): Promise<number> {
  const n = Number(await redisCmd(['INCR', k]))
  if (n === 1) await redisCmd(['EXPIRE', k, ttlSec])
  return n
}
async function redisGetNum(k: string): Promise<number> {
  const v = await redisCmd(['GET', k])
  return v == null ? 0 : Number(v)
}
async function redisIncrByFloat(k: string, by: number, ttlSec: number): Promise<void> {
  const v = await redisCmd(['INCRBYFLOAT', k, by])
  if (Math.abs(Number(v) - by) < 1e-9) await redisCmd(['EXPIRE', k, ttlSec])
}

// ── Small helpers (mirror proxy.ts / tts.ts) ─────────────────────────────────
function budgetKey(): string {
  const d = new Date()
  return `trial:budget:${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
function monthTtlSec(): number {
  return 62 * 24 * 3600
}
function clientIp(req: Request): string {
  const real = req.headers.get('x-real-ip')?.trim()
  if (real) return real
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) {
    const hops = fwd.split(',').map((s) => s.trim()).filter(Boolean)
    if (hops.length > 0) return hops[hops.length - 1]
  }
  return 'unknown'
}
function cors(): Record<string, string> {
  if (!ALLOWED_ORIGIN) return {}
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}
function json(obj: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors(), 'Content-Type': 'application/json', ...extra },
  })
}
function int(v: string | undefined, d: number): number {
  const n = v ? parseInt(v, 10) : NaN
  return Number.isFinite(n) ? n : d
}
function num(v: string | undefined, d: number): number {
  const n = v ? Number(v) : NaN
  return Number.isFinite(n) ? n : d
}
