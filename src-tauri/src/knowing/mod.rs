//! The Knowing Protocol — desktop wiring.
//!
//! The pure types (categories, stages, profile, extraction prompt) now live
//! in `starchild_core::knowing` and are re-exported here at the original
//! `crate::knowing` path. `KnowingSystem` stays desktop-side because it is
//! bound to the SQLite `Database`.

pub use starchild_core::knowing::*;

use crate::db::Database;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// KnowingSystem — bridge between DB and the rest of the app
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct KnowingSystem {
    db: Database,
}

impl KnowingSystem {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    /// Store a categorized fact about the human.
    pub fn store_insight(
        &self,
        category: &str,
        fact: &str,
        importance: f64,
        confidence: f64,
    ) -> Result<String, String> {
        let id = Uuid::new_v4().to_string();
        self.db
            .save_knowing_fact(&id, category, fact, importance, confidence)
            .map_err(|e| e.to_string())?;
        Ok(id)
    }

    /// Load the full knowing profile for prompt building.
    ///
    /// The stage/gaps assembly lives in the shared core
    /// (`KnowingProfile::from_facts`) so web and desktop derive it identically;
    /// this method only supplies the facts from SQLite.
    pub fn profile(&self) -> Result<KnowingProfile, String> {
        let facts = self
            .db
            .get_knowing_facts()
            .map_err(|e| e.to_string())?;

        Ok(KnowingProfile::from_facts(facts))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn test_knowing() -> KnowingSystem {
        KnowingSystem::new(Database::in_memory())
    }

    #[test]
    fn store_and_retrieve_insight() {
        let ks = test_knowing();
        ks.store_insight("core_values", "They believe in radical honesty", 0.9, 0.8)
            .expect("store");

        let profile = ks.profile().expect("profile");
        assert_eq!(profile.total_facts, 1);
        assert_eq!(profile.facts[0].category, "core_values");
        assert_eq!(profile.facts[0].fact, "They believe in radical honesty");
    }

    #[test]
    fn gaps_identify_unexplored_categories() {
        let ks = test_knowing();
        // Add facts to only two categories
        ks.store_insight("core_values", "Fact 1", 0.8, 0.9).unwrap();
        ks.store_insight("core_values", "Fact 2", 0.7, 0.8).unwrap();
        ks.store_insight("desires", "Fact 3", 0.9, 0.9).unwrap();
        ks.store_insight("desires", "Fact 4", 0.8, 0.8).unwrap();

        let profile = ks.profile().unwrap();
        // core_values and desires have 2+ facts, so NOT in gaps
        assert!(!profile.gaps.contains(&KnowingCategory::CoreValues));
        assert!(!profile.gaps.contains(&KnowingCategory::Desires));
        // Everything else should be a gap
        assert!(profile.gaps.contains(&KnowingCategory::Fears));
        assert!(profile.gaps.contains(&KnowingCategory::ThinkingPatterns));
        assert!(profile.gaps.contains(&KnowingCategory::Relationships));
        assert!(profile.gaps.contains(&KnowingCategory::LifeSituation));
        assert!(profile.gaps.contains(&KnowingCategory::GrowthEdges));
    }

    #[test]
    fn prompt_fragment_shows_knowledge_and_gaps() {
        let ks = test_knowing();
        ks.store_insight("core_values", "They value freedom above security", 0.9, 0.9).unwrap();
        ks.store_insight("fears", "They're afraid of becoming their father", 0.8, 0.7).unwrap();

        let profile = ks.profile().unwrap();
        let fragment = profile.to_prompt_fragment();

        assert!(fragment.contains("core values"));
        assert!(fragment.contains("freedom above security"));
        assert!(fragment.contains("fears and shadows"));
        assert!(fragment.contains("becoming their father"));
        assert!(fragment.contains("AREAS STILL UNEXPLORED"));
        // desires should be in gaps since < 2 facts
        assert!(fragment.contains("desires and dreams"));
    }

    #[test]
    fn empty_profile_shows_only_gaps() {
        let ks = test_knowing();
        let profile = ks.profile().unwrap();
        let fragment = profile.to_prompt_fragment();

        assert!(!fragment.contains("WHAT YOU UNDERSTAND"));
        assert!(fragment.contains("AREAS STILL UNEXPLORED"));
        assert!(fragment.contains("still new to each other"));
    }
}
