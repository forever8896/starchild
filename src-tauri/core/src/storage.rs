//! The `Storage` trait — the platform-agnostic persistence surface.
//!
//! Its method surface mirrors the desktop SQLite layer (`crate::db` on the
//! desktop side), but it carries no storage dependency, so each shell can back
//! it with its own engine: the desktop implements it over SQLite (with FTS5
//! memory search), and the web will implement it over IndexedDB. Because both
//! produce and consume the same [`crate::db_types`] row shapes, the encrypted
//! `.starchild` export/import bridge falls out for free.

use async_trait::async_trait;

use crate::db_types::{ExportedData, Memory, Message, Personality, Quest, StarchildState};
use crate::knowing::KnownFact;

/// Errors surfaced by a [`Storage`] backend.
///
/// Backends keep their native error type (e.g. the desktop's `rusqlite`-based
/// `DbError`) and map into this networking-free, WASM-safe enum at the trait
/// boundary.
#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    /// Any backend failure (I/O, SQL, serialization, lock poisoning, …),
    /// stringified so this core type stays dependency-free.
    #[error("storage backend error: {0}")]
    Backend(String),

    /// A required row was not found.
    #[error("row not found: {0}")]
    NotFound(String),
}

pub type Result<T> = std::result::Result<T, StorageError>;

/// Persistence surface shared by every Starchild shell.
///
/// Desktop = SQLite; web = IndexedDB (via WASM callbacks). The `search_memories`
/// method is desktop-only FTS5 today; the web shell returns an empty result
/// until a lighter recall lands.
#[async_trait]
pub trait Storage: Send + Sync {
    // -- messages ------------------------------------------------------------
    async fn save_message(&self, id: &str, platform: &str, role: &str, content: &str)
        -> Result<()>;
    async fn get_messages(&self, limit: i64) -> Result<Vec<Message>>;
    async fn count_messages(&self) -> Result<i64>;
    async fn delete_message(&self, id: &str) -> Result<()>;

    // -- creature state ------------------------------------------------------
    async fn get_state(&self) -> Result<StarchildState>;
    async fn save_state(&self, state: &StarchildState) -> Result<()>;

    // -- memories (desktop = FTS5; web = empty for now) ----------------------
    async fn save_memory(
        &self,
        id: &str,
        content: &str,
        importance: f64,
        category: Option<&str>,
    ) -> Result<()>;
    async fn search_memories(&self, query: &str, limit: i64) -> Result<Vec<Memory>>;
    async fn get_all_memories(&self, limit: i64) -> Result<Vec<Memory>>;
    async fn delete_memory(&self, id: &str) -> Result<()>;

    // -- knowing facts -------------------------------------------------------
    async fn save_knowing_fact(
        &self,
        id: &str,
        category: &str,
        fact: &str,
        importance: f64,
        confidence: f64,
    ) -> Result<()>;
    async fn get_knowing_facts(&self) -> Result<Vec<KnownFact>>;
    async fn get_knowing_fact_count(&self) -> Result<usize>;

    // -- quests --------------------------------------------------------------
    #[allow(clippy::too_many_arguments)]
    async fn create_quest(
        &self,
        id: &str,
        title: &str,
        description: Option<&str>,
        quest_type: &str,
        category: Option<&str>,
        xp_reward: i64,
        due_at: Option<&str>,
    ) -> Result<Quest>;
    async fn get_quests(&self, status: Option<&str>) -> Result<Vec<Quest>>;
    async fn complete_quest(&self, id: &str) -> Result<Quest>;
    async fn delete_quest(&self, id: &str) -> Result<()>;
    async fn get_quests_due_soon(&self, hours: f64) -> Result<Vec<Quest>>;

    // -- personality ---------------------------------------------------------
    async fn get_personality(&self) -> Result<Personality>;
    async fn save_personality(&self, p: &Personality) -> Result<()>;

    // -- settings ------------------------------------------------------------
    async fn get_setting(&self, key: &str) -> Result<Option<String>>;
    async fn set_setting(&self, key: &str, value: &str) -> Result<()>;

    // -- export / privacy ----------------------------------------------------
    async fn export_all_data(&self) -> Result<ExportedData>;
    async fn clear_all_data(&self) -> Result<()>;
}
