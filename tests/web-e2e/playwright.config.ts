/**
 * playwright.config.ts — Web E2E harness (PRD §8)
 *
 * Drives the REAL web app (shared React components + — once compiled — the
 * shared `core/` engine) in a headless browser, so flows are tested end-to-end
 * and deterministically. This doubles as the shared-core regression net: the web
 * shell runs the same `core/` the desktop ships, so a green suite here guards the
 * core logic for both platforms (PRD §8).
 *
 * The "web dev server" is the Vite app served from the repo root (`npm run dev`
 * → http://localhost:5173). It mounts `src/components/*` — the shared UI surface
 * — which is exactly what the future `web/` shell renders. When the dedicated
 * `web/` shell lands (PRD §12), point `webServer.command`/`cwd` at it; nothing
 * else here needs to change.
 *
 * ── Determinism strategy: mock Venice at the platform seam ──────────────────
 * The only outbound network call the product makes is the E2EE inference call to
 * Venice. Tests must never hit it — it is slow, costs money, and is
 * non-deterministic. We mock it **at the platform/proxy seam** (PRD §8), NOT by
 * stubbing React internals, so the real component + engine code paths run:
 *
 *   1. Preferred (once `src/platform/web.ts` + `web/src/venice-proxy.ts` exist):
 *      `page.route()` the Venice proxy endpoint and reply with a **canned,
 *      chunked SSE stream** so `sendMessage()` yields tokens exactly as a live
 *      call would — same streaming code path, deterministic content. A helper
 *      that replays a fixture of `data: {...}\n\n` chunks lives alongside the
 *      specs (see `mockVenice()` sketch in onboarding.spec.ts).
 *
 *   2. Until that seam is wired, specs that don't need inference (e.g. the
 *      onboarding render below) run against the plain dev server: outside Tauri,
 *      `@tauri-apps/api` `invoke()` rejects, the app falls back to first-run
 *      onboarding, and no Venice call is made — so no mock is required yet.
 *
 * Keeping the mock at the seam means we swap ONE network boundary and the entire
 * conversation arc (onboarding → first question → multi-turn → quest → creature
 * reaction → export/import, PRD §8) becomes fast and non-flaky.
 */

import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Repo root holds the web package.json + Vite dev server (tests/web-e2e/ → ../../).
const repoRoot = resolve(__dirname, '..', '..')

const PORT = 5173
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: __dirname,
  // CI gets the deterministic-net treatment: no flaky retries masking real breaks,
  // fully serial, fail fast on a stray `.only`.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  // Boot the real web dev server before the suite; reuse it locally for speed.
  webServer: {
    command: 'npm run dev',
    cwd: repoRoot,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
