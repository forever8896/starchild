/**
 * playwright.config.ts — Web E2E harness (PRD §8)
 *
 * Drives the REAL `web/` shell (the dedicated browser app: `web/src/main.tsx`
 * mounting the shared React components through the `src/platform/web.ts` seam,
 * backed by the WASM `core/`, IndexedDB and the Venice proxy/BYOK client) in a
 * headless browser, so flows are tested end-to-end and deterministically. This
 * doubles as the shared-core regression net: the web shell runs the same `core/`
 * the desktop ships, so a green suite here guards the core logic for both
 * platforms (PRD §8).
 *
 * ── Which server we boot, and WHY it matters ────────────────────────────────
 * We boot the `web/` Vite app (`npm run dev` with `cwd: web/` → http://localhost:5174),
 * NOT the repo-root dev server (:5173, the legacy `src` shell). This is
 * load-bearing: the `web/` shell is what users actually run, and its Vite config
 * dedupes/aliases react/react-dom to ONE copy. Booting the root server instead
 * meant the real shell's render was never exercised — a runtime render bug (e.g.
 * the blank page from a duplicate React → "Invalid hook call") would sail
 * straight through a green gate. Pointing the harness at :5174 closes that hole;
 * the specs additionally fail on any uncaught page error / React hook-call
 * console error so such a regression turns the gate red.
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
// The dedicated web shell lives in `web/` (tests/web-e2e/ → ../../web).
const webDir = resolve(__dirname, '..', '..', 'web')

// The web shell pins its dev server to 5174 (web/vite.config.ts, strictPort).
const PORT = 5174
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
    // The web "Meeting" (onboarding) reveals its lines on a timeline; reduced
    // motion makes it appear instantly, keeping the suite fast + deterministic.
    reducedMotion: 'reduce',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  // Boot the REAL web shell (web/ Vite app on :5174) before the suite; reuse a
  // locally-running one for speed. `cwd: web/` is what makes this the dedicated
  // shell rather than the legacy root server.
  webServer: {
    command: 'npm run dev',
    cwd: webDir,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
