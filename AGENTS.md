# AGENTS.md

## What is Starchild?

Starchild is a privacy-first AI companion desktop app that helps users find their life's purpose through gamified quests and research-backed conversation. It runs as a native Tauri 2 application with all data stored locally.

## How to Interact

### As a User
1. Clone the repo, `npm install`, and `npm run tauri dev`
2. Complete onboarding (enter Venice AI API key, choose a name)
3. Starchild opens with a "preferential reality" question — answer honestly
4. Conversations flow through a purpose-built arc (Arrive → Dig → Crystallize → Explore → Reframe → Quest → Release)
5. Accept or decline quests — they appear on your skill tree
6. Complete quests by sharing proof with your Starchild

### As an Agent Judge
- **Live deployment:** Clone the repo, `npm install`, and `npm run tauri dev`
- **Landing page:** https://starchild-bay.vercel.app
- **Downloads:** https://github.com/forever8896/starchild/releases/tag/v0.2.0
- **API requirement:** A Venice AI API key is needed (free tier works). Set via the onboarding UI or `VENICE_API_KEY` env var
- **E2E tests:** Run `npm run test:e2e` to see conversation quality verified by an LLM judge
- **No cloud dependency:** All data is local SQLite. The only external call is to Venice AI (zero retention, E2EE) — there is no blockchain, no relay, no telemetry

### Run the web edition (in-browser)
The full experience also runs in a browser — local-first (IndexedDB), no install: `cd web && npm install && npm run dev` → http://localhost:5174. Inference: paste a Venice key in **Settings** (BYOK), or set `VENICE_TRIAL_KEY` for the sponsored demo. Same shared core as desktop; your data is portable via an encrypted `.starchild` export/import (web ⇄ desktop). Web E2E: `npm run test:web-e2e` (Playwright).

## Capabilities

| Capability | Description |
|-----------|-------------|
| **Conversation** | Purpose-built conversation arc using MI, Clean Language, SFBT, ACT techniques |
| **Memory** | FTS5 full-text search over accumulated user knowledge, recalled into every prompt |
| **Knowing** | 7-dimension user profile (values, desires, fears, thinking patterns, relationships, life situation, growth edges) |
| **Quest System** | AI-generated quests across 3 life branches (Body, Mind, Spirit) with accept/decline, proof-of-completion, negotiation |
| **Skill Tree** | SVG constellation map visualizing user's growth toward their preferential reality |
| **Creature** | Tamagotchi-style entity with hunger decay, mood states, XP, leveling, bond system |
| **TTS** | Venice text-to-speech (Bella voice) with character-by-character synced text reveal |
| **E2EE** | AES-256-GCM + HKDF key derivation; conversation runs on GLM-4.7 inside a Venice TEE |
| **Multi-channel** | Desktop + Telegram bot + WhatsApp bot, unified conversation context |

## Architecture Summary

- **Frontend:** React 19 + TypeScript + Tailwind CSS 4 + Framer Motion (shared across both shells)
- **Backend:** Rust — a pure `starchild_core` crate (native **and** WASM) + thin platform adapters (Tauri/SQLite for desktop; IndexedDB + a WASM bridge for web)
- **AI:** Venice API (E2EE, zero retention) — GLM-4.7 for conversation, Llama 3.3 70B for internal tasks
- **Landing page + token site:** Next.js on Vercel
- **Prompt System:** 11 composable layers with conversation phase detection and quest cycling

## Two shells, one core — READ THIS BEFORE CHANGING THE EXPERIENCE

Starchild ships as **two shells over one shared core**: a Tauri **desktop** app and an in-browser **web** edition. The whole point is that improving the experience happens **once** and reaches both — no per-platform forks, no drift.

- **Shared surfaces (edit here to improve both shells):**
  - `src-tauri/core/` — the `starchild_core` crate: prompt builder, phase detector, model router, game/creature, knowing, quest detection/extraction, memory ranking, e2ee crypto. **Pure: no Tauri, SQLite, tokio, or reqwest** (enforced by `scripts/check-core-purity.sh`, wired into CI). Compiles to native (desktop) and WASM (web).
  - `src/components/*` — shared React UI. They reach platform features **only** through `src/platform/` (`usePlatform()`), **never** Tauri `invoke` directly.
- **Platform adapters (mechanical only — implement, never branch logic):**
  - `src/platform/{index,desktop,web,usePlatform}.ts` — the one seam. `desktop.ts` wraps Tauri IPC; `web.ts` wraps the WASM bridge + IndexedDB + the Venice proxy/BYOK.
  - `src-tauri/src/desktop/*` (SQLite, FTS5 memory, IPC) and `web/*` (Vite shell, IndexedDB storage, `wasm-bridge.ts`, `venice-proxy.ts`).
- **The rule:** if logic worth improving lives in only one shell, move it into `core` and have both call it. Don't reimplement core logic in `web/` TypeScript.
- **Verify both:** `cd src-tauri && cargo test` (core + desktop), `cd web && npx vite build && npm run test:web-e2e` (web render + quest loop), `bash scripts/check-core-purity.sh`. Desktop GUI still needs a human `npm run tauri dev` run (no automated harness for the native window).

Full plan: `docs/web-app-prd.md`. Extraction notes: `docs/phase1-core-extraction.md`.

## Key Files

| File / Dir | What It Does |
|------|-------------|
| `src-tauri/core/` | **`starchild_core`** — the shared engine: prompt builder, phase detector, model router, game/creature, knowing, quest detect/extract, memory ranking, e2ee crypto (native + WASM; **pure**) |
| `src-tauri/src/desktop/` + `lib.rs` | Desktop adapters — Tauri IPC commands, SQLite storage, FTS5 memory, the reqwest Venice client |
| `src/platform/` | The platform seam (interface + desktop/web impls) — the ONLY way shared components reach platform features |
| `src/components/` | Shared React UI (ChatWindow, SkillTree, Onboarding, ActiveQuest, …) — used by **both** shells |
| `web/` | Web shell — Vite app, `wasm-bridge.ts`, `storage.ts` (IndexedDB), `venice-proxy.ts`, `export.ts` (.starchild), `dev-proxy.ts`, `api/proxy.ts`, `access.ts` (token lock) |
| `website/` + `token/` | Next.js landing page + token site (the commons) |
| `tests/e2e/` + `tests/web-e2e/` | Desktop LLM-judged E2E + web Playwright (incl. the full quest loop) |
| `docs/web-app-prd.md` | The web edition plan (architecture, portability, inference tiers) |

## How This Was Built

**Phase 1 — Multi-Agent Scaffold:** The initial codebase was generated by [The Agency](agency/), an autonomous 8-agent development framework powered by Claude Code.

**Phase 2 — Human + Claude Iteration:** All subsequent features were built through direct human + Claude Code (Opus 4.6) collaboration. The human provided vision, direction, and decisions. Claude wrote every line of code.

**Assets:** Images generated with Nano Banana 2. Videos generated with Kling 0.3 Pro.

## Model & Framework

- **Agent harness:** Claude Code CLI
- **Model:** Claude Opus 4.6 (1M context)
- **AI inference (runtime):** Venice AI API — GLM-4.7 (E2EE conversation), Llama 3.3 70B (internal tasks)
- **Skills/tools used:** Read, Write, Edit, Bash, Grep, Glob, Agent (subagents for parallel work)
- **Multi-agent framework:** The Agency v2 (custom, open-source, markdown-based coordination)
