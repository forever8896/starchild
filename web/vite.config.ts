import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { devProxy } from './dev-proxy'
import { VitePWA } from 'vite-plugin-pwa'

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
  plugins: [
    react(),
    tailwindcss(),
    wasm(),
    topLevelAwait(),
    devProxy(),
    // Installable, offline-capable PWA. The manifest is a static file
    // (public/manifest.webmanifest, linked from index.html) so it is served in
    // dev too; the plugin only builds + precaches the service worker
    // (sw/sw.ts → dist/sw.js). Registration happens in src/pwa.ts, and only in
    // production builds — dev/HMR never sees a service worker.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'sw',
      filename: 'sw.ts',
      manifest: false,
      injectRegister: false,
      devOptions: { enabled: false },
      injectManifest: {
        rollupFormat: 'iife',
        // App shell only: HTML, JS, CSS, the WASM core, fonts, icons, manifest.
        // Large media (video/audio) and the big PNG art are runtime-cached on
        // first use instead (see sw/sw.ts). /api is a serverless route, never
        // part of dist, and the SW never routes it.
        globPatterns: ['**/*.{html,js,css,wasm,woff2,webmanifest}', 'icons/{icon-192,favicon-32,apple-touch-icon}.png'],
        globIgnores: ['**/node_modules/**', 'sw.js', 'api/**'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
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
    // The shared UI lives in ../src (components, styles, self-hosted fonts).
    // Assets reached via CSS url() — the Nunito woff2 files — are outside the
    // module graph Vite trusts, so allow the shared tree explicitly (dev only).
    fs: { allow: [here, resolve(repoRoot, 'src'), resolve(repoRoot, 'node_modules')] },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        // Split heavy third-party vendors out of the main entry chunk so the
        // app shell ships small and the big dependencies load as their own
        // cacheable chunks. The WASM core and conditionally-rendered panels
        // (SkillTree, DataSettings, Settings) are additionally lazy-loaded via
        // dynamic import (see wasm-bridge.ts and App.tsx), which Rollup emits as
        // their own async chunks automatically.
        manualChunks(id) {
          if (id.includes('/node_modules/')) {
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/scheduler/')
            ) {
              return 'react-vendor'
            }
            if (id.includes('/framer-motion/') || id.includes('/motion-dom/') || id.includes('/motion-utils/')) {
              return 'framer-motion'
            }
            if (id.includes('/@noble/')) {
              return 'crypto'
            }
          }
        },
      },
    },
  },
  worker: {
    format: 'es',
    plugins: () => [wasm(), topLevelAwait()],
  },
})
