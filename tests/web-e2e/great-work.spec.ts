import { expect, test, type Page } from '@playwright/test'
import { attestationBody, openProxyRequest, skipIntro, sseStreamEncrypted, sseStreamPlain } from './e2ee-mock'

/**
 * Mock enclave (see e2ee-mock.ts): the fail-closed E2EE trial needs a
 * verifiable attestation + an endpoint that speaks the real wire crypto, or
 * the send under test would refuse to leave the browser.
 */
async function mockInference(page: Page): Promise<void> {
  await page.route('**/api/tts**', async (route) => {
    // Voice costs real money and audio can't autoplay headless — specs run silent.
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"voice unavailable"}' })
  })

  await page.route('**/api/attest**', async (route) => {
    const nonce = new URL(route.request().url()).searchParams.get('nonce') ?? ''
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(attestationBody(nonce)),
    })
  })
  await page.route('**/api/proxy**', async (route) => {
    let clientPubHex: string | null = null
    let system = ''
    try {
      const opened = openProxyRequest(route.request().postDataJSON() ?? {})
      clientPubHex = opened.clientPubHex
      system = opened.messages.find((m) => m.role === 'system')?.content ?? ''
    } catch { /* fall through to a generic reply */ }
    const reply = system.includes('insight extractor')
      ? '[]'
      : 'a cabin by the sea, poetry all day — I hear you. what draws you to the water?'
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
      body: clientPubHex ? sseStreamEncrypted(reply, clientPubHex) : sseStreamPlain(reply),
    })
  })
}

async function freezeCreatureDecay(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('starchild')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite')
      const store = tx.objectStore('state')
      store.put({
        id: 1,
        hunger: 60.4, mood: 'Content', energy: 70.7,
        bond: 50.3, xp: 10, level: 1, last_decay_at: future,
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  })
}

test('great work — position auto-initializes on first message', async ({ page }) => {
  await mockInference(page)
  await skipIntro(page)
  await page.goto('/')

  // Complete onboarding
  await page.getByPlaceholder('a name…').fill('Test')
  const begin = page.getByRole('button', { name: /^begin$/i })
  await expect(begin).toBeEnabled()
  await begin.click()

  // Wait for chat to mount
  await expect(page.getByPlaceholder('talk to your starchild...')).toBeVisible({ timeout: 15000 })

  // Send the first message (preferential reality answer)
  await freezeCreatureDecay(page)
  const composer = page.getByPlaceholder('talk to your starchild...')
  await composer.fill('I would live in a cabin by the sea and write poetry all day.')
  await composer.press('Enter')

  // Wait a moment for the background processing
  await page.waitForTimeout(2000)

  // Check IndexedDB for the great_work store
  const position = await page.evaluate(async () => {
    return new Promise((resolve) => {
      const req = indexedDB.open('starchild') // no version — match whatever the app created
      req.onsuccess = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('great_work')) { resolve(null); return }
        const tx = db.transaction('great_work', 'readonly')
        const req2 = tx.objectStore('great_work').get('position')
        req2.onsuccess = () => resolve(req2.result)
        req2.onerror = () => resolve(null)
      }
      req.onerror = () => resolve(null)
    })
  })

  expect(position).toBeTruthy()
  expect((position as any).data.preferential_reality).toContain('cabin by the sea')
  expect((position as any).data.active_cell).toEqual({ plane: 'body', stage: 'calcination' })
  expect((position as any).data.planes).toHaveLength(3)
})
