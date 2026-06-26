import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

// Web shell build config.
//
// `vite-plugin-wasm` + `vite-plugin-top-level-await` let us load the shared
// `core/` engine compiled to WASM (PRD §4.5–4.6) — the WASM bridge uses ESM
// integration and top-level await, which need esnext output to pass through
// untouched. The core is built in a later phase; this config is ready for it.
export default defineConfig({
  plugins: [react(), tailwindcss(), wasm(), topLevelAwait()],
  clearScreen: false,
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    target: 'esnext',
  },
  worker: {
    format: 'es',
    plugins: () => [wasm(), topLevelAwait()],
  },
})
