/**
 * pwa.spec.ts — installability basics for the web shell.
 *
 * The manifest is a static file (web/public/manifest.webmanifest) linked from
 * web/index.html, so it is served by the dev server the suite boots as well as
 * by production builds. The service worker itself is production-only (never
 * registered in dev), so it is not exercised here.
 */

import { test, expect } from '@playwright/test'

test('manifest is linked and served with the right identity', async ({ page, request }) => {
  await page.goto('/')

  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBe('/manifest.webmanifest')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', /^#[0-9a-f]{6}$/i)
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1)

  const res = await request.get(href!)
  expect(res.ok()).toBe(true)
  const manifest = await res.json()
  expect(manifest.name).toBe('Starchild')
  expect(manifest.display).toBe('standalone')
  expect(manifest.start_url).toBe('/')

  // Installability needs a 192 and a 512 icon; we also ship a maskable one.
  const sizes = (manifest.icons as Array<{ sizes: string; purpose?: string }>).map((i) => i.sizes)
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']))
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose?.includes('maskable'))).toBe(true)
  for (const icon of manifest.icons as Array<{ src: string }>) {
    const r = await request.get(icon.src)
    expect(r.ok(), icon.src).toBe(true)
    expect(r.headers()['content-type']).toContain('image/png')
  }
})
