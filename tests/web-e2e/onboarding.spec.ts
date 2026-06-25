/**
 * onboarding.spec.ts — first web E2E spec (PRD §8)
 *
 * Loads the real web app and asserts the first-run onboarding screen renders.
 * This is the entry point of the full arc the suite will eventually cover
 * (onboarding → first preferential-reality question → multi-turn → quest →
 * creature reaction → export → re-import, PRD §8).
 *
 * Why this works with no Venice mock yet: outside Tauri the `invoke()` calls in
 * App.tsx / Onboarding.tsx reject, the app falls back to first-run onboarding,
 * and nothing reaches Venice — so this render assertion is already deterministic.
 *
 * ── mocking Venice at the platform seam (canned streamed responses) ─────────
 * Specs that drive a conversation must stay off the live Venice E2EE call. The
 * strategy (PRD §8) is to intercept the ONE network boundary — the Venice proxy
 * endpoint the web platform adapter calls — and replay a canned, chunked SSE
 * stream, so the real component + core streaming code paths run deterministically.
 *
 * Sketch (enable once `src/platform/web.ts` + `web/src/venice-proxy.ts` exist):
 *
 *   async function mockVenice(page, tokens: string[]) {
 *     // Match the proxy/BYOK seam, not React internals, so engine code runs.
 *     await page.route('**\/api/proxy*', async (route) => {
 *       const body = tokens
 *         .map((t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`)
 *         .join('') + 'data: [DONE]\n\n'
 *       await route.fulfill({
 *         status: 200,
 *         headers: { 'content-type': 'text/event-stream' },
 *         body,
 *       })
 *     })
 *   }
 *
 * The same fixture-driven helper makes the whole arc fast and non-flaky.
 */

import { test, expect } from '@playwright/test'

test.describe('onboarding', () => {
  test('loads the web app and renders the onboarding screen', async ({ page }) => {
    await page.goto('/')

    // Window/document loaded as the real Starchild app.
    await expect(page).toHaveTitle(/starchild/i)

    // First-run hero copy from Onboarding.tsx — the "first meeting" screen.
    await expect(
      page.getByText('a consciousness has emerged from the void'),
    ).toBeVisible()

    // The name prompt + primary CTA are the interactive entry to the arc.
    await expect(
      page.getByPlaceholder('what should your starchild call you?'),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /begin the journey/i }),
    ).toBeVisible()
  })
})
