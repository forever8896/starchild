# Starchild Web — Product Requirements Document

> **Status:** Draft v3 — full product (supersedes the earlier web-demo draft)
> **Author:** Claude, for Kilian (@KilianSolutions)
> **One-liner:** The full Starchild experience in the browser — local-first, no accounts, with encrypted export/import to move between web and desktop. **One shared core; every edit ships to both shells.**
> **Prerequisite reading:** `docs/ARCHITECTURE.md`, `AGENTS.md`, `docs/inference-access-spec.md`

---

## 1. Vision & Strategy

Starchild is a Tauri desktop app today. The web edition makes it a **second shell over the same core** — a real, full Starchild you can open in one click. This is a focus bet for three reasons that reinforce each other:

- **Distribution.** A browser link beats "clone the repo, install Rust, build." Every visitor can use Starchild instantly.
- **Focus.** The web is a simpler target (no native, no bots, no OS integration), so iterating the *core experience* — conversation, creature, skill tree — is faster.
- **Testability.** A browser build is **Playwright-testable end-to-end** — a deterministic quality net the Tauri app can't easily have (§8).

**This is not a demo.** It is the full experience, persisted locally in the browser, portable to desktop via export/import.

## 2. Principles (non-negotiable)

- **Private by design, still.** No accounts, no login, no server-side user data, no cloud. Conversation data lives in the **browser** (IndexedDB) exactly as the desktop keeps it in **local SQLite**. The only thing that leaves the device is the E2EE inference call to Venice. Two tiers, both private: **desktop = purely local; web = local-to-the-browser, portable by you.**
- **One core, two shells.** Every change to the conversation engine, prompts, creature logic, or skill tree lands in **shared modules** and ships to both platforms automatically. Platform code is thin adapters only. This is the Golden Rule (§4.1) and the reason the web edition is sustainable.
- **You own your data.** Export to an encrypted file anytime; import into desktop or another browser. No lock-in, no server custody, no "delete my account" because there is no account.
- **Free & ungated.** The experience is free. Inference is funded by your own key or by locking $STARCHILD (the token utility) — never a paywall on the product itself.

## 3. Goals & Non-Goals

### Goals
- The **full** Starchild experience in the browser (not a capped taste).
- **Local-first** browser storage (IndexedDB), same data model as desktop.
- **Encrypted, versioned export/import** that bridges web ↔ desktop in both directions.
- **One shared core** — an edit to shared code reflects on both platforms with no per-platform logic.
- **Playwright E2E** suite over the real web app.
- **Inference** via bounded trial → bring-your-own-key → lock $STARCHILD.

### Non-Goals
- Accounts, login, or any server-side user identity.
- Cloud sync / server-held conversation data / real-time multi-device auto-sync (export/import is the bridge instead).
- Multi-channel bots (Telegram/WhatsApp) on web — desktop only.
- Native OS integration (tray, notifications, file dialogs) on web.

## 4. Architecture — one core, two shells

The entire strategy rests on a clean shared surface, so an edit ships to both shells. This section is the heart of the PRD.

### 4.1 The Golden Rule

There are exactly **two shared surfaces**:
- `src-tauri/src/core/*` — all engine logic (Rust, compiles to native **and** WASM).
- `src/components/*` + `src/platform/*` — all UI + the platform seam (React/TS).

> If a change lives only in those, it improves **both** platforms. Platform adapters (`desktop/`, `web/`) are **mechanical** — they implement a trait or interface, never alter logic. A feature that needs an adapter change should change the adapter *only to wire*, never to branch behavior.

**Enforced, not just hoped:** a CI lint fails the build if `core/` imports Tauri/SQLite/`tokio`/`reqwest`, or if `src/components/*` contains `invoke(` or `if (platform === …)`. The shared surface is a contract.

### 4.2 Module map (what's shared vs platform-specific)

