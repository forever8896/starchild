// web/api/attest.ts — TEE attestation relay for the E2EE trial.
//
// The browser needs Venice's TEE attestation (the enclave's public key) to
// encrypt to it, but the attestation fetch requires the trial key — which must
// stay server-side. This route injects the key and relays the attestation. It
// carries NO conversation content and costs no inference, so it's a thin,
// content-blind relay; the client sends a nonce and verifies the echo itself.
//
// Pinned to the single E2EE model the trial allows. Rate-limited per IP (best
// effort) to keep the relay from being trivially hammered. Fails closed if the
// trial key is absent, matching /api/proxy.
//
// ── Environment ──────────────────────────────────────────────────────────────
//   VENICE_TRIAL_KEY         (required) same demo key as /api/proxy. Server-only.
//   VENICE_BASE_URL          (optional) default https://api.venice.ai/api/v1
//   UPSTASH_REDIS_REST_URL   (optional) per-IP rate limit; skipped if absent.
//   UPSTASH_REDIS_REST_TOKEN (optional)
//   TRIAL_E2EE_MODEL         (optional) default e2ee-glm-4-7-p
//   ATTEST_RATE_LIMIT        (optional) max attest fetches per IP per hour. Def 60.
//   TRIAL_ALLOWED_ORIGIN     (optional) CORS origin. Default: none (same-origin only).

export const config = { runtime: 'edge' }

const VENICE_BASE_URL = process.env.VENICE_BASE_URL ?? 'https://api.venice.ai/api/v1'
const E2EE_MODEL = process.env.TRIAL_E2EE_MODEL ?? 'e2ee-glm-4-7-p'
const RATE_LIMIT = int(process.env.ATTEST_RATE_LIMIT, 60)
const RATE_WINDOW_SEC = 3600
const ALLOWED_ORIGIN = process.env.TRIAL_ALLOWED_ORIGIN ?? ''
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() })
  if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405)

  const key = process.env.VENICE_TRIAL_KEY
  if (!key) return json({ error: 'trial unavailable' }, 503)

  const url = new URL(req.url)
  const model = url.searchParams.get('model') ?? E2EE_MODEL
  const nonce = url.searchParams.get('nonce') ?? ''
  // Pin the model — the trial only ever attests the one E2EE model.
  if (model !== E2EE_MODEL) return json({ error: 'model not allowed' }, 400)
  // Nonce must be client-supplied hex so the caller can verify the echo (anti-replay).
  if (!/^[0-9a-fA-F]{16,128}$/.test(nonce)) return json({ error: 'valid hex nonce required' }, 400)

  // Best-effort per-IP rate limit (only if Redis is configured).
  if (REDIS_URL && REDIS_TOKEN) {
    try {
      const n = await redisIncrTtl(`attest:rl:${clientIp(req)}`, RATE_WINDOW_SEC)
      if (n > RATE_LIMIT) return json({ error: 'rate limited' }, 429, { 'Retry-After': String(RATE_WINDOW_SEC) })
    } catch {
      // Redis down → allow (attestation carries no content and no spend).
    }
  }

  let att: Record<string, unknown>
  try {
    const upstream = await fetch(
      `${VENICE_BASE_URL}/tee/attestation?model=${encodeURIComponent(model)}&nonce=${encodeURIComponent(nonce)}`,
      { headers: { Authorization: `Bearer ${key}` } },
    )
    if (!upstream.ok) {
      console.error('attest upstream error', upstream.status)
      return json({ error: 'attestation failed' }, 502)
    }
    att = (await upstream.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'attestation failed' }, 502)
  }

  // Forward the fields the client verifies (identity pins, Venice's DCAP result,
  // and the key↔report_data binding it checks locally) plus the nonce echo. We
  // omit the ~100KB raw quote/certs — those are only needed for full from-scratch
  // in-browser DCAP verification (the labeled next step). The client trusts none
  // of this blindly: it recomputes the key binding and pins model/hardware itself.
  const freshness = att.freshness as { stale_after?: number } | undefined
  return json(
    {
      signing_public_key: att.signing_public_key ?? att.signing_key ?? null,
      verified: att.verified ?? null,
      nonce: att.nonce ?? att.request_nonce ?? null,
      model: att.model ?? model,
      stale_after: att.stale_after ?? freshness?.stale_after ?? null,
      tee_hardware: att.tee_hardware ?? null,
      upstream_model: att.upstream_model ?? null,
      signing_address: att.signing_address ?? null,
      server_verification: att.server_verification ?? null,
    },
    200,
  )
}

// ── helpers ───────────────────────────────────────────────────────────────────
async function redisIncrTtl(k: string, ttlSec: number): Promise<number> {
  const call = async (cmd: (string | number)[]) => {
    const res = await fetch(REDIS_URL as string, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    })
    if (!res.ok) throw new Error(`redis ${res.status}`)
    return (await res.json()).result
  }
  const n = Number(await call(['INCR', k]))
  if (n === 1) await call(['EXPIRE', k, ttlSec])
  return n
}

// Trusted client IP (see proxy.ts): platform header first, else the RIGHTMOST
// forwarded hop — never the client-controlled leftmost token.
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
// Same-origin by default (see proxy.ts) — CORS headers only when explicitly allowed.
function cors(): Record<string, string> {
  if (!ALLOWED_ORIGIN) return {}
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
