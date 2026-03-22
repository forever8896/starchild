use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use thiserror::Error;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Error, Debug)]
pub enum DbError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Lock poisoned")]
    LockPoisoned,

    #[error("Row not found: {0}")]
    NotFound(String),
}

pub type Result<T> = std::result::Result<T, DbError>;

// ---------------------------------------------------------------------------
// Data structs
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub platform: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
}

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
pub struct Attestation {
    pub id: String,
    pub achievement_type: String,
    pub tx_hash: Option<String>,
    pub status: String, // 'pending' | 'confirmed' | 'error'
    pub metadata: Option<String>,
    pub created_at: String,
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
    pub attestations: Vec<Attestation>,
    pub personality: Option<Personality>,
    pub settings: Vec<(String, String)>,
}

// ---------------------------------------------------------------------------
// Database wrapper
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

// Safety: Connection is only ever accessed through the Mutex.
unsafe impl Send for Database {}
unsafe impl Sync for Database {}

#[cfg(test)]
impl Database {
    /// Create an in-memory database for testing (usable from other modules' tests).
    pub fn in_memory() -> Self {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "journal_mode", "WAL").ok();
        run_migrations(&conn).expect("migrations");
        seed_defaults(&conn).expect("seed");
        Database {
            conn: Arc::new(Mutex::new(conn)),
        }
    }
}

impl Database {
    // -- helpers -------------------------------------------------------------

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>> {
        self.conn.lock().map_err(|_| DbError::LockPoisoned)
    }

    // -- messages ------------------------------------------------------------

