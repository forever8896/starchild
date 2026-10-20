# Phase 1 — Core Extraction (scoping)

> Goal: restructure `src-tauri/src/` into a shared, WASM-safe **`core/`** crate + a thin **`desktop/`** adapter layer, with **zero behavioral change** to the desktop app. This is the unlock for the web shell (every later phase builds on it).

## The good news (from surveying the real code)

The engine is already remarkably decoupled — this is a clean extraction, not a rescue:

| Module | Lines | tauri | sqlite | tokio/reqwest | time::now |
|---|---|---|---|---|---|
| `ai/mod.rs` | 2297 | 0 | 0 | **yes** (lines ~1243+) | 0 |
| `game/mod.rs` | 484 | 0 | 0 | 0 | **11** |
| `knowing/mod.rs` | 413 | 0 | 0 | 0 | 0 |
| `memory/mod.rs` | 95 | 0 | 0 | 0 | 0 |
| `e2ee.rs` | 353 | 0 | 0 | **2 reqwest** | 0 |
| `db/mod.rs` | 1217 | 0 | yes | 0 | — |
| `lib.rs` | 2325 | yes (35 cmds) | — | — | — |

**No engine module imports Tauri, and none touch SQLite directly** — all DB access already flows through `db/mod.rs`, and all Tauri wiring already lives in `lib.rs`. So the boundaries we need already mostly exist; Phase 1 formalizes them.

## The seams (exact split points)

1. **`ai/mod.rs` splits cleanly at ~line 1243.**
   - **Pure → `core/`:** `ModelTier`, `ModelRouter`, `StarchildState`, `PersonalityParams`, `ConversationPhase`, `PhaseDetector`, `PromptBuilder`, `ChatMessage`, `postprocess_response`, `AiError` (minus its `reqwest` variant). ~lines 1–1242.
   - **Network → `desktop/`:** `AiClient` (`reqwest::Client`) + `ensure_e2ee`, `chat`, `chat_stream`, `chat_stream_auto`, `chat_auto`, `describe_image`. ~lines 1243–2297.