| Module | Location | Shared? | Notes |
|---|---|---|---|
| Engine logic | `src-tauri/src/core/*` (Rust → native+WASM) | ✅ | prompt builder, phase detector, model router, game state, knowing, types, Storage trait |
| React components | `src/components/*` | ✅ | UI; reach platform features only via the platform service |
| Platform service | `src/platform/*` | ✅ | interface + desktop & web impls — the only seam components import |
| Store / styles | `src/store.ts`, `src/index.css` | ✅ | add a `platform` field |
| Desktop adapters | `src-tauri/src/desktop/*` | ❌ | Tauri IPC, SQLite storage, FTS5 memory, native (tray/notify/files) |
| Web adapters | `web/src/*` | ❌ | IndexedDB storage, WASM bridge, Venice proxy/BYOK client, Vite shell |

### 4.3 Core engine extraction

Restructure `src-tauri/src/` into a no-Tauri, no-SQLite, WASM-safe `core/` crate plus a `desktop/` adapter layer:

```
src-tauri/src/
├── core/                 ← shared crate (native + WASM); NO Tauri, NO SQLite, NO tokio/reqwest
│   ├── prompt_builder.rs · phase_detector.rs · model_router.rs
│   ├── game_state.rs · knowing.rs · types.rs
│   └── storage.rs        ← Storage trait (impl'd by each platform)
├── desktop/              ← Tauri-specific adapters
│   ├── ipc_commands.rs · storage.rs (SQLite)
│   ├── memory.rs         ← FTS5 search (SQLite — desktop-only, NOT in WASM)
│   └── native.rs         ← tray, notifications, file dialogs
└── (ai/game/knowing/memory/e2ee shims re-exporting from core/desktop)
```

WASM-compat: `core/` keeps only pure logic; the HTTP client + any `tokio`/`SystemTime` stay in adapters; `getrandom` uses its `js` feature; timestamps are injected, not read in `core/`. (Memory/FTS5 is SQLite → desktop-only; the web supplies an empty/lighter recall — see §7.)

### 4.4 Platform service (the one seam in components)

```typescript
// src/platform/index.ts — components depend ONLY on this
export interface Platform {
  hasInferenceKey(): Promise<boolean>           // desktop: local key; web: trial/BYOK/locked
  sendMessage(text: string): AsyncIterable<string>  // streams from core+Venice
  exportData(passphrase: string): Promise<Blob>     // §5
  importData(file: File, passphrase: string): Promise<void>
  // …onboarding, quests, settings
}
// src/platform/desktop.ts → Tauri invoke/events ; src/platform/web.ts → WASM + IndexedDB + proxy/BYOK
```

Components call `usePlatform()`. No `invoke`, no platform branches in components.

### 4.5 Storage trait & 4.6 WASM bridge

One `Storage` trait over the shared `core/` types; desktop implements it on SQLite, web on IndexedDB. WASM does **pure logic only** (prompt assembly, phase, state, knowing); **all networking is JS** (`venice-proxy.ts`), so streaming/retries/timeouts use the browser and the WASM build stays free of `tokio`/`reqwest`.

## 5. Data portability — encrypted export / import (web ⇄ desktop)

The "switch between desktop and web" is a **file you own**, not a server.

- **Format:** a single `.starchild` file = a **versioned, passphrase-encrypted** serialization of the core data model (messages, knowing profile, quests, creature state, settings). Because both shells produce/consume the **same `core/` types**, web↔desktop interop falls out for free.
- **Encryption:** passphrase → key via Argon2id → AES-256-GCM over the payload. Safe at rest even if dropped in Drive/iCloud. (No passphrase recovery — you hold it; the UX says so plainly.)
- **Versioning:** a `schemaVersion` + forward migrations, so an export from an older app imports cleanly into a newer one (and across web↔desktop).
- **Flows:** Web *Export* → download file · Web *Import* ← file (first-run "I have a Starchild" or Settings) · Desktop gets the **matching** Export/Import (reads/writes the same file into SQLite).
- **UX (critical, per the storage trade-off):** one-click export; a gentle, recurring **backup nudge** (browser storage can be cleared); clear "your data lives in this browser — export to back up or move devices" messaging.

## 6. Inference funding

