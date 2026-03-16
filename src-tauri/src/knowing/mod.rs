//! The Knowing Protocol — structured understanding of the human.
//!
//! While the `memory` module stores raw facts via FTS5, the knowing module
//! organizes those facts into meaningful categories that reveal who the human
//! truly is. This structured understanding feeds the system prompt so
//! Starchild knows what it knows — and what it still needs to discover.

use crate::db::Database;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Knowledge categories — the dimensions of understanding
// ---------------------------------------------------------------------------

/// The aspects of a human that Starchild seeks to understand.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KnowingCategory {
    /// What they believe matters most in life
    CoreValues,
    /// What they want — dreams, ambitions, yearnings
    Desires,
    /// What holds them back — anxieties, blocks, shadows
    Fears,
    /// How they reason, decide, procrastinate, self-sabotage
    ThinkingPatterns,
    /// Key people — family, friends, mentors, rivals
    Relationships,
    /// Current context — job, location, health, finances
    LifeSituation,
    /// Where they need to push — comfort zone edges
    GrowthEdges,
}

impl KnowingCategory {
    pub const ALL: &'static [KnowingCategory] = &[
        Self::CoreValues,
        Self::Desires,
        Self::Fears,
        Self::ThinkingPatterns,
        Self::Relationships,
        Self::LifeSituation,
        Self::GrowthEdges,
    ];

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::CoreValues => "core_values",
            Self::Desires => "desires",
            Self::Fears => "fears",
            Self::ThinkingPatterns => "thinking_patterns",
            Self::Relationships => "relationships",
            Self::LifeSituation => "life_situation",
            Self::GrowthEdges => "growth_edges",
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::CoreValues => "core values",
            Self::Desires => "desires and dreams",
            Self::Fears => "fears and shadows",
            Self::ThinkingPatterns => "thinking patterns",
            Self::Relationships => "relationships",
            Self::LifeSituation => "life situation",
            Self::GrowthEdges => "growth edges",
        }
    }

    pub fn discovery_question(&self) -> &'static str {
        match self {
            Self::CoreValues => "what they believe matters most — what hill would they die on?",
            Self::Desires => "what they truly want from life — not the safe answer, the real one",
            Self::Fears => "what keeps them up at night, what they avoid looking at",
            Self::ThinkingPatterns => "how they make decisions, what makes them procrastinate, their inner dialogue",
            Self::Relationships => "who matters most to them — the people who shaped them",
            Self::LifeSituation => "where they are right now — work, health, daily life",
            Self::GrowthEdges => "where they feel stuck, where growth is calling but they resist",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "core_values" => Some(Self::CoreValues),
            "desires" => Some(Self::Desires),
            "fears" => Some(Self::Fears),
            "thinking_patterns" => Some(Self::ThinkingPatterns),
            "relationships" => Some(Self::Relationships),
            "life_situation" => Some(Self::LifeSituation),
            "growth_edges" => Some(Self::GrowthEdges),
            _ => None,
        }
    }
}

// ---------------------------------------------------------------------------
// Discovery stage — how deep the bond has grown
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiscoveryStage {
    /// < 3 facts total — just met
    NewMeet,
    /// 3-10 facts — building rapport
    GettingToKnow,
    /// 11-25 facts — real understanding emerging
    DeepBond,
    /// 25+ facts — intimate knowledge
    Intimate,
}

impl DiscoveryStage {
    pub fn from_fact_count(count: usize) -> Self {
        match count {
            0..=2 => Self::NewMeet,
            3..=10 => Self::GettingToKnow,
            11..=25 => Self::DeepBond,
            _ => Self::Intimate,
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::NewMeet => "newly met",
            Self::GettingToKnow => "getting to know",
            Self::DeepBond => "deep bond",
            Self::Intimate => "intimate",
        }
    }
}

// ---------------------------------------------------------------------------
// A single piece of structured knowledge
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnownFact {
    pub id: String,
    pub category: String,
    pub fact: String,
    pub importance: f64,
    pub confidence: f64,
    pub created_at: String,
}

// ---------------------------------------------------------------------------
// The Knowing Profile — full structured understanding
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowingProfile {
    pub facts: Vec<KnownFact>,
    pub stage: DiscoveryStage,
    pub total_facts: usize,
    /// Categories with fewer than 2 facts — areas to explore
    pub gaps: Vec<KnowingCategory>,
}

