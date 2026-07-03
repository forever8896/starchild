// web/api/proxy.ts — Trial inference proxy (PRD §6, tier 1).
//
// A no-friction "first taste" of Starchild that runs on a DEMO Venice key the
// proxy holds server-side. This is the ONLY tier where we sit in the inference
// path; BYOK and lock-$STARCHILD keys talk to Venice directly, E2EE (the proxy
// is bypassed). Because we are briefly in the path here, the contract is strict:
//
//   • The demo key lives in env, server-only — NEVER bundled into client JS.
//   • A single cheap model is pinned; the client cannot pick a pricier one.
//   • Requests are rate-limited per IP.
//   • A monthly USD budget ceiling caps total trial spend; once crossed the
//     proxy returns a calm "rest mode" response instead of calling Venice.
//   • NO prompt or response content is ever logged — only anonymous counters.
//
// Deploys as a Vercel Edge Function (Web `Request`/`Response`, streamable).
//
// ── Environment variables ────────────────────────────────────────────────────
//   VENICE_TRIAL_KEY        (required) Demo Venice inference key. Server-only.
//                           Give it its OWN small Venice consumption cap — that
//                           hard cap at Venice is the ultimate backstop; the
//                           ceiling below is the softer, faster guard.
//   UPSTASH_REDIS_REST_URL  (required) Upstash Redis REST endpoint — shared
//   UPSTASH_REDIS_REST_TOKEN(required) state for per-IP limits + monthly spend.
//                           Without these the limits cannot be enforced; the
//                           proxy then refuses to serve (fail-closed) so a
//                           misconfig can never silently uncap spend.
//   TRIAL_MODEL             (optional) Pinned model id. Default: a cheap one.
//   TRIAL_MAX_TOKENS        (optional) Hard ceiling on completion length. Def 400.
//   TRIAL_RATE_LIMIT        (optional) Max requests per IP per window. Def 20.
//   TRIAL_RATE_WINDOW_SEC   (optional) Rate-limit window seconds. Def 3600.
//   TRIAL_MONTHLY_BUDGET_USD(optional) Monthly spend ceiling. Def 50.
//   TRIAL_USD_PER_MTOK      (optional) Blended $ per 1M tokens, for the spend
//                           estimate. Def 0.7 (cheap model ballpark; tune it).
//   VENICE_BASE_URL         (optional) Override Venice base. Def api.venice.ai.
//   TRIAL_ALLOWED_ORIGIN    (optional) CORS origin to allow. Default: none —
//                           same-origin only (no CORS headers emitted).

export const config = { runtime: 'edge' }