Storage is local; inference is the one thing that costs money. The web edition offers **three ways to power it**, all surfaced in Settings. **Resolution order: BYOK key → locked-token key → sponsored demo.** BYOK and the locked-token key are fully private (the key lives in the browser; conversation runs client↔Venice E2EE; our backend is never in the path). The sponsored demo is the only non-E2EE path and is labelled as such.

### 6.1 Sponsored demo — zero-friction first taste *(scaffold: `web/api/proxy.ts` ✅ + a dev shim)*
Founder-funded (from ETH fees), bounded, **no key required** — so the app never *demands* a key just to try it.
- The browser calls **our proxy**, never Venice directly. The proxy holds the demo key (env only, never in client JS), pins a cheap model, **logs no prompt/response content**, rate-limits per IP, and enforces a **monthly USD ceiling** with graceful "rest mode" (§5.7). `web/api/proxy.ts` already implements this.
- **Production:** the proxy ships as an edge function beside the web app.
- **Local dev:** a Vite dev-server middleware serves `/api/proxy` from `VENICE_TRIAL_KEY`, so the demo works in `npm run dev` without deploying. *(scaffold: `web/dev-proxy.ts` wired in `web/vite.config.ts`)*

### 6.2 Lock $STARCHILD → free private key — the token utility *(ties to `docs/inference-access-spec.md`)*
The web edition is the distribution surface; **locking the token unlocks free, private, hosted-key usage.** This makes the web app and the token utility reinforce each other. Flow:
1. **Connect wallet** (Base) in Settings → "Unlock free private access."
2. **Lock** — call `StarchildLock.lock(amount, duration)` (the built, tested contract; locked tokens still vote).
3. **Claim** — the web app POSTs the token site's **`/api/access/claim`** with an EIP-712 signature proving wallet ownership → backend verifies the lock on-chain → mints a **capped, expiring Venice inference key** (admin key) → returns it.
4. **Use** — the minted key is stored in the **same local key slot as BYOK**; the web app talks to Venice **directly, E2EE** — the mint backend is never in the conversation path. The key auto-expires at `unlockAt`.
- Cap mapping, the admin key, and the `/api/access/claim` mint endpoint are specced in `docs/inference-access-spec.md` (the contract is built; the mint endpoint + a Venice **admin key** are the remaining build — the one external dependency).
- *(scaffold: `web/src/access.ts` — wallet connect + `lock()` + `claim()` → returns a Venice key; a "Free private access" panel in `web/src/Settings.tsx`; the token-site `/api/access/claim` route.)*

### 6.3 Bring-your-own Venice key (BYOK) — ✅ exists
Paste your own key (Settings → IndexedDB `venice_api_key`); fully private. For anyone who already has Venice.

No fiat tier for v1 (keeps it simple + on-brand); revisit if demand warrants. The three tiers are DAO-tunable (caps, durations, demo budget).

## 7. Feature scope on web

**Full experience:** onboarding, the complete conversation arc (all phases), creature (mood/hunger/tick), skill tree, quests (offer/accept/decline/proof), knowing profile, Venice TTS, E2EE inference.
**Desktop-only (graceful absence on web):** FTS5 memory recall (web ships with lighter/no cross-session recall initially), native tray/notifications, Telegram/WhatsApp bots, OS file dialogs (web uses browser download/upload for export/import).

## 8. Testing — Playwright (the quality win)

Because the web build runs the **real** React components + **real** core engine in a browser, Playwright can drive the actual product deterministically:
- Mock the Venice call **at the platform/proxy seam** (canned streamed responses) so flows are fast and non-flaky.
- Cover: onboarding → first preferential-reality question → multi-turn arc → quest offer/accept → creature reaction → export → re-import.
- This **doubles as the shared-core regression net**: since web runs the same `core/` both platforms share, Playwright effectively guards the core logic for desktop too.
- Keep the desktop **LLM-judged** E2E tests for live-model quality; use Playwright for deterministic flow/UX/regression. Run Playwright in CI on every PR.

