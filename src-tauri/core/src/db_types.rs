//! Serializable data-model row types shared across platforms.
//!
//! These mirror the desktop SQLite rows but carry no storage dependency, so
//! both the desktop (SQLite) and web (IndexedDB) storage adapters produce and
//! consume the exact same shapes — which is what makes the encrypted
//! `.starchild` export/import bridge web ⇄ desktop fall out for free.
//!
//! Note: the persisted [`StarchildState`] row below is the storage shape (mood
//! as a string, audit timestamps). The *gameplay* state — with its `Mood` enum
//! and decay logic — lives in [`crate::game`]; the two are converted at the
//! desktop seam.

use serde::{Deserialize, Serialize};

/// The persisted creature state row (singleton, `id = 1`).
///
/// This is the *storage* shape: `mood` is a plain string and the audit
/// timestamps are kept. The live gameplay representation is
/// [`crate::game::StarchildState`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StarchildState {
    pub id: i64,
    pub hunger: f64,
    pub mood: String,
    pub energy: f64,
    pub bond: f64,
    pub xp: i64,
    pub level: i64,
    pub last_decay_at: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub platform: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Memory {
    pub id: String,
    pub content: String,
    pub importance: f64,
    pub category: Option<String>,
    pub created_at: String,
    pub last_accessed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Quest {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub quest_type: String,
    pub category: Option<String>,
    pub status: String,
    pub xp_reward: i64,
    pub streak_count: i64,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub due_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Personality {
    pub warmth: f64,
    pub intensity: f64,
    pub humor: f64,
    pub mysticism: f64,
    pub directness: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportedData {
    pub exported_at: String,
    pub messages: Vec<Message>,
    pub memories: Vec<Memory>,
    pub quests: Vec<Quest>,
    pub personality: Option<Personality>,
    pub settings: Vec<(String, String)>,
}
