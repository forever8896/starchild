/**
 * onboarding.spec.ts — web shell render + onboarding arc (PRD §8)
 *
 * Loads the REAL `web/` shell (http://localhost:5174 — `web/src/main.tsx` →
 * shared components via the `src/platform/web.ts` seam) and exercises the
 * first-run arc: onboarding renders → name + CTA → the live chat view renders.
 *
 * ── Why this is a real render gate (the duplicate-React guard) ───────────────
 * The whole point of pointing the harness at the `web/` shell is to catch a
 * runtime render bug that a typecheck/build can't see — e.g. a blank page from a
 * SECOND React copy ("Invalid hook call", or `usePlatform must be used within a
 * PlatformProvider` when two React contexts diverge). Such a bug produces an
 * uncaught page error and/or a React console error and NO real onboarding copy.
 * So every test here:
 *   1. fails on any `pageerror` (uncaught exception in the page), and
 *   2. fails on a React "Invalid hook call" / hook-related `console.error`, and
 *   3. asserts the actual onboarding hero copy is visible (positive proof the
 *      tree rendered, not an ErrorBoundary fallback).
 * Any one of these turns red if the shell fails to render for real.
 *
 * ── No Venice mock needed for this arc ──────────────────────────────────────
 * The only outbound call the product makes is the Venice E2EE inference call,
 * and this arc never reaches it: outside Tauri the shell selects the web
 * platform, onboarding completes by writing IndexedDB settings, and the chat's
 * first message is the LOCAL canned "awakening" (web.ts `generateFirstMessage`,
 * no network). When a future spec drives a model reply, mock at the network seam
 * (`page.route('**\/api/proxy*', …)` with a canned chunked SSE) — never by
 * stubbing React internals — so the real component + core code paths still run.
 */

import { skipIntro } from './e2ee-mock'
import { test, expect, type Page } from '@playwright/test'

/**
 * Attach fail-fast listeners that turn a runtime render failure into a test
 * failure. Returns a `assertClean()` to call after the assertions so a late
 * error (e.g. during a transition) is still caught.
 */
function guardAgainstRenderErrors(page: Page): { assertClean: () => void } {
  const pageErrors: string[] = []
  const reactErrors: string[] = []

  page.on('pageerror', (err) => {
    pageErrors.push(`${err.name}: ${err.message}`)
  })

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    // The duplicate-React signature, plus the context-mismatch our seam throws.
    if (
      /invalid hook call/i.test(text) ||
      /hooks can only be called inside/i.test(text) ||
      /must be used within a platformprovider/i.test(text) ||
      /minified react error #(321|310|300)\b/i.test(text)
    ) {
      reactErrors.push(text)
    }
  })

  return {
    assertClean() {
      expect(
        pageErrors,
        `Uncaught page error(s) — the web shell crashed at runtime:\n${pageErrors.join('\n')}`,
      ).toEqual([])
      expect(
        reactErrors,
        `React hook/render error(s) — likely a duplicate React copy:\n${reactErrors.join('\n')}`,
      ).toEqual([])
    },
  }
}

test.describe('web shell', () => {
  test('renders the onboarding screen with real copy (no render errors)', async ({
    page,
  }) => {
    const guard = guardAgainstRenderErrors(page)

    await skipIntro(page)
    await page.goto('/')

    // Document loaded as the real Starchild shell.
    await expect(page).toHaveTitle(/starchild/i)

    // Real first-meeting copy from the web Meeting.tsx — proves the component
    // tree actually rendered (not a blank page / ErrorBoundary). Under reduced
    // motion (playwright config) the reveal is instant.
    await expect(
      page.getByText(/oh… there you are/i),
    ).toBeVisible({ timeout: 15_000 })

    // The naming ritual is present.
    await expect(page.getByPlaceholder('a name…')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: /^begin$/i })).toBeVisible()

    guard.assertClean()
  })

  test('completing onboarding renders the live chat view', async ({ page }) => {
    const guard = guardAgainstRenderErrors(page)

    await skipIntro(page)
    await page.goto('/')

    // Fill the name and begin — on web `hasInferenceKey()` is true (bounded
    // trial), so no API key is required to submit.
    await page.getByPlaceholder('a name…').fill('Playwright Traveler')

    const begin = page.getByRole('button', { name: /^begin$/i })
    await expect(begin).toBeEnabled()
    await begin.click()

    // The chat view renders: its composer placeholder and the LOCAL awakening
    // message (no Venice call) are both shared-component proof the chat mounted.
    await expect(
      page.getByPlaceholder('talk to your starchild...'),
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByText(/i'm your starchild/i),
    ).toBeVisible({ timeout: 15_000 })

    guard.assertClean()
  })
})