const VENICE_BASE_URL = process.env.VENICE_BASE_URL ?? 'https://api.venice.ai/api/v1'
// Cheapest non-E2EE tier the desktop app already uses for internal tasks.
const MODEL = process.env.TRIAL_MODEL ?? 'llama-3.3-70b'
// The E2EE tier: content is encrypted browser↔enclave (this proxy only injects
// the key + relays ciphertext). Pinned so the client can't request another.
const E2EE_MODEL = process.env.TRIAL_E2EE_MODEL ?? 'e2ee-glm-4-7-p'
const MAX_TOKENS = int(process.env.TRIAL_MAX_TOKENS, 400)
const RATE_LIMIT = int(process.env.TRIAL_RATE_LIMIT, 20)
const RATE_WINDOW_SEC = int(process.env.TRIAL_RATE_WINDOW_SEC, 3600)
const MONTHLY_BUDGET_USD = num(process.env.TRIAL_MONTHLY_BUDGET_USD, 50)
const USD_PER_MTOK = num(process.env.TRIAL_USD_PER_MTOK, 0.7)
const ALLOWED_ORIGIN = process.env.TRIAL_ALLOWED_ORIGIN ?? ''

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  // Limits require shared state. If it's unavailable we fail CLOSED rather than
  // serve uncapped — the trial key is real money.
  if (!VENICE_TRIAL_KEY() || !REDIS_URL || !REDIS_TOKEN) {
    return json({ error: 'trial unavailable' }, 503)
  }

  // Parse the client request. We accept only conversation content; the model,
  // streaming and token cap are all dictated here, never by the client. For the
  // E2EE tier the `content` fields are opaque ciphertext (encrypted to the
  // enclave) — we never see plaintext, we only inject the key + the TEE headers.
  let body: {
    messages?: unknown
    temperature?: unknown
    e2ee?: unknown
    clientPubHex?: unknown
    modelPubHex?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid json' }, 400)
  }
  const messages = body?.messages
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'messages required' }, 400)
  }

  // E2EE request? Validate the two attested public keys the enclave needs.
  const e2ee = body?.e2ee === true
  const clientPubHex = typeof body?.clientPubHex === 'string' ? body.clientPubHex : ''
  const modelPubHex = typeof body?.modelPubHex === 'string' ? body.modelPubHex : ''
  if (e2ee && !(isHex(clientPubHex, 130) && isHex(modelPubHex, 130))) {
    return json({ error: 'e2ee requires clientPubHex and modelPubHex' }, 400)
  }

  const ip = clientIp(req)

  // 1) Per-IP rate limit (fixed window). First hit in a window sets the TTL.
  try {
    const count = await redisIncrTtl(`trial:rl:${ip}`, RATE_WINDOW_SEC)
    if (count > RATE_LIMIT) {
      return json({ error: 'rate limited, take a breath and try again soon' }, 429, {
        'Retry-After': String(RATE_WINDOW_SEC),
      })
    }
  } catch {
    // State is down → cannot guarantee the cap → fail closed.
    return json({ error: 'trial unavailable' }, 503)
  }

  // 2) Monthly budget ceiling → graceful "rest mode" when crossed.
  try {
    const spent = await redisGetNum(budgetKey())
    if (spent >= MONTHLY_BUDGET_USD) return restMode()
  } catch {
    return json({ error: 'trial unavailable' }, 503)
  }

  // 3) Stream from Venice. We pass the conversation straight through with the
  //    pinned model + bounded length, and ask for usage so we can meter spend.
  const headers: Record<string, string> = {
    Authorization: `Bearer ${VENICE_TRIAL_KEY()}`,
    'Content-Type': 'application/json',
  }
  // E2EE: tell the enclave which keys to use. Content stays opaque to us.
  if (e2ee) {
    headers['X-Venice-TEE-Client-Pub-Key'] = clientPubHex
    headers['X-Venice-TEE-Model-Pub-Key'] = modelPubHex
    headers['X-Venice-TEE-Signing-Algo'] = 'ecdsa'
  }

  const upstream = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: e2ee ? E2EE_MODEL : MODEL,
      messages,
      temperature: clampTemp(body?.temperature),
      max_tokens: MAX_TOKENS,
      stream: true,
      stream_options: { include_usage: true },
    }),
  })

  if (!upstream.ok || !upstream.body) {
    // Log status only — never the body (it can echo prompt content).
    console.error('trial upstream error', upstream.status)
    return json({ error: 'inference failed' }, 502)
  }

  // 4) Tee the SSE stream: forward bytes verbatim to the client while sniffing
  //    the final usage chunk to bill the monthly counter. We never retain or
  //    log any token content — only the integer token totals from `usage`.
  const metered = upstream.body.pipeThrough(meterUsage())

  return new Response(metered, {
    status: 200,
    headers: {
      ...cors(),
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}

// ── Usage metering (content-blind) ───────────────────────────────────────────
// A pass-through transform that forwards every byte unchanged and, on the side,
// watches for the OpenAI/Venice `usage` object in the terminal SSE chunk. When
// found, it converts total tokens → an estimated USD cost and increments the
// monthly counter. Only digits ever leave this function.
function meterUsage(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder()
  let tail = '' // small rolling buffer to catch a usage line split across chunks
  let totalTokens = 0
  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk) // forward immediately — zero added latency
      tail = (tail + decoder.decode(chunk, { stream: true })).slice(-4096)
      const tokens = extractTotalTokens(tail)
      if (tokens > 0) totalTokens = tokens
    },
    async flush() {
      if (totalTokens <= 0) return
      const usd = (totalTokens / 1_000_000) * USD_PER_MTOK
      try {
        await redisIncrByFloat(budgetKey(), usd, monthTtlSec())
      } catch {
        // Best-effort metering; the Venice key's own cap is the hard backstop.
      }
    },
  })
}

