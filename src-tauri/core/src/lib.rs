//! `starchild_core` — the shared, platform-agnostic Starchild engine.
//!
//! This crate is the single source of truth for all PURE logic: prompt
//! assembly, conversation-phase detection, model routing, creature/game state,
//! the Knowing protocol, response post-processing, the E2EE crypto, and the
//! serializable data-model row types. It contains **no** Tauri, SQLite,
//! `tokio`, or `reqwest` — so it compiles to native **and** WASM and can be
//! driven by both the desktop (Tauri) shell and a future web (WASM) shell.
//!
//! Platform-specific pieces (the `reqwest` Venice client, the SQLite storage,
//! the network half of the E2EE handshake) live in the desktop crate and are
//! wired to this core through thin adapters.

pub mod ai;
pub mod db_types;
pub mod e2ee;
pub mod game;
pub mod inference;
pub mod knowing;
pub mod storage;
