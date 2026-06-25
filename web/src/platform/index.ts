/**
 * platform/index.ts — the one seam (PRD §4.4)
 *
 * Shared UI depends ONLY on this `Platform` interface. The desktop (Tauri) shell
 * and this web shell each provide their own implementation; components never call
 * `invoke` or branch on platform. This file is the web shell's local copy of the
 * contract until the shared `src/platform/*` seam lands (PRD §4.1 / Phase 3).
 */

import { createContext, useContext } from 'react'

export interface Platform {
  /** Which shell provided this implementation. */
  readonly name: 'web' | 'desktop'

  /** desktop: local key · web: trial / bring-your-own-key / lock-$STARCHILD (PRD §6). */
  hasInferenceKey(): Promise<boolean>

  /** Streams the assistant reply token-by-token from core + Venice. */
  sendMessage(text: string): AsyncIterable<string>

  /** Encrypted, versioned `.starchild` export (PRD §5). */
  exportData(passphrase: string): Promise<Blob>

  /** Import an encrypted `.starchild` file (PRD §5). */
  importData(file: File, passphrase: string): Promise<void>
}

export const PlatformContext = createContext<Platform | null>(null)

/** Components reach platform features only through this hook. */
export function usePlatform(): Platform {
  const platform = useContext(PlatformContext)
  if (!platform) {
    throw new Error('usePlatform() must be used inside a <PlatformContext.Provider>')
  }
  return platform
}
