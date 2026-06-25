/**
 * platform/web.ts — the web platform implementation.
 *
 * This is the web shell's adapter (PRD §4.2): IndexedDB storage, the WASM bridge
 * to the shared `core/` engine, and the Venice proxy/BYOK client all live behind
 * this surface. None of that is built yet — the WASM core arrives in Phase 2 and
 * storage/inference in Phase 4. Until then every method is a clean stub so the
 * shell installs, type-checks, and runs without the core present.
 */

import type { Platform } from './index'

/**
 * Lazily bring up the (not-yet-built) WASM core.
 *
 * Kept as a dynamic, run-time-only step so the missing module never breaks the
 * build or `tsc --noEmit`. Once `web/src/wasm-bridge.ts` exists (PRD §4.6),
 * replace the body with `return import('../wasm-bridge')`.
 */
async function loadCore(): Promise<never> {
  throw new Error('Starchild WASM core is not built yet (PRD Phase 2).')
}

export function createWebPlatform(): Platform {
  return {
    name: 'web',

    async hasInferenceKey(): Promise<boolean> {
      // No key flows wired yet (trial / BYOK / lock-$STARCHILD — Phase 6).
      return false
    },

    async *sendMessage(_text: string): AsyncIterable<string> {
      await loadCore()
    },

    async exportData(_passphrase: string): Promise<Blob> {
      return await loadCore()
    },

    async importData(_file: File, _passphrase: string): Promise<void> {
      await loadCore()
    },
  }
}
