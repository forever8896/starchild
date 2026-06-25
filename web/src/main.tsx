/**
 * main.tsx — platform bootstrapper.
 *
 * The web shell always selects the web platform implementation and hands it to
 * the app through `PlatformContext`. The Tauri shell has its own bootstrapper
 * that selects the desktop impl; components below this point never know which
 * shell they run in (PRD §4.4, the Golden Rule).
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { PlatformContext, type Platform } from './platform'
import { createWebPlatform } from './platform/web'

const platform: Platform = createWebPlatform()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlatformContext.Provider value={platform}>
      <App />
    </PlatformContext.Provider>
  </StrictMode>,
)