    pub fn save_message(
        &self,
        id: &str,
        platform: &str,
        role: &str,
        content: &str,
    ) -> Result<()> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO messages (id, platform, role, content) VALUES (?1, ?2, ?3, ?4)",
            params![id, platform, role, content],
        )?;
        Ok(())
    }

    pub fn get_messages(&self, limit: i64) -> Result<Vec<Message>> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT id, platform, role, content, created_at \
             FROM messages ORDER BY created_at DESC, rowid DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit], |row| {
            Ok(Message {
                id: row.get(0)?,
                platform: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;

        let mut messages = Vec::new();
        for row in rows {
            messages.push(row?);
        }
        Ok(messages)
    }

    pub fn count_messages(&self) -> Result<i64> {
        let conn = self.lock()?;
        Ok(conn.query_row("SELECT COUNT(*) FROM messages", [], |row| row.get(0))?)
    }

    // -- starchild state -----------------------------------------------------

    pub fn get_state(&self) -> Result<StarchildState> {
        let conn = self.lock()?;
        conn.query_row(
            "SELECT id, hunger, mood, energy, bond, xp, level, \
                    last_decay_at, created_at, updated_at \
             FROM starchild_state WHERE id = 1",
            [],
            |row| {
                Ok(StarchildState {
                    id: row.get(0)?,
                    hunger: row.get(1)?,
                    mood: row.get(2)?,
                    energy: row.get(3)?,
                    bond: row.get(4)?,
                    xp: row.get(5)?,
                    level: row.get(6)?,
                    last_decay_at: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                DbError::NotFound("starchild_state row not found".into())
            }
            other => DbError::Sqlite(other),
        })
    }

    pub fn save_state(&self, state: &StarchildState) -> Result<()> {
        let conn = self.lock()?;
        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        conn.execute(
            "UPDATE starchild_state SET \
                hunger = ?1, mood = ?2, energy = ?3, bond = ?4, \
                xp = ?5, level = ?6, last_decay_at = ?7, updated_at = ?8 \
             WHERE id = 1",
            params![
                state.hunger,
                state.mood,
                state.energy,
                state.bond,
                state.xp,
                state.level,
                state.last_decay_at,
                now,
            ],
        )?;
        Ok(())
    }

    // -- memories ------------------------------------------------------------

    pub fn save_memory(
        &self,
        id: &str,
        content: &str,
        importance: f64,
        category: Option<&str>,
    ) -> Result<()> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO memories (id, content, importance, category) \
             VALUES (?1, ?2, ?3, ?4)",
            params![id, content, importance, category],
        )?;
        Ok(())
    }

    pub fn search_memories(&self, query: &str, limit: i64) -> Result<Vec<Memory>> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT m.id, m.content, m.importance, m.category, \
                    m.created_at, m.last_accessed_at \
             FROM memories m \
             JOIN memories_fts fts ON m.rowid = fts.rowid \
             WHERE memories_fts MATCH ?1 \
             ORDER BY fts.rank \
             LIMIT ?2",
        )?;
        // Sanitize FTS5 query: wrap in double quotes as phrase query to prevent
        // FTS5 syntax injection (e.g., `user:* OR content:*`).
        let safe_query = format!("\"{}\"", query.replace('"', "\"\""));
        let rows = stmt.query_map(params![safe_query, limit], |row| {
            Ok(Memory {
                id: row.get(0)?,
                content: row.get(1)?,
                importance: row.get(2)?,
                category: row.get(3)?,
                created_at: row.get(4)?,
                last_accessed_at: row.get(5)?,
            })
        })?;

        let mut memories = Vec::new();
        for row in rows {
            memories.push(row?);
        }

        // Batch-update last_accessed_at for returned memories.
        if !memories.is_empty() {
            let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let placeholders: Vec<String> = memories.iter().enumerate().map(|(i, _)| format!("?{}", i + 2)).collect();
            let sql = format!(
                "UPDATE memories SET last_accessed_at = ?1 WHERE id IN ({})",
                placeholders.join(",")
            );
            let mut stmt = conn.prepare(&sql)?;
            let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(now)];
            for mem in &memories {
                params_vec.push(Box::new(mem.id.clone()));
            }
            let param_refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
            stmt.execute(param_refs.as_slice())?;
        }

        Ok(memories)
    }

    pub fn get_all_memories(&self, limit: i64) -> Result<Vec<Memory>> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT id, content, importance, category, created_at, last_accessed_at \
             FROM memories ORDER BY importance DESC, created_at DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit], |row| {
            Ok(Memory {
                id: row.get(0)?,
                content: row.get(1)?,
                importance: row.get(2)?,
                category: row.get(3)?,
                created_at: row.get(4)?,
                last_accessed_at: row.get(5)?,
            })
        })?;
        let mut memories = Vec::new();
        for row in rows {
            memories.push(row?);
        }
        Ok(memories)
    }

    pub fn delete_memory(&self, id: &str) -> Result<()> {
        let conn = self.lock()?;
        conn.execute("DELETE FROM memories WHERE id = ?1", params![id])?;
        Ok(())
    }

    // -- knowing_facts -------------------------------------------------------

    pub fn save_knowing_fact(
        &self,
        id: &str,
        category: &str,
        fact: &str,
        importance: f64,
        confidence: f64,
    ) -> Result<()> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO knowing_facts (id, category, fact, importance, confidence) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, category, fact, importance, confidence],
        )?;
        Ok(())
    }

    pub fn get_knowing_facts(&self) -> Result<Vec<crate::knowing::KnownFact>> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT id, category, fact, importance, confidence, created_at \
             FROM knowing_facts ORDER BY importance DESC, created_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(crate::knowing::KnownFact {
                id: row.get(0)?,
                category: row.get(1)?,
                fact: row.get(2)?,
                importance: row.get(3)?,
                confidence: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        let mut facts = Vec::new();
        for row in rows {
            facts.push(row?);
        }
        Ok(facts)
    }

    pub fn get_knowing_fact_count(&self) -> Result<usize> {
        let conn = self.lock()?;
        let count: i64 =
            conn.query_row("SELECT COUNT(*) FROM knowing_facts", [], |row| row.get(0))?;
        Ok(count as usize)
    }

    // -- quests --------------------------------------------------------------

    pub fn create_quest(
        &self,
        id: &str,
        title: &str,
        description: Option<&str>,
        quest_type: &str,
        category: Option<&str>,
        xp_reward: i64,
        due_at: Option<&str>,
    ) -> Result<Quest> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO quests (id, title, description, quest_type, category, xp_reward, due_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, title, description, quest_type, category, xp_reward, due_at],
        )?;
        // Read back the full row
        conn.query_row(
            "SELECT id, title, description, quest_type, category, status, \
                    xp_reward, streak_count, created_at, completed_at, due_at \
             FROM quests WHERE id = ?1",
            params![id],
            |row| {
                Ok(Quest {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    description: row.get(2)?,
                    quest_type: row.get(3)?,
                    category: row.get(4)?,
                    status: row.get(5)?,
                    xp_reward: row.get(6)?,
                    streak_count: row.get(7)?,
                    created_at: row.get(8)?,
                    completed_at: row.get(9)?,
                    due_at: row.get(10)?,
                })
            },
        )
        .map_err(DbError::from)
    }

    pub fn get_quests(&self, status: Option<&str>) -> Result<Vec<Quest>> {
        let conn = self.lock()?;
        let (sql, param): (&str, Vec<Box<dyn rusqlite::types::ToSql>>) = match status {
            Some(s) => (
                "SELECT id, title, description, quest_type, category, status, \
                        xp_reward, streak_count, created_at, completed_at, due_at \
                 FROM quests WHERE status = ?1 ORDER BY created_at DESC",
                vec![Box::new(s.to_string())],
            ),
            None => (
                "SELECT id, title, description, quest_type, category, status, \
                        xp_reward, streak_count, created_at, completed_at, due_at \
                 FROM quests ORDER BY created_at DESC",
                vec![],
            ),
        };
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(param.iter()), |row| {
            Ok(Quest {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                quest_type: row.get(3)?,
                category: row.get(4)?,
                status: row.get(5)?,
                xp_reward: row.get(6)?,
                streak_count: row.get(7)?,
                created_at: row.get(8)?,
                completed_at: row.get(9)?,
                due_at: row.get(10)?,
            })
        })?;
        let mut quests = Vec::new();
        for row in rows {
            quests.push(row?);
        }
        Ok(quests)
    }

    pub fn complete_quest(&self, id: &str) -> Result<Quest> {
        let conn = self.lock()?;
        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        conn.execute(
            "UPDATE quests SET status = 'completed', completed_at = ?1, \
                    streak_count = streak_count + 1 \
             WHERE id = ?2 AND status = 'active'",
            params![now, id],
        )?;
        conn.query_row(
            "SELECT id, title, description, quest_type, category, status, \
                    xp_reward, streak_count, created_at, completed_at, due_at \
             FROM quests WHERE id = ?1",
            params![id],
            |row| {
                Ok(Quest {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    description: row.get(2)?,
                    quest_type: row.get(3)?,
                    category: row.get(4)?,
                    status: row.get(5)?,
                    xp_reward: row.get(6)?,
                    streak_count: row.get(7)?,
                    created_at: row.get(8)?,
                    completed_at: row.get(9)?,
                    due_at: row.get(10)?,
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                DbError::NotFound(format!("quest {id} not found"))
            }
            other => DbError::Sqlite(other),
        })
    }

    pub fn delete_quest(&self, id: &str) -> Result<()> {
        let conn = self.lock()?;
        conn.execute("DELETE FROM quests WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Get active quests with due_at within `hours` from now (streak-about-to-break detection).
    pub fn get_quests_due_soon(&self, hours: f64) -> Result<Vec<Quest>> {
        let conn = self.lock()?;
        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let cutoff = (Utc::now() + chrono::Duration::hours(hours as i64))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        let mut stmt = conn.prepare(
            "SELECT id, title, description, quest_type, category, status, \
                    xp_reward, streak_count, created_at, completed_at, due_at \
             FROM quests \
             WHERE status = 'active' \
               AND due_at IS NOT NULL \
               AND due_at > ?1 \
               AND due_at <= ?2 \
               AND streak_count > 0 \
             ORDER BY due_at ASC",
        )?;
        let rows = stmt.query_map(params![now, cutoff], |row| {
            Ok(Quest {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                quest_type: row.get(3)?,
                category: row.get(4)?,
                status: row.get(5)?,
                xp_reward: row.get(6)?,
                streak_count: row.get(7)?,
                created_at: row.get(8)?,
                completed_at: row.get(9)?,
                due_at: row.get(10)?,
            })
        })?;
        let mut quests = Vec::new();
        for row in rows {
            quests.push(row?);
        }
        Ok(quests)
    }

    // -- attestations --------------------------------------------------------

    pub fn save_attestation(
        &self,
        id: &str,
        achievement_type: &str,
        tx_hash: Option<&str>,
        status: &str,
        metadata: Option<&str>,
    ) -> Result<Attestation> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO attestations (id, achievement_type, tx_hash, status, metadata) \
             VALUES (?1, ?2, ?3, ?4, ?5) \
             ON CONFLICT(id) DO UPDATE SET \
                tx_hash = COALESCE(excluded.tx_hash, attestations.tx_hash), \
                status = excluded.status, \
                metadata = COALESCE(excluded.metadata, attestations.metadata)",
            params![id, achievement_type, tx_hash, status, metadata],
        )?;
        conn.query_row(
            "SELECT id, achievement_type, tx_hash, status, metadata, created_at \
             FROM attestations WHERE id = ?1",
            params![id],
            |row| {
                Ok(Attestation {
                    id: row.get(0)?,
                    achievement_type: row.get(1)?,
                    tx_hash: row.get(2)?,
                    status: row.get(3)?,
                    metadata: row.get(4)?,
                    created_at: row.get(5)?,
                })
            },
        )
        .map_err(DbError::from)
    }

    pub fn get_attestations(&self) -> Result<Vec<Attestation>> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT id, achievement_type, tx_hash, status, metadata, created_at \
             FROM attestations ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Attestation {
                id: row.get(0)?,
                achievement_type: row.get(1)?,
                tx_hash: row.get(2)?,
                status: row.get(3)?,
                metadata: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        let mut attestations = Vec::new();
        for row in rows {
            attestations.push(row?);
        }
        Ok(attestations)
    }

    pub fn has_attestation(&self, achievement_type: &str) -> Result<bool> {
        let conn = self.lock()?;
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM attestations WHERE achievement_type = ?1",
                params![achievement_type],
                |row| row.get(0),
            )?;
        Ok(count > 0)
    }

    /// Check if a *confirmed* attestation exists for the given achievement type.
    /// Unlike `has_attestation`, this ignores 'pending' and 'error' entries,
    /// allowing retry of failed attestations.
    pub fn has_confirmed_attestation(&self, achievement_type: &str) -> Result<bool> {
        let conn = self.lock()?;
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM attestations WHERE achievement_type = ?1 AND status = 'confirmed'",
                params![achievement_type],
                |row| row.get(0),
            )?;
        Ok(count > 0)
    }

    // -- personality ---------------------------------------------------------

    pub fn get_personality(&self) -> Result<Personality> {
        let conn = self.lock()?;
        conn.query_row(
            "SELECT warmth, intensity, humor, mysticism, directness \
             FROM personality WHERE id = 1",
            [],
            |row| {
                Ok(Personality {
                    warmth: row.get(0)?,
                    intensity: row.get(1)?,
                    humor: row.get(2)?,
                    mysticism: row.get(3)?,
                    directness: row.get(4)?,
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                DbError::NotFound("personality row not found".into())
            }
            other => DbError::Sqlite(other),
        })
    }

    pub fn save_personality(&self, p: &Personality) -> Result<()> {
        let conn = self.lock()?;
        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        conn.execute(
            "UPDATE personality SET \
                warmth = ?1, intensity = ?2, humor = ?3, \
                mysticism = ?4, directness = ?5, updated_at = ?6 \
             WHERE id = 1",
            params![p.warmth, p.intensity, p.humor, p.mysticism, p.directness, now],
        )?;
        Ok(())
    }

    // -- data export & privacy -----------------------------------------------

    pub fn export_all_data(&self) -> Result<ExportedData> {
        let conn = self.lock()?;

        let mut stmt = conn.prepare(
            "SELECT id, platform, role, content, created_at \
             FROM messages ORDER BY created_at ASC",
        )?;
        let messages: Vec<Message> = stmt
            .query_map([], |row| {
                Ok(Message {
                    id: row.get(0)?,
                    platform: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        let mut stmt = conn.prepare(
            "SELECT id, content, importance, category, created_at, last_accessed_at \
             FROM memories ORDER BY created_at ASC",
        )?;
        let memories: Vec<Memory> = stmt
            .query_map([], |row| {
                Ok(Memory {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    importance: row.get(2)?,
                    category: row.get(3)?,
                    created_at: row.get(4)?,
                    last_accessed_at: row.get(5)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        let mut stmt = conn.prepare(
            "SELECT id, title, description, quest_type, category, status, \
                    xp_reward, streak_count, created_at, completed_at, due_at \
             FROM quests ORDER BY created_at ASC",
        )?;
        let quests: Vec<Quest> = stmt
            .query_map([], |row| {
                Ok(Quest {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    description: row.get(2)?,
                    quest_type: row.get(3)?,
                    category: row.get(4)?,
                    status: row.get(5)?,
                    xp_reward: row.get(6)?,
                    streak_count: row.get(7)?,
                    created_at: row.get(8)?,
                    completed_at: row.get(9)?,
                    due_at: row.get(10)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        let mut stmt = conn.prepare(
            "SELECT id, achievement_type, tx_hash, status, metadata, created_at \
             FROM attestations ORDER BY created_at ASC",
        )?;
        let attestations: Vec<Attestation> = stmt
            .query_map([], |row| {
                Ok(Attestation {
                    id: row.get(0)?,
                    achievement_type: row.get(1)?,
                    tx_hash: row.get(2)?,
                    status: row.get(3)?,
                    metadata: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        let personality = conn
            .query_row(
                "SELECT warmth, intensity, humor, mysticism, directness \
                 FROM personality WHERE id = 1",
                [],
                |row| {
                    Ok(Personality {
                        warmth: row.get(0)?,
                        intensity: row.get(1)?,
                        humor: row.get(2)?,
                        mysticism: row.get(3)?,
                        directness: row.get(4)?,
                    })
                },
            )
            .ok();

        let mut stmt = conn.prepare(
            "SELECT key, value FROM settings WHERE key NOT IN ('venice_api_key') ORDER BY key",
        )?;
        let settings: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(ExportedData {
            exported_at: Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string(),
            messages,
            memories,
            quests,
            attestations,
            personality,
            settings,
        })
    }

    pub fn clear_all_data(&self) -> Result<()> {
        let conn = self.lock()?;
        conn.execute_batch(
            "BEGIN;
             DELETE FROM messages;
             DELETE FROM memories;
             DELETE FROM memories_fts;
             DELETE FROM knowing_facts;
             DELETE FROM quests;
             DELETE FROM attestations;
             DELETE FROM settings;
             UPDATE starchild_state SET
                hunger = 50.0, mood = 'Content', energy = 100.0, bond = 0.0,
                xp = 0, level = 1, last_decay_at = datetime('now'),
                updated_at = datetime('now')
             WHERE id = 1;
             UPDATE personality SET
                warmth = 0.6, intensity = 0.4, humor = 0.5,
                mysticism = 0.5, directness = 0.5, updated_at = datetime('now')
             WHERE id = 1;
             COMMIT;",
        )?;
        Ok(())
    }

    pub fn delete_message(&self, id: &str) -> Result<()> {
        let conn = self.lock()?;
        conn.execute("DELETE FROM messages WHERE id = ?1", params![id])?;
        Ok(())
    }

    // -- settings ------------------------------------------------------------

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let conn = self.lock()?;
        let result: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()?;
        Ok(result)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) \
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/// Open (or create) the database at `<app_data_dir>/starchild.db`, run all
/// migrations, and return a ready-to-use [`Database`] handle.
pub fn init(app_data_dir: &Path) -> Result<Database> {
    // Ensure the directory exists.
    fs::create_dir_all(app_data_dir)?;

    let db_path = app_data_dir.join("starchild.db");
    let conn = Connection::open(&db_path)?;

    // Enable WAL mode for better concurrent read performance.
    conn.pragma_update(None, "journal_mode", "WAL")?;

    // Run migrations.
    run_migrations(&conn)?;

    // Seed singleton rows if they are missing.
    seed_defaults(&conn)?;

    Ok(Database {
        conn: Arc::new(Mutex::new(conn)),
    })
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

fn run_migrations(conn: &Connection) -> Result<()> {
    // -- starchild_state ----------------------------------------------------
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS starchild_state (
            id             INTEGER PRIMARY KEY CHECK (id = 1),
            hunger         REAL    NOT NULL DEFAULT 50.0,
            mood           TEXT    NOT NULL DEFAULT 'Content',
            energy         REAL    NOT NULL DEFAULT 100.0,
            bond           REAL    NOT NULL DEFAULT 0.0,
            xp             INTEGER NOT NULL DEFAULT 0,
            level          INTEGER NOT NULL DEFAULT 1,
            last_decay_at  TEXT    NOT NULL,
            created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
        );",
    )?;

    // -- messages -----------------------------------------------------------
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS messages (
            id         TEXT PRIMARY KEY,
            platform   TEXT NOT NULL,
            role       TEXT NOT NULL,
            content    TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )?;

    // -- memories -----------------------------------------------------------
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS memories (
            id               TEXT PRIMARY KEY,
            content          TEXT NOT NULL,
            importance       REAL NOT NULL DEFAULT 0.5,
            category         TEXT,
            created_at       TEXT NOT NULL DEFAULT (datetime('now')),
            last_accessed_at TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )?;

    // -- memories FTS5 virtual table ----------------------------------------
    conn.execute_batch(
        "CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts \
         USING fts5(content, content=memories, content_rowid=rowid);",
    )?;

    // Triggers to keep the FTS index in sync.
    conn.execute_batch(
        "CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
            INSERT INTO memories_fts(rowid, content) VALUES (new.rowid, new.content);
        END;

        CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
            INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.rowid, old.content);
        END;

        CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
            INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.rowid, old.content);
            INSERT INTO memories_fts(rowid, content) VALUES (new.rowid, new.content);
        END;",
    )?;

    // -- quests -------------------------------------------------------------
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS quests (
            id            TEXT    PRIMARY KEY,
            title         TEXT    NOT NULL,
            description   TEXT,
            quest_type    TEXT    NOT NULL DEFAULT 'daily',
            category      TEXT,
            status        TEXT    NOT NULL DEFAULT 'active',
            xp_reward     INTEGER NOT NULL DEFAULT 10,
            streak_count  INTEGER NOT NULL DEFAULT 0,
            created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
            completed_at  TEXT,
            due_at        TEXT
        );",
    )?;

    // -- attestations -------------------------------------------------------
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS attestations (
            id                TEXT PRIMARY KEY,
            achievement_type  TEXT NOT NULL,
            tx_hash           TEXT,
            status            TEXT NOT NULL DEFAULT 'pending',
            metadata          TEXT,
            created_at        TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )?;

    // -- personality --------------------------------------------------------
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS personality (
            id          INTEGER PRIMARY KEY CHECK (id = 1),
            warmth      REAL NOT NULL DEFAULT 0.6,
            intensity   REAL NOT NULL DEFAULT 0.4,
            humor       REAL NOT NULL DEFAULT 0.5,
            mysticism   REAL NOT NULL DEFAULT 0.5,
            directness  REAL NOT NULL DEFAULT 0.5,
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )?;

    // -- knowing_facts (structured user understanding) ----------------------
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS knowing_facts (
            id          TEXT    PRIMARY KEY,
            category    TEXT    NOT NULL,
            fact        TEXT    NOT NULL,
            importance  REAL    NOT NULL DEFAULT 0.5,
            confidence  REAL    NOT NULL DEFAULT 0.5,
            created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );",
    )?;

    // -- settings -----------------------------------------------------------
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    )?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Seed default singleton rows
// ---------------------------------------------------------------------------

fn seed_defaults(conn: &Connection) -> Result<()> {
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // Default starchild state (INSERT OR IGNORE so we never overwrite).
    conn.execute(
        "INSERT OR IGNORE INTO starchild_state \
            (id, hunger, mood, energy, bond, xp, level, last_decay_at, created_at, updated_at) \
         VALUES (1, 50.0, 'Content', 100.0, 0.0, 0, 1, ?1, ?1, ?1)",
        params![now],
    )?;

    // Default personality.
    conn.execute(
        "INSERT OR IGNORE INTO personality \
            (id, warmth, intensity, humor, mysticism, directness, updated_at) \
         VALUES (1, 0.6, 0.4, 0.5, 0.5, 0.5, ?1)",
        params![now],
    )?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    /// Helper: create an in-memory database for testing.
    fn test_db() -> Database {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "journal_mode", "WAL").ok(); // WAL may not work in-memory, that is fine
        run_migrations(&conn).expect("migrations");
        seed_defaults(&conn).expect("seed");
        Database {
            conn: Arc::new(Mutex::new(conn)),
        }
    }

    #[test]
    fn test_init_creates_db_file() {
        let tmp = tempfile::tempdir().expect("tmp dir");
        let db = init(tmp.path()).expect("init");
        assert!(tmp.path().join("starchild.db").exists());
        // Smoke-test: we should be able to read the default state.
        let state = db.get_state().expect("get_state");
        assert_eq!(state.level, 1);
    }

    #[test]
    fn test_state_round_trip() {
        let db = test_db();
        let mut state = db.get_state().unwrap();
        state.hunger = 75.0;
        state.mood = "Happy".into();
        state.xp = 42;
        db.save_state(&state).unwrap();

        let loaded = db.get_state().unwrap();
        assert!((loaded.hunger - 75.0).abs() < f64::EPSILON);
        assert_eq!(loaded.mood, "Happy");
        assert_eq!(loaded.xp, 42);
    }

    #[test]
    fn test_messages() {
        let db = test_db();
        db.save_message("m1", "desktop", "user", "Hello")
            .unwrap();
        db.save_message("m2", "desktop", "assistant", "Hi there!")
            .unwrap();

        let msgs = db.get_messages(10).unwrap();
        assert_eq!(msgs.len(), 2);
        // Most recent first -- both have the same created_at (datetime('now')),
        // but insertion order should give m2 last.
        assert_eq!(msgs[0].id, "m2");
    }

    #[test]
    fn test_memories_and_search() {
        let db = test_db();
        db.save_memory("mem1", "User loves Rust programming", 0.9, Some("preference"))
            .unwrap();
        db.save_memory("mem2", "User has a cat named Luna", 0.7, Some("fact"))
            .unwrap();

        let results = db.search_memories("Rust", 5).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "mem1");
    }

    #[test]
    fn test_personality_round_trip() {
        let db = test_db();
        let p = db.get_personality().unwrap();
        assert!((p.warmth - 0.6).abs() < f64::EPSILON);

        let updated = Personality {
            warmth: 0.9,
            intensity: 0.8,
            humor: 0.7,
            mysticism: 0.3,
            directness: 0.6,
        };
        db.save_personality(&updated).unwrap();

        let loaded = db.get_personality().unwrap();
        assert!((loaded.warmth - 0.9).abs() < f64::EPSILON);
        assert!((loaded.intensity - 0.8).abs() < f64::EPSILON);
    }

    #[test]
    fn test_quest_crud() {
        let db = test_db();

        // Create
        let quest = db
            .create_quest("q1", "Morning run", Some("Run 5km"), "daily", Some("body"), 15, None)
            .unwrap();
        assert_eq!(quest.title, "Morning run");
        assert_eq!(quest.status, "active");
        assert_eq!(quest.xp_reward, 15);
        assert_eq!(quest.streak_count, 0);

        // List
        let quests = db.get_quests(Some("active")).unwrap();
        assert_eq!(quests.len(), 1);

        // Complete
        let completed = db.complete_quest("q1").unwrap();
        assert_eq!(completed.status, "completed");
        assert_eq!(completed.streak_count, 1);
        assert!(completed.completed_at.is_some());

        // List active (should be empty now)
        let active = db.get_quests(Some("active")).unwrap();
        assert_eq!(active.len(), 0);

        // List all
        let all = db.get_quests(None).unwrap();
        assert_eq!(all.len(), 1);

        // Delete
        db.delete_quest("q1").unwrap();
        let all = db.get_quests(None).unwrap();
        assert_eq!(all.len(), 0);
    }

    #[test]
    fn test_quest_categories() {
        let db = test_db();
        let categories = ["body", "mind", "spirit"];
        for (i, cat) in categories.iter().enumerate() {
            db.create_quest(
                &format!("q{i}"),
                &format!("{cat} quest"),
                None,
                "daily",
                Some(cat),
                10,
                None,
            )
            .unwrap();
        }
        let quests = db.get_quests(None).unwrap();
        assert_eq!(quests.len(), 3);
    }

    #[test]
    fn test_quest_lifecycle_full() {
        // Simulate: create quest → complete → verify streak → create another → complete
        let db = test_db();

        // Create a spirit quest (from conversation extraction)
        let q1 = db.create_quest("q1", "Sit with a plant", Some("Choose a plant and listen"), "daily", Some("spirit"), 20, None).unwrap();
        assert_eq!(q1.status, "active");
        assert_eq!(q1.category, Some("spirit".to_string()));

        // Verify it appears in active list
        let active = db.get_quests(Some("active")).unwrap();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].title, "Sit with a plant");

        // Complete the quest
        let completed = db.complete_quest("q1").unwrap();
        assert_eq!(completed.status, "completed");
        assert_eq!(completed.streak_count, 1);
        assert!(completed.completed_at.is_some());

        // Active list should be empty, completed list should have 1
        assert_eq!(db.get_quests(Some("active")).unwrap().len(), 0);
        assert_eq!(db.get_quests(Some("completed")).unwrap().len(), 1);

        // Create and complete a second quest — streak continues
        let q2 = db.create_quest("q2", "Morning walk", None, "daily", Some("body"), 15, None).unwrap();
        let completed2 = db.complete_quest("q2").unwrap();
        assert_eq!(completed2.streak_count, 1); // each quest has independent streak

        // All quests (both completed)
        let all = db.get_quests(None).unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn test_quest_duplicate_prevention() {
        // Verify we can check for existing quests by title (used in extraction)
        let db = test_db();
        db.create_quest("q1", "Sit with a plant", None, "daily", Some("spirit"), 20, None).unwrap();

        // Check if a quest with same title exists
        let existing = db.get_quests(Some("active")).unwrap();
        let has_duplicate = existing.iter().any(|q| q.title.to_lowercase() == "sit with a plant");
        assert!(has_duplicate);

        // Different title should not match
        let has_different = existing.iter().any(|q| q.title.to_lowercase() == "morning walk");
        assert!(!has_different);
    }

    #[test]
    fn test_pending_proof_setting_lifecycle() {
        // Simulate the proof flow via DB settings
        let db = test_db();

        // Initially no pending proof
        let pending = db.get_setting("pending_proof_quest_id").unwrap();
        assert!(pending.is_none());

        // Set pending proof (user clicked "i did it")
        db.set_setting("pending_proof_quest_id", "q1").unwrap();
        let pending = db.get_setting("pending_proof_quest_id").unwrap();
        assert_eq!(pending, Some("q1".to_string()));

        // Clear it (proof completed)
        db.set_setting("pending_proof_quest_id", "").unwrap();
        let pending = db.get_setting("pending_proof_quest_id").unwrap()
            .filter(|s| !s.is_empty());
        assert!(pending.is_none());
    }

    #[test]
    fn test_settings() {
        let db = test_db();
        assert_eq!(db.get_setting("theme").unwrap(), None);

        db.set_setting("theme", "dark").unwrap();
        assert_eq!(db.get_setting("theme").unwrap(), Some("dark".into()));

        // Overwrite
        db.set_setting("theme", "light").unwrap();
        assert_eq!(db.get_setting("theme").unwrap(), Some("light".into()));
    }

    #[test]
    fn test_attestation_crud() {
        let db = test_db();

        // Save
        let att = db
            .save_attestation("a1", "7_day_streak", Some("0xabc"), "confirmed", Some("{\"streak\":7}"))
            .unwrap();
        assert_eq!(att.achievement_type, "7_day_streak");
        assert_eq!(att.status, "confirmed");
        assert_eq!(att.tx_hash, Some("0xabc".to_string()));

        // List
        let all = db.get_attestations().unwrap();
        assert_eq!(all.len(), 1);

        // Has attestation
        assert!(db.has_attestation("7_day_streak").unwrap());
        assert!(!db.has_attestation("30_day_streak").unwrap());

        // has_confirmed_attestation — confirmed entry should return true
        assert!(db.has_confirmed_attestation("7_day_streak").unwrap());
        assert!(!db.has_confirmed_attestation("30_day_streak").unwrap());

        // Upsert (update status)
        let updated = db
            .save_attestation("a1", "7_day_streak", Some("0xabc"), "error", None)
            .unwrap();
        assert_eq!(updated.status, "error");
        let all = db.get_attestations().unwrap();
        assert_eq!(all.len(), 1); // still just one

        // has_confirmed_attestation — error status should return false (allows retry)
        assert!(!db.has_confirmed_attestation("7_day_streak").unwrap());
        // has_attestation still returns true (any status)
        assert!(db.has_attestation("7_day_streak").unwrap());
    }

    #[test]
    fn test_export_all_data() {
        let db = test_db();

        // Populate some data
        db.save_message("m1", "desktop", "user", "Hello").unwrap();
        db.save_message("m2", "desktop", "assistant", "Hi!").unwrap();
        db.save_memory("mem1", "User likes Rust", 0.8, Some("preference")).unwrap();
        db.create_quest("q1", "Run", None, "daily", Some("body"), 10, None).unwrap();
        db.save_attestation("a1", "7_day_streak", Some("0xabc"), "confirmed", None).unwrap();
        db.set_setting("theme", "dark").unwrap();

        let export = db.export_all_data().unwrap();
        assert_eq!(export.messages.len(), 2);
        assert_eq!(export.memories.len(), 1);
        assert_eq!(export.quests.len(), 1);
        assert_eq!(export.attestations.len(), 1);
        assert!(export.personality.is_some());
        assert_eq!(export.settings.len(), 1);
        assert!(!export.exported_at.is_empty());
    }

    #[test]
    fn test_export_excludes_api_key() {
        let db = test_db();
        db.set_setting("venice_api_key", "secret-key-123").unwrap();
        db.set_setting("theme", "dark").unwrap();

        let export = db.export_all_data().unwrap();
        // API key should be excluded
        assert!(!export.settings.iter().any(|(k, _)| k == "venice_api_key"));
        assert_eq!(export.settings.len(), 1);
    }

    #[test]
    fn test_clear_all_data() {
        let db = test_db();

        // Populate data
        db.save_message("m1", "desktop", "user", "Hello").unwrap();
        db.save_memory("mem1", "User likes Rust", 0.8, None).unwrap();
        db.create_quest("q1", "Run", None, "daily", None, 10, None).unwrap();
        db.set_setting("theme", "dark").unwrap();

        // Clear
        db.clear_all_data().unwrap();

        // Verify everything is empty
        assert_eq!(db.get_messages(100).unwrap().len(), 0);
        assert_eq!(db.get_all_memories(100).unwrap().len(), 0);
        assert_eq!(db.get_quests(None).unwrap().len(), 0);
        assert_eq!(db.get_setting("theme").unwrap(), None);

        // State should be reset to defaults
        let state = db.get_state().unwrap();
        assert_eq!(state.level, 1);
        assert_eq!(state.xp, 0);
        assert!((state.hunger - 50.0).abs() < f64::EPSILON);
        assert_eq!(state.mood, "Content");
    }

    #[test]
    fn test_delete_message() {
        let db = test_db();
        db.save_message("m1", "desktop", "user", "Hello").unwrap();
        db.save_message("m2", "desktop", "assistant", "Hi!").unwrap();

        db.delete_message("m1").unwrap();

        let msgs = db.get_messages(100).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].id, "m2");
    }
}