// Pull the largest `total_tokens` seen in the buffered SSE text. Cheap and
// content-blind: matches only the numeric field, never message text.
function extractTotalTokens(buf: string): number {
  let max = 0
  const re = /"total_tokens"\s*:\s*(\d+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(buf))) max = Math.max(max, Number(m[1]))
  return max
}

// ── "Rest mode" — the graceful over-budget response ──────────────────────────
function restMode(): Response {
  // Shaped like a chat completion so the client renders it as a normal reply.
  return json(
    {
      restMode: true,
      message:
        "Starchild is resting — the free trial has used up this month's shared energy. " +
        'Add your own Venice key (it stays in your browser, fully private) to keep going, ' +
        'or come back when the trial refreshes next month.',
    },
    200,
  )
}

// ── Upstash Redis over REST (edge-safe; no SDK dependency) ────────────────────
async function redisCmd(cmd: (string | number)[]): Promise<unknown> {
  const res = await fetch(REDIS_URL as string, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  })
  if (!res.ok) throw new Error(`redis ${res.status}`)
  return (await res.json()).result
}

async function redisIncrTtl(key: string, ttlSec: number): Promise<number> {
  const n = Number(await redisCmd(['INCR', key]))
  if (n === 1) await redisCmd(['EXPIRE', key, ttlSec]) // set window on first hit
  return n
}

async function redisGetNum(key: string): Promise<number> {
  const v = await redisCmd(['GET', key])
  return v == null ? 0 : Number(v)
}

async function redisIncrByFloat(key: string, by: number, ttlSec: number): Promise<void> {
  const v = await redisCmd(['INCRBYFLOAT', key, by])
  // Set an expiry once so stale months self-clear (idempotent-ish; cheap).
  if (Math.abs(Number(v) - by) < 1e-9) await redisCmd(['EXPIRE', key, ttlSec])
}

// ── Small helpers ────────────────────────────────────────────────────────────
function VENICE_TRIAL_KEY(): string | undefined {
  return process.env.VENICE_TRIAL_KEY
}

function budgetKey(): string {
  const d = new Date()
  return `trial:budget:${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// ~62 days of TTL so a month's counter always outlives the month it tracks.
function monthTtlSec(): number {
  return 62 * 24 * 3600
}

// Trusted client IP. On Vercel Edge `x-real-ip` is platform-set; the LEFTMOST
// x-forwarded-for entry is attacker-controlled (one spoofed header per request
// used to mint a fresh rate-limit bucket). Prefer the platform header, else the
// RIGHTMOST forwarded hop (appended by the closest proxy).
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

// A hex string of an exact length (used to sanity-check the TEE public keys).
function isHex(s: string, len: number): boolean {
  return s.length === len && /^[0-9a-fA-F]+$/.test(s)
}

function clampTemp(t: unknown): number {
  const n = typeof t === 'number' ? t : 0.7
  return Math.min(1.5, Math.max(0, n))
}

// CORS: the app is served from the SAME origin as this function, so no CORS
// headers are needed at all by default — omitting them means third-party sites
// can't script against the trial (and drain its budget) from a browser. Set
// TRIAL_ALLOWED_ORIGIN only to deliberately allow an external origin.
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
