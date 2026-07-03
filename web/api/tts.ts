// web/api/tts.ts — Trial voice (TTS) proxy.
//
// Speaks the Starchild's replies aloud for trial users (BYOK talks to Venice
// directly with the user's key). The browser sends the ASSISTANT's text — the
// UI never sends the user's own messages here — and gets audio/mpeg back.
//
// PRIVACY: there is no E2EE TTS enclave, so this text transits in plaintext.
// Contract mirrors /api/proxy: the key stays server-side, NOTHING is logged
// (no text, ever — only anonymous counters), the model + voice list are pinned.
//
// COST: TTS is ~20× inference per reply (~$62.5/M chars), so spend is metered
// into the SAME monthly USD ceiling as inference (`trial:budget:YYYY-MM`) and
// per-IP rate limited. Over budget → 503; the client degrades to silence.
//
// ── Environment ──────────────────────────────────────────────────────────────
//   VENICE_TRIAL_KEY          (required) same demo key as /api/proxy.
//   UPSTASH_REDIS_REST_URL    (required) shared limits state (fail-closed).
//   UPSTASH_REDIS_REST_TOKEN  (required)
//   TRIAL_TTS_MODEL           (optional) default tts-elevenlabs-turbo-v2-5.
//   TRIAL_TTS_MAX_CHARS       (optional) per-request text cap. Def 1200.
//   TRIAL_TTS_RATE_LIMIT      (optional) requests per IP per hour. Def 40.
//   TRIAL_TTS_USD_PER_MCHAR   (optional) $ per 1M chars for metering. Def 62.5.
//   TRIAL_MONTHLY_BUDGET_USD  (optional) shared ceiling (same as proxy). Def 50.
//   VENICE_BASE_URL           (optional) default https://api.venice.ai/api/v1.
//   TRIAL_ALLOWED_ORIGIN      (optional) CORS origin. Default: none (same-origin).

export const config = { runtime: 'edge' }

const VENICE_BASE_URL = process.env.VENICE_BASE_URL ?? 'https://api.venice.ai/api/v1'
const TTS_MODEL = process.env.TRIAL_TTS_MODEL ?? 'tts-elevenlabs-turbo-v2-5'
const MAX_CHARS = int(process.env.TRIAL_TTS_MAX_CHARS, 1200)
const RATE_LIMIT = int(process.env.TRIAL_TTS_RATE_LIMIT, 40)
const RATE_WINDOW_SEC = 3600
const USD_PER_MCHAR = num(process.env.TRIAL_TTS_USD_PER_MCHAR, 62.5)
const MONTHLY_BUDGET_USD = num(process.env.TRIAL_MONTHLY_BUDGET_USD, 50)
const ALLOWED_ORIGIN = process.env.TRIAL_ALLOWED_ORIGIN ?? ''

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

// Pinned voice list (tts-elevenlabs-turbo-v2-5) — the client can't pick models,
// only one of these names.
const VOICES = new Set([
  'Alice', 'Aria', 'Bill', 'Brian', 'Callum', 'Charlie', 'Charlotte',
  'Chris', 'Daniel', 'Eric', 'George', 'Jessica', 'Laura', 'Liam',
  'Lily', 'Matilda', 'Rachel', 'River', 'Roger', 'Sarah', 'Will',
])
const DEFAULT_VOICE = 'Lily'

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const key = process.env.VENICE_TRIAL_KEY
  // Voice costs real money — limits need shared state; fail closed like /api/proxy.
  if (!key || !REDIS_URL || !REDIS_TOKEN) return json({ error: 'voice unavailable' }, 503)

  let body: { text?: unknown; voice?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid json' }, 400)
  }
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) return json({ error: 'text required' }, 400)
  if (text.length > MAX_CHARS) return json({ error: 'text too long' }, 400)
  const voice = typeof body?.voice === 'string' && VOICES.has(body.voice) ? body.voice : DEFAULT_VOICE

  const ip = clientIp(req)

  // 1) Per-IP rate limit.
  try {
    const n = await redisIncrTtl(`tts:rl:${ip}`, RATE_WINDOW_SEC)
    if (n > RATE_LIMIT) {
      return json({ error: 'rate limited' }, 429, { 'Retry-After': String(RATE_WINDOW_SEC) })
    }
  } catch {
    return json({ error: 'voice unavailable' }, 503)
  }

  // 2) Shared monthly ceiling (same counter inference bills into).
  try {
    const spent = await redisGetNum(budgetKey())
    if (spent >= MONTHLY_BUDGET_USD) return json({ error: 'voice resting' }, 503)
  } catch {
    return json({ error: 'voice unavailable' }, 503)
  }

  // 3) Speak. Character count is known up front — bill it before the call
  //    (unlike inference there's no usage chunk to sniff).
  try {
    await redisIncrByFloat(budgetKey(), (text.length / 1_000_000) * USD_PER_MCHAR, monthTtlSec())
  } catch {
    // Best-effort metering; the Venice key's own cap is the hard backstop.
  }

  const upstream = await fetch(`${VENICE_BASE_URL}/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: text, model: TTS_MODEL, voice, response_format: 'mp3' }),
  })

  if (!upstream.ok || !upstream.body) {
    console.error('tts upstream error', upstream.status) // status only — never text
    return json({ error: 'voice failed' }, 502)
  }

  return new Response(upstream.body, {
    status: 200,
    headers: { ...cors(), 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
  })
}

// ── Upstash Redis over REST (edge-safe) ──────────────────────────────────────
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

// ── Small helpers (mirror proxy.ts) ──────────────────────────────────────────
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
