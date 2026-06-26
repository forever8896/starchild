/**
 * main.tsx — web shell bootstrapper.
 *
 * The web shell mounts the SHARED platform seam (`src/platform/*`). With no
 * `platform` override, `PlatformProvider` auto-detects the runtime: in the
 * browser `window.isTauri` is unset, so it selects the web implementation
 * (`src/platform/web.ts` — WASM core + IndexedDB + Venice proxy/BYOK). Shared
 * components below reach platform features only through `usePlatform()`, exactly
 * as they do on desktop (PRD §4.4, the Golden Rule).
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { PlatformProvider } from '../../src/platform/usePlatform'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlatformProvider>
      <App />
    </PlatformProvider>
  </StrictMode>,
)