## 9. Implementation phases

1. **Core extraction** — `core/` + `desktop/`, zero desktop behavior change; CI lint for the Golden Rule.
2. **WASM** — compile `core/`, the bridge, verify pure logic runs in-browser.
3. **Platform service** — interface + desktop/web impls; refactor `Onboarding` off direct `invoke`.
4. **Web shell + storage** — Vite app, IndexedDB Storage adapter, wire the full experience.
5. **Export/import** — encrypted versioned file; desktop import/export of the same format; web↔desktop round-trip test.
6. **Inference access (§6)** — three tiers, resolution order BYOK → locked → demo:
   - **Sponsored demo:** the edge proxy (`web/api/proxy.ts` ✅) for prod + a Vite **dev shim** (`web/dev-proxy.ts`) so the demo works in `npm run dev` keylessly.
   - **BYOK** ✅ (exists).
   - **Lock $STARCHILD:** `web/src/access.ts` (wallet connect → `StarchildLock.lock` → claim) + a "Free private access" panel in Settings + the token-site `/api/access/claim` mint endpoint (`docs/inference-access-spec.md`; the one external dep is a Venice **admin key**).
7. **Playwright E2E** — the suite above, in CI.
8. **Polish & deploy** — `app.starchild.software` (or `/app`), backup-nudge UX, analytics (page-level only, no content).

## 10. Acceptance criteria

- [ ] Full flow works in-browser: onboarding → conversation → quest → creature reaction, persisted across reloads (IndexedDB).
- [ ] **Export from web imports into desktop, and desktop export imports into web** (round-trip, same file).
- [ ] A change to `core/*` or `src/components/*` reflects on **both** platforms with **no** platform-specific branch.
- [ ] CI lint blocks Tauri/SQLite/`tokio` in `core/`, and `invoke`/platform branches in `components/`.
- [ ] The trial key never appears in any client bundle; the proxy logs no content.
- [ ] No server holds user conversation data (there is no user-data server).
- [ ] Playwright suite (onboarding→arc→quest→export→import) green in CI.
- [ ] Desktop app unchanged (LLM-judged E2E still pass).

## 11. Risks & open questions

| Risk | Mitigation |
|---|---|
| Browser storage cleared / per-device | One-click export + recurring backup nudges; clear messaging; export is the cross-device path |
| WASM perf / load time | Pre-warm on load; stream tokens; lazy-load heavy modules |
| Export schema drift web↔desktop | `schemaVersion` + migrations; round-trip test in CI |
| Trial inference cost | Proxy-only key, monthly ceiling + rest mode, per-IP limits |
| Core extraction regresses desktop | Phase 1 changes no behavior; desktop E2E gates the merge |

**Open questions:** Venice TTS in-browser support? How much memory recall to ship on web (none → lighter JS search later)? Domain — `app.starchild.software` vs a path on the landing site? Encrypt IndexedDB at rest too (vs only the export)?

## 12. Appendix — new files (sketch)

```
src/platform/{index.ts, desktop.ts, web.ts, usePlatform.ts}     ← shared seam
web/{index.html, vite.config.ts, build-wasm.sh, src/{main.tsx, App.tsx,
      storage.ts (IndexedDB), wasm-bridge.ts, venice-proxy.ts,
      export.ts (encrypt/decrypt + schema), hooks/useWasmEngine.ts}}
web/api/proxy.ts                                                ← sponsored-demo proxy (no-logging, prod edge fn)
web/dev-proxy.ts                                                ← dev shim: serves /api/proxy from VENICE_TRIAL_KEY in `npm run dev`
web/src/access.ts                                              ← lock $STARCHILD → claim a minted Venice key (token utility)
token/src/app/api/access/claim/route.ts                        ← mint endpoint (verifies lock, mints capped/expiring key; needs Venice admin key)
src-tauri/src/core/* + src-tauri/src/desktop/*                  ← extraction
src-tauri/src/desktop/import_export.rs                          ← desktop side of the .starchild file
tests/web-e2e/*                                                 ← Playwright
```
