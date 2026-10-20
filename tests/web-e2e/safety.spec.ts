/**
 * safety.spec.ts — the duty-of-care path on the real web shell.
 *
 * Companion-chatbot laws (NY GBL Art. 47, CA SB 243) need three things this
 * spec pins end-to-end, with the mock enclave from `e2ee-mock.ts`:
 *   1. an adult/not-therapy consent before the first meeting completes,
 *   2. the "you're talking to an AI" disclosure at session start,
 *   3. on a crisis message: real help lines on screen, the prompt in the
 *      `crisis` phase, and NO quest offer — even if the model replies with one.
 */
import { test, expect, type Page, type Route } from '@playwright/test'
import { attestationBody, openProxyRequest, skipIntro, passMeetingTap, sseStreamEncrypted, sseStreamPlain } from './e2ee-mock'

// The worst case: the model ignores the crisis layer and offers a quest anyway.
const MISBEHAVING_REPLY = "i have a quest for you: step outside and breathe."
const CRISIS_MESSAGE = "honestly i don't want to be alive anymore"

async function fulfillSse(route: Route, text: string, clientPubHex: string | null): Promise<void> {
  await route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    body: clientPubHex ? sseStreamEncrypted(text, clientPubHex) : sseStreamPlain(text),
  })
}

async function mockEnclave(page: Page, systems: string[]): Promise<void> {
  await page.route('**/api/tts**', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"voice unavailable"}' }),
  )
  await page.route('**/api/attest**', async (route) => {
    const nonce = new URL(route.request().url()).searchParams.get('nonce') ?? ''
    await route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(attestationBody(nonce)) })
  })
  await page.route('**/api/proxy**', async (route) => {
    const body = route.request().postDataJSON() ?? {}
    if (body.warm) return fulfillSse(route, 'hi', null)
    const { messages, clientPubHex } = openProxyRequest(body)
    const system = messages.find((m) => m.role === 'system')?.content ?? ''
    systems.push(system)
    if (system.includes('insight extractor')) return fulfillSse(route, '[]', clientPubHex)
    await fulfillSse(route, MISBEHAVING_REPLY, clientPubHex)
  })
}

test('consent gate, AI disclosure, and crisis support with no quest', async ({ page }) => {
  const systems: string[] = []
  await mockEnclave(page, systems)
  await skipIntro(page)
  await page.goto('/')
  await passMeetingTap(page)

  // 1. Consent gates the meeting.
  await page.getByPlaceholder('a name…').fill('Safety Traveler')
  const begin = page.getByRole('button', { name: /^begin$/i })
  await expect(begin).toBeDisabled()
  await page.getByRole('checkbox', { name: /18 or older/i }).check()
  await expect(begin).toBeEnabled()
  await begin.click()

  // 2. The AI disclosure is on screen at session start.
  const composer = page.getByPlaceholder('talk to your starchild...')
  await expect(composer).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('note', { name: /ai disclosure/i })).toContainText(/an AI/i)

  // 3. A crisis message → help lines, crisis phase, no quest buttons.
  await composer.fill(CRISIS_MESSAGE)
  await composer.press('Enter')

  const card = page.getByRole('region', { name: /crisis support/i })
  await expect(card).toBeVisible({ timeout: 15_000 })
  await expect(card.getByRole('link', { name: /find a helpline/i })).toBeVisible()
  await expect(card.getByRole('link', { name: /emergency services/i })).toBeVisible()

  await expect.poll(() => systems.some((s) => s.includes('current phase: crisis')), { timeout: 15_000 }).toBe(true)
  await expect(page.getByText(MISBEHAVING_REPLY.slice(0, 20))).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: /accept quest/i })).toHaveCount(0)
})