2. **`db/mod.rs` *is* the `Storage` trait** — its ~28 public methods define the surface (messages, state, memory/FTS5, knowing, quests, personality, settings, **`export_all_data` / `clear_all_data`** — the export/import primitives we'll reuse in the web's `.starchild` file).
3. **`game/mod.rs`** — pure except **11 clock reads** (hunger decay, timestamps). These become **injected** (`now: i64` param / a `Clock`), since `SystemTime::now()` panics in WASM.
4. **`e2ee.rs`** — crypto is pure (→ core); the **2 `reqwest`** calls (fetch Venice attestation/pubkey) split into an adapter fn.
5. **`knowing` / `memory`** — already clean → move as-is (memory's FTS5 *search* is a `Storage` method on the desktop impl; web returns empty initially).
6. **`lib.rs`** — the 35 `#[tauri::command]`s + `AppState` → `desktop/ipc_commands.rs`; thin wrappers over the core engine.

## Target structure

```
src-tauri/src/
├── core/                      ← shared crate: native + WASM, no Tauri/SQLite/tokio/reqwest
│   ├── types.rs               ← StarchildState, ConversationPhase, ChatMessage, Quest, Memory,
│   │                            Personality, KnownFact, ExportedData, AiError(pure)…
│   ├── model_router.rs · prompt_builder.rs · phase_detector.rs   ← from ai/ (1–1242)
│   ├── game_state.rs          ← from game/ (clock injected)
│   ├── knowing.rs · memory.rs ← as-is (recall logic)
│   ├── e2ee.rs                ← crypto only
│   ├── storage.rs             ← trait Storage (from db's method surface)
│   ├── inference.rs           ← trait InferenceSender (from AiClient's chat/stream)
│   └── engine.rs              ← (optional, see decision) orchestration over the two traits
├── desktop/
│   ├── storage.rs             ← db/mod.rs → impl Storage (rusqlite)
│   ├── venice_client.rs       ← AiClient → impl InferenceSender (reqwest/tokio)
│   ├── e2ee_net.rs            ← attestation fetch
│   ├── ipc_commands.rs        ← the 35 commands (thin)
│   └── native.rs              ← tray/notify/files (later phases)
└── lib.rs                     ← slim: builds AppState, registers desktop commands
```

## The two traits

```rust
// core/storage.rs — desktop = SQLite, web = IndexedDB (via WASM callbacks)
#[async_trait] pub trait Storage: Send + Sync {
  async fn save_message(&self, m:&Message)->Result<()>; async fn get_messages(&self,limit:i64)->Result<Vec<Message>>;
  async fn get_state(&self)->Result<StarchildState>;    async fn save_state(&self,s:&StarchildState)->Result<()>;
  async fn search_memories(&self,q:&str,limit:i64)->Result<Vec<Memory>>;  // desktop FTS5; web → empty
  async fn save_knowing_fact(..)->..; async fn get_knowing_facts(..)->..;
  async fn create_quest(..)->..; async fn get_quests(..)->..; async fn complete_quest(..)->..;
  async fn get_setting(..)->..; async fn set_setting(..)->..;
  async fn export_all_data(&self)->Result<ExportedData>; async fn clear_all_data(&self)->Result<()>;
  // …full surface mirrors db/mod.rs's pub methods
}
// core/inference.rs — desktop = reqwest AiClient, web = JS fetch
#[async_trait] pub trait InferenceSender: Send + Sync {
  async fn chat_stream(&self, req: ChatRequest, on_token: &mut dyn FnMut(&str)) -> Result<String, AiError>;
}
```

## Key design decision: where does orchestration live?

The "process a user message" flow (load state → build prompt → send → postprocess → detect phase → update state → save → maybe offer quest) currently lives **inside the `lib.rs` commands**.

- **Option A — move orchestration into `core/engine.rs`** (over the two traits). Both shells call the same `Engine::process_message`; truest to "one edit, both shells," but it's the hardest part (async traits crossing the WASM↔JS boundary).
- **Option B (recommended for Phase 1) — leave orchestration in the commands for now;** Phase 1 only moves *pure logic + types + trait definitions* and wires desktop through them. Consolidate orchestration into `core/engine.rs` **when we build the web bridge** (Phase 2–3), so it gets written **once** and both shells adopt it together — instead of writing it twice.

Recommendation: **B.** It keeps Phase 1 contained, low-risk, and desktop-behavior-identical; the orchestration consolidation lands exactly when the web shell needs it, with no throwaway work.

## Ordered tasks (each with a gate)

1. **Workspace** — add `core` as a Cargo workspace member; `src-tauri` depends on it. *Gate: `cargo check`.*
2. **`core/types.rs`** — move shared structs/enums (incl. db row types). *Gate: `cargo check`.*
3. **Move pure ai logic** → `core/{model_router,prompt_builder,phase_detector}.rs`; leave `AiClient` behind. *Gate: `cargo check` + `cargo test` (phase/prompt tests).*
4. **`game_state.rs`** — move + inject the 11 clock reads. *Gate: tests; behavior identical.*
5. **`knowing.rs`, `memory.rs`, `e2ee.rs`** — move; split e2ee's 2 network calls to `desktop/e2ee_net.rs`. *Gate: `cargo check`.*
6. **Define `Storage` + `InferenceSender`** in core; **adapt `db/mod.rs` → `desktop/storage.rs`** and `AiClient → desktop/venice_client.rs` to impl them. *Gate: `cargo test`.*
7. **Shims** — old paths (`crate::ai`, `crate::game`, …) re-export from `core` so unrelated code/imports don't churn. *Gate: `cargo check`.*
8. **Slim `lib.rs`** — commands call core logic through the traits (orchestration stays per Option B). *Gate: `cargo check`.*
9. **CI lint (Golden Rule)** — fail if `core/` references `tauri`/`rusqlite`/`tokio`/`reqwest`. *Gate: lint passes.*
10. **Full verification.** *Gate: `cargo test` ✓, `npm run tauri dev` behaves identically, `npm run test:e2e` (LLM-judged) ✓.*

## Risks & estimate

- **Async-trait ergonomics** in Rust (object-safe `Storage`/`InferenceSender`) — standard with `async-trait`; the WASM-side impl is deferred (Option B).
- **`postprocess_response` / phase detection edge cases** — covered by moving the existing unit tests with them.
- **Hidden coupling in `lib.rs`** (state shared across commands) — `AppState` stays desktop-side; engine takes deps explicitly.

**Estimate: ~4–6 focused days.** Most of it is mechanical moves (the engine is pre-decoupled); the real work is the three small surgeries (ai HTTP split, game clock injection, e2ee net split) + defining the two traits and adapting `db` + `AiClient` to them.

## Definition of done (Phase 1)

- `core/` compiles standalone with **no** Tauri/SQLite/tokio/reqwest (CI-enforced).
- `desktop/` implements `Storage` + `InferenceSender`; `lib.rs` is slim.
- **Desktop app builds and behaves identically**; `cargo test` + LLM-judged E2E green.
- The engine is now a library both a Tauri shell and (next) a WASM shell can drive.
