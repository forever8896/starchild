//! Creature / game state.
//!
//! The logic now lives in the shared `starchild_core::game` crate (native +
//! WASM); this module re-exports it at the original `crate::game` path so the
//! rest of the desktop app compiles unchanged.

pub use starchild_core::game::*;
