/**
 * pwa.ts — installability + storage durability for the web edition.
 *
 * Everything here is best-effort and silent: a missing API, a denied request or
 * a failed registration must never break the app or nag the human.
 *
 *   - `initPwa()`                 registers the service worker (production only;
 *                                 dev/HMR never gets one — see vite.config.ts).
 *   - `requestPersistentStorage()` asks the browser, once, not to evict our
 *                                 IndexedDB under storage pressure.
 *   - `storageStatus()`           {persisted, standalone, ios} for later UI.
 *   - `probeIndexedDb()`          false when IndexedDB can't be used at all
 *                                 (some private-browsing modes).
 */

const PERSIST_REQUESTED_KEY = 'starchild.persist_requested'

let registered = false

/** Register the service worker. No-op in dev, in unsupported browsers, or twice. */
export function initPwa(): void {
  if (registered) return
  registered = true
  if (!import.meta.env.PROD) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const register = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Offline support is an enhancement; the app works without it.
    })
  }
  // Don't compete with the first paint / WASM boot for bandwidth.
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}

/** Running as an installed app (home-screen / standalone window). */
export function isStandalone(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
  } catch {
    // matchMedia unavailable
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** iOS / iPadOS (iPadOS reports as Mac with touch). */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export interface StorageStatus {
  /** The browser has granted persistent (non-evictable) storage. */
  persisted: boolean
  /** Running as an installed app. */
  standalone: boolean
  /** iOS/iPadOS — where Safari tabs can evict data after ~7 days of no use. */
  ios: boolean
}

export async function storageStatus(): Promise<StorageStatus> {
  let persisted = false
  try {
    persisted = (await navigator.storage?.persisted?.()) === true
  } catch {
    // unsupported
  }
  return { persisted, standalone: isStandalone(), ios: isIos() }
}

/**
 * Ask once (ever, per browser profile) for persistent storage. Returns whether
 * storage is persisted afterwards. Denial is fine and silent — on iOS Safari
 * outside standalone it's expected; installing the app is the real remedy there.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = navigator.storage
    if (!storage?.persist || !storage.persisted) return false
    if (await storage.persisted()) return true
    let asked = false
    try {
      asked = localStorage.getItem(PERSIST_REQUESTED_KEY) === 'true'
    } catch {
      // localStorage blocked — still ask, just can't remember we did.
    }
    if (asked) return false
    try {
      localStorage.setItem(PERSIST_REQUESTED_KEY, 'true')
    } catch {
      // ignore
    }
    return await storage.persist()
  } catch {
    return false
  }
}

/**
 * Can this window actually use IndexedDB? Opens (then deletes) a throwaway
 * database. Resolves false on any error, block or a 3s stall.
 */
export function probeIndexedDb(): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      resolve(ok)
    }
    const timer = window.setTimeout(() => finish(false), 3000)
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) {
        window.clearTimeout(timer)
        finish(false)
        return
      }
      const name = 'starchild-probe'
      const req = indexedDB.open(name)
      req.onsuccess = () => {
        window.clearTimeout(timer)
        try {
          req.result.close()
          indexedDB.deleteDatabase(name)
        } catch {
          // ignore cleanup errors
        }
        finish(true)
      }
      req.onerror = () => {
        window.clearTimeout(timer)
        finish(false)
      }
      req.onblocked = () => {
        window.clearTimeout(timer)
        finish(false)
      }
    } catch {
      window.clearTimeout(timer)
      finish(false)
    }
  })
}