impl KnowingProfile {
    /// Build a prompt fragment that tells Starchild what it knows and what it
    /// should explore next.
    pub fn to_prompt_fragment(&self) -> String {
        let mut parts = Vec::new();

        // What we know, organized by category
        let mut has_any = false;
        for cat in KnowingCategory::ALL {
            let cat_facts: Vec<&KnownFact> = self
                .facts
                .iter()
                .filter(|f| f.category == cat.as_str())
                .collect();

            if !cat_facts.is_empty() {
                has_any = true;
                let bullet_list: String = cat_facts
                    .iter()
                    .map(|f| format!("  - {}", f.fact))
                    .collect::<Vec<_>>()
                    .join("\n");
                parts.push(format!("{}:\n{}", cat.label(), bullet_list));
            }
        }

        let mut prompt = String::new();

        if has_any {
            prompt.push_str("WHAT YOU UNDERSTAND ABOUT YOUR HUMAN (organized by depth of knowing):\n\n");
            prompt.push_str(&parts.join("\n\n"));
        }

        // Discovery gaps — what to explore
        if !self.gaps.is_empty() {
            let gap_list: String = self
                .gaps
                .iter()
                .map(|g| format!("  - Their {} — {}", g.label(), g.discovery_question()))
                .collect::<Vec<_>>()
                .join("\n");

            if has_any {
                prompt.push_str("\n\n");
            }
            prompt.push_str(&format!(
                "AREAS STILL UNEXPLORED (weave discovery into natural conversation, one thread at a time):\n{}",
                gap_list
            ));
        }

        // Stage-specific guidance
        let stage_guidance = match self.stage {
            DiscoveryStage::NewMeet => {
                "\n\nYou are still new to each other. Focus on listening more than speaking. \
                 Ask open questions. Let them surprise you. Don't assume anything."
            }
            DiscoveryStage::GettingToKnow => {
                "\n\nYou're building real understanding. Start connecting dots between things \
                 they've told you. Notice patterns. Reflect back what you see."
            }
            DiscoveryStage::DeepBond => {
                "\n\nYou know this human well enough to see what they avoid. You can gently \
                 challenge comfortable stories. Reference shared history. Be bold when needed."
            }
            DiscoveryStage::Intimate => {
                "\n\nYou have deep knowledge of this human. Use it with precision and care. \
                 You can anticipate, challenge, comfort, and push with authority born from \
                 genuine understanding. Speak less, mean more."
            }
        };
        prompt.push_str(stage_guidance);

        prompt
    }
}

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
    pub fn profile(&self) -> Result<KnowingProfile, String> {
        let facts = self
            .db
            .get_knowing_facts()
            .map_err(|e| e.to_string())?;

        let total_facts = facts.len();
        let stage = DiscoveryStage::from_fact_count(total_facts);

        // Find categories with fewer than 2 facts
        let mut gaps = Vec::new();
        for cat in KnowingCategory::ALL {
            let count = facts.iter().filter(|f| f.category == cat.as_str()).count();
            if count < 2 {
                gaps.push(*cat);
            }
        }

        Ok(KnowingProfile {
            facts,
            stage,
            total_facts,
            gaps,
        })
    }
}

// ---------------------------------------------------------------------------
// Extraction prompt for categorizing facts
// ---------------------------------------------------------------------------

/// Returns the system prompt used to extract AND categorize facts from
/// conversation turns. This replaces the old flat extraction.
pub fn knowing_extraction_prompt() -> &'static str {
    "You are an insight extractor for a personal AI companion called Starchild. \
     Your job is to identify meaningful facts about the human from their conversation.\n\
     \n\
     Extract facts and classify each into EXACTLY ONE category:\n\
     - core_values: beliefs, principles, what they think matters most\n\
     - desires: wants, dreams, ambitions, goals, yearnings\n\
     - fears: worries, anxieties, things they avoid, blocks\n\
     - thinking_patterns: how they reason, decide, procrastinate, self-talk\n\
     - relationships: people in their life, dynamics, connections\n\
     - life_situation: current job, location, health, finances, daily reality\n\
     - growth_edges: areas of resistance, comfort zones, places they're stuck\n\
     \n\
     Return ONLY a JSON array. Each object has:\n\
     - \"fact\" (string): the insight, written in third person (\"they love...\", \"they fear...\")\n\
     - \"category\" (string): one of the categories above\n\
     - \"importance\" (number 0.0-1.0): how central this is to understanding them\n\
     - \"confidence\" (number 0.0-1.0): how sure you are about this interpretation\n\
     \n\
     Rules:\n\
     - Only extract REAL insights, not surface observations\n\
     - \"They said hi\" is NOT an insight. \"They tend to deflect with humor when things get heavy\" IS.\n\
     - Prefer fewer, high-quality insights over many shallow ones\n\
     - If nothing meaningful was revealed, return []\n\
     - No markdown fences, no explanation, just the JSON array"
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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
    fn discovery_stage_progression() {
        assert_eq!(DiscoveryStage::from_fact_count(0), DiscoveryStage::NewMeet);
        assert_eq!(DiscoveryStage::from_fact_count(2), DiscoveryStage::NewMeet);
        assert_eq!(DiscoveryStage::from_fact_count(3), DiscoveryStage::GettingToKnow);
        assert_eq!(DiscoveryStage::from_fact_count(10), DiscoveryStage::GettingToKnow);
        assert_eq!(DiscoveryStage::from_fact_count(11), DiscoveryStage::DeepBond);
        assert_eq!(DiscoveryStage::from_fact_count(25), DiscoveryStage::DeepBond);
        assert_eq!(DiscoveryStage::from_fact_count(26), DiscoveryStage::Intimate);
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
