import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PlatformProvider } from './platform/usePlatform'

// Provide the platform seam to all shared components. With no override,
// `PlatformProvider` auto-detects the runtime — on the Tauri desktop shell
// (`window.isTauri`) it selects the desktop implementation, preserving every
// existing IPC command. Components reach platform features via `usePlatform()`.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlatformProvider>
      <App />
    </PlatformProvider>
  </StrictMode>,
)
