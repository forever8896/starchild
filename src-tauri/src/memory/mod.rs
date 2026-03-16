use crate::db::Database;
use uuid::Uuid;

/// Simple memory system that stores and retrieves user-related memories.
/// Integrates with the FTS5-indexed memories table.
#[derive(Clone)]
pub struct MemorySystem {
    db: Database,
}

impl MemorySystem {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    /// Store a new memory about the user.
    pub fn store(
        &self,
        content: &str,
        importance: f64,
        category: Option<&str>,
    ) -> Result<String, String> {
        let id = Uuid::new_v4().to_string();
        self.db
            .save_memory(&id, content, importance, category)
            .map_err(|e| e.to_string())?;
        Ok(id)
    }

    /// Search memories by query string using FTS5.
    pub fn recall(&self, query: &str, limit: i64) -> Result<Vec<String>, String> {
        let memories = self
            .db
            .search_memories(query, limit)
            .map_err(|e| e.to_string())?;
        Ok(memories.into_iter().map(|m| m.content).collect())
    }

    /// Get all recent memories (for context building).
    pub fn recent(&self, limit: i64) -> Result<Vec<String>, String> {
        let memories = self
            .db
            .get_all_memories(limit)
            .map_err(|e| e.to_string())?;
        Ok(memories.into_iter().map(|m| m.content).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn test_memory() -> MemorySystem {
        MemorySystem::new(Database::in_memory())
    }

    #[test]
    fn store_and_recall() {
        let mem = test_memory();
        mem.store("User loves Rust programming", 0.8, Some("interest"))
            .expect("store");
        let results = mem.recall("Rust", 10).expect("recall");
        assert_eq!(results.len(), 1);
        assert!(results[0].contains("Rust"));
    }

    #[test]
    fn recall_no_match() {
        let mem = test_memory();
        mem.store("User likes cats", 0.5, None).expect("store");
        let results = mem.recall("dogs", 10).expect("recall");
        assert!(results.is_empty());
    }

    #[test]
    fn recent_returns_memories_not_messages() {
        let mem = test_memory();
        mem.store("Fact one", 0.9, None).expect("store");
        mem.store("Fact two", 0.5, None).expect("store");
        let recent = mem.recent(10).expect("recent");
        assert_eq!(recent.len(), 2);
        // Ordered by importance DESC
        assert_eq!(recent[0], "Fact one");
        assert_eq!(recent[1], "Fact two");
    }

    #[test]
    fn store_empty_content() {
        let mem = test_memory();
        // Empty content should still store (caller is responsible for filtering)
        let id = mem.store("", 0.5, None).expect("store");
        assert!(!id.is_empty());
    }
}
