import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Web shell build config.
//
// `vite-plugin-wasm` + `vite-plugin-top-level-await` load the shared `core/`
// engine compiled to WASM (PRD §4.5–4.6).
//
// CRITICAL — single React copy: this app imports the SHARED components + store
// from `../../src/`, which resolve react/zustand from the repo-root node_modules,
// while `web/` has its own react. Two React copies → "Invalid hook call" → blank
// page. Dedupe + alias react/react-dom to the root copy so the whole tree
// (shared components + web shell) uses ONE React instance.
const here = dirname(fileURLToPath(import.meta.url)) // web/
const repoRoot = resolve(here, '..')

export default defineConfig({
  plugins: [react(), tailwindcss(), wasm(), topLevelAwait()],
  clearScreen: false,
  resolve: {
    dedupe: ['react', 'react-dom', 'zustand', 'framer-motion'],
    alias: {
      react: resolve(repoRoot, 'node_modules/react'),
      'react-dom': resolve(repoRoot, 'node_modules/react-dom'),
    },
  },
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
