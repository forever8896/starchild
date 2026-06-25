// src/platform/usePlatform.ts — React context + hook for the Platform seam.
//
// Components call `usePlatform()` to reach platform features. The concrete
// implementation is chosen once (desktop vs web) and provided via
// `PlatformProvider`. No component should import `desktop`/`web` directly.
//
// Written without JSX so this stays a `.ts` file; the provider is built with
// `createElement`.

import { createContext, createElement, useContext } from 'react'
import type { ReactNode } from 'react'

import type { Platform } from './index'
import { desktopPlatform } from './desktop'
import { webPlatform } from './web'

/**
 * Pick the platform implementation for the current runtime. Tauri v2 exposes
 * `window.isTauri`; anything else is the browser web shell.
 */
export function detectPlatform(): Platform {
  const isTauri =
    typeof window !== 'undefined' &&
    (window as { isTauri?: boolean }).isTauri === true
  return isTauri ? desktopPlatform : webPlatform
}

const PlatformContext = createContext<Platform | null>(null)

export interface PlatformProviderProps {
  children: ReactNode
  /** Override the auto-detected platform (e.g. for tests/Playwright mocks). */
  platform?: Platform
}

export function PlatformProvider(props: PlatformProviderProps) {
  const value = props.platform ?? detectPlatform()
  return createElement(PlatformContext.Provider, { value }, props.children)
}

/** Access the active platform service. Must be used under `PlatformProvider`. */
export function usePlatform(): Platform {
  const platform = useContext(PlatformContext)
  if (!platform) {
    throw new Error('usePlatform must be used within a PlatformProvider')
  }
  return platform
}
