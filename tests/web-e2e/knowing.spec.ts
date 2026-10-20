/**
 * knowing.spec.ts — "what it knows about you": the human can read, correct and
 * forget what Starchild has learned. Seeds facts straight into the web shell's
 * IndexedDB (the store extraction writes to) and drives the Settings section.
 */
import { test, expect, type Page } from '@playwright/test'
import { skipIntro, passMeetingTap } from './e2ee-mock'

async function onboard(page: Page): Promise<void> {
  await page.route('**/api/tts**', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"voice unavailable"}' }),
  )
  await skipIntro(page)
  await page.goto('/')
  await passMeetingTap(page)
  await page.getByPlaceholder('a name…').fill('Known Traveler')
  await page.getByRole('checkbox', { name: /18 or older/i }).check()
  await page.getByRole('button', { name: /^begin$/i }).click()
  await expect(page.getByPlaceholder('talk to your starchild...')).toBeVisible({ timeout: 15_000 })
}

async function seedFacts(page: Page, facts: { id: string; category: string; fact: string }[]): Promise<void> {
  await page.evaluate(async (rows) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('starchild')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const tx = open.result.transaction('knowing', 'readwrite')
        for (const r of rows) {
          tx.objectStore('knowing').put({ ...r, importance: 0.8, confidence: 0.9, created_at: new Date().toISOString() })
        }
        tx.oncomplete = () => { open.result.close(); resolve() }
        tx.onerror = () => reject(tx.error)
      }
    })
  }, facts)
}

test('read, correct and forget what Starchild knows', async ({ page }) => {
  await onboard(page)
  await seedFacts(page, [
    { id: 'f1', category: 'core_values', fact: 'Values quiet mornings' },
    { id: 'f2', category: 'fears', fact: 'Afraid of public speaking' },
  ])

  await page.getByRole('button', { name: 'You & this space' }).first().click()
  const view = page.getByLabel('What Starchild knows about you')
  await expect(view).toBeVisible({ timeout: 10_000 })
  await expect(view.getByText('Values quiet mornings')).toBeVisible()
  await expect(view.getByText('what scares you')).toBeVisible()

  // Correct one in the human's own words.
  await view.getByRole('button', { name: 'Correct: Values quiet mornings' }).click()
  await view.getByLabel('Correct this').fill('Values slow, quiet mornings with tea')
  await view.getByRole('button', { name: 'save' }).click()
  await expect(view.getByText('Values slow, quiet mornings with tea')).toBeVisible()

  // Forget the other — gone from the view and from storage.
  await view.getByRole('button', { name: 'Forget: Afraid of public speaking' }).click()
  await expect(view.getByText('Afraid of public speaking')).toHaveCount(0)
  const remaining = await page.evaluate(async () => new Promise<string[]>((resolve) => {
    const open = indexedDB.open('starchild')
    open.onsuccess = () => {
      const req = open.result.transaction('knowing').objectStore('knowing').getAll()
      req.onsuccess = () => { resolve(req.result.map((r: { fact: string }) => r.fact)); open.result.close() }
    }
  }))
  expect(remaining).toEqual(['Values slow, quiet mornings with tea'])
})
