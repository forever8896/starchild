/// <reference lib="webworker" />
/**
 * sw.ts — the web edition's service worker (built by vite-plugin-pwa,
 * `injectManifest` strategy → dist/sw.js; production builds only).
 *
 * What it does:
 *   - Precaches the app shell: index.html, JS, CSS, the WASM core, fonts,
 *     icons and the manifest (the list is injected at build time as
 *     `self.__WB_MANIFEST`, see `injectManifest.globPatterns` in vite.config.ts).
 *     That is enough for the app to boot with no network.
 *   - Serves SPA navigations from the precached index.html.
 *   - Runtime-caches large media (video/audio) and images on first use, so
 *     install stays small but the creature still plays offline once it's been seen.
 *
 * What it must NEVER do:
 *   - Touch `/api/*` (proxy, attest, tts, stt, feedback): those are live,
 *     often streaming, and private. No route matches them, so the browser
 *     handles them natively — the SW is not even in the path.
 *   - Touch any cross-origin request (Venice, BYOK). Same: no route matches.
 *
 * Updates: `skipWaiting` + `clientsClaim` — a new worker takes over straight
 * away, but the page never reloads itself; the running session keeps the JS it
 * already has, and the next load picks up the new shell.
 */

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { createPartialResponse } from 'workbox-range-requests'
import { clientsClaim } from 'workbox-core'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

/** Same-origin and not an API call — the only requests we ever handle. */
function ours(url: URL): boolean {
  return url.origin === self.location.origin && !url.pathname.startsWith('/api/') && url.pathname !== '/api'
}

// SPA navigations → the precached shell (never for /api).
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api(\/|$)/],
  }),
)

// ─── Media (video/audio): cache on first use, serve ranges from cache ───────
//
// <video>/<audio> send `Range` requests and get 206s back, which can't be
// cached as-is. So: on a miss, pass the request straight through to the
// network (playback starts immediately) and, in the background, fetch the
// whole file once and store it. On a hit, slice the cached file into the
// requested range.

const MEDIA_CACHE = 'starchild-media-v1'
const MEDIA_RE = /\.(?:mp4|webm|mp3|wav|ogg|m4a)$/i
const MEDIA_MAX_ENTRIES = 40
const pendingMedia = new Set<string>()

async function trimMediaCache(cache: Cache): Promise<void> {
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - MEDIA_MAX_ENTRIES; i++) await cache.delete(keys[i])
}

async function storeFullMedia(url: string): Promise<void> {
  if (pendingMedia.has(url)) return
  pendingMedia.add(url)
  try {
    const res = await fetch(url, { credentials: 'same-origin' })
    if (res.status === 200 && res.type === 'basic') {
      const cache = await caches.open(MEDIA_CACHE)
      await cache.put(url, res)
      await trimMediaCache(cache)
    }
  } catch {
    // Offline or aborted — try again on the next play.
  } finally {
    pendingMedia.delete(url)
  }
}

registerRoute(
  ({ url, request }) => request.method === 'GET' && ours(url) && MEDIA_RE.test(url.pathname),
  async ({ request, event, url }) => {
    const key = url.origin + url.pathname
    const cache = await caches.open(MEDIA_CACHE)
    const cached = await cache.match(key)
    if (cached) {
      return request.headers.has('range') ? createPartialResponse(request, cached) : cached
    }
    ;(event as ExtendableEvent).waitUntil(storeFullMedia(key))
    return fetch(request)
  },
)

// ─── Images (the large PNG/JPG art): cache-first after first view ────────────
registerRoute(
  ({ url, request }) =>
    request.method === 'GET' && ours(url) && request.destination === 'image',
  new CacheFirst({
    cacheName: 'starchild-images-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 60 }),
    ],
  }),
)
