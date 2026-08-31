# web/api

Server-side functions for the web shell. These run on the server (Vercel Edge),
never in the browser bundle.

## `proxy.ts` — trial inference proxy (PRD §6, tier 1)

The no-friction "first taste": holds a demo Venice key server-side, pins a cheap
model, rate-limits per IP, enforces a monthly USD budget ceiling (graceful "rest
mode" when crossed), streams the reply through, and **logs no prompt/response
content**. BYOK and lock-$STARCHILD keys bypass this entirely and talk to Venice
directly, E2EE.

Required env (server-only — set in the Vercel project, never `VITE_`/client):

- `VENICE_TRIAL_KEY` — demo Venice key; give it its own small cap at Venice.
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — shared state for the
  per-IP limit + monthly spend counter. If absent, the proxy fails closed.

Optional tuning env: `TRIAL_MODEL`, `TRIAL_MAX_TOKENS`, `TRIAL_RATE_LIMIT`,
`TRIAL_RATE_WINDOW_SEC`, `TRIAL_MONTHLY_BUDGET_USD`, `TRIAL_USD_PER_MTOK`,
`VENICE_BASE_URL`, `TRIAL_ALLOWED_ORIGIN`. See the header comment in `proxy.ts`.
