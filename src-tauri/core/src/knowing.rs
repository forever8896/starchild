//! The Knowing Protocol — structured understanding of the human.
//!
//! While the `memory` module stores raw facts via FTS5, the knowing module
//! organizes those facts into meaningful categories that reveal who the human
//! truly is. This structured understanding feeds the system prompt so
//! Starchild knows what it knows — and what it still needs to discover.


use serde::{Deserialize, Serialize};
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
// Fact hygiene — dedup on write, a budget on read
// ---------------------------------------------------------------------------

/// Facts per category that reach the prompt (the strongest, newest first).
pub const FRAGMENT_PER_CATEGORY: usize = 6;
/// Total facts that reach the prompt — the profile grows forever in storage,
/// but the prompt must not (cost, latency, and attention all degrade).
pub const FRAGMENT_TOTAL: usize = 30;
/// Content-word overlap at or above which a new fact repeats an existing one.
const DUPLICATE_JACCARD: f64 = 0.7;

const STOPWORDS: &[&str] = &[
    "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for", "with", "about",
    "is", "are", "was", "were", "be", "been", "they", "them", "their", "he", "she", "his", "her",
    "user", "human", "has", "have", "had", "that", "this", "it", "its", "as", "by", "from", "very",
    "really", "feels", "feel", "wants", "want", "who", "which",
];

fn content_words(s: &str) -> std::collections::BTreeSet<String> {
    s.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() > 1 && !STOPWORDS.contains(w))
        .map(|w| w.trim_end_matches('s').to_string()) // crude plural fold
        .collect()
}

/// True when `fact` (in `category`) says what a stored fact already says — the
/// extractor re-finds the same insight most turns, which used to pile up
/// near-identical bullets in every prompt. Same category + high content-word
/// overlap, or one containing the other, counts as a duplicate.
pub fn is_duplicate_fact(category: &str, fact: &str, existing: &[KnownFact]) -> bool {
    let new_words = content_words(fact);
    if new_words.is_empty() {
        return true; // nothing to add
    }
    let new_lower = fact.trim().to_lowercase();
    existing.iter().filter(|f| f.category == category).any(|f| {
        let old_lower = f.fact.trim().to_lowercase();
        if old_lower.contains(&new_lower) || new_lower.contains(&old_lower) {
            return true;
        }
        let old_words = content_words(&f.fact);
        let inter = new_words.intersection(&old_words).count() as f64;
        let union = new_words.union(&old_words).count() as f64;
        union > 0.0 && inter / union >= DUPLICATE_JACCARD
    })
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
    /// Assemble a profile from a flat list of stored facts: derive the
    /// discovery stage from the count and flag any category with fewer than two
    /// facts as a gap. This is the single source of truth both shells use —
    /// desktop loads `facts` from SQLite, web from IndexedDB, then both call
    /// this so the stage/gaps math (and the resulting prompt) is identical.
    pub fn from_facts(facts: Vec<KnownFact>) -> Self {
        let total_facts = facts.len();
        let stage = DiscoveryStage::from_fact_count(total_facts);

        // Categories with fewer than 2 facts are still "unexplored".
        let mut gaps = Vec::new();
        for cat in KnowingCategory::ALL {
            let count = facts.iter().filter(|f| f.category == cat.as_str()).count();
            if count < 2 {
                gaps.push(*cat);
            }
        }

        KnowingProfile {
            facts,
            stage,
            total_facts,
            gaps,
        }
    }

    /// Build a prompt fragment that tells Starchild what it knows and what it
    /// should explore next.
    pub fn to_prompt_fragment(&self) -> String {
        let mut parts = Vec::new();

        // What we know, organized by category — within a budget: the strongest
        // (importance × confidence), newest-first on ties, per category and in total.
        let mut has_any = false;
        let mut budget = FRAGMENT_TOTAL;
        for cat in KnowingCategory::ALL {
            let mut cat_facts: Vec<&KnownFact> = self
                .facts
                .iter()
                .filter(|f| f.category == cat.as_str())
                .collect();
            cat_facts.sort_by(|a, b| {
                (b.importance * b.confidence)
                    .partial_cmp(&(a.importance * a.confidence))
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| b.created_at.cmp(&a.created_at))
            });
            cat_facts.truncate(FRAGMENT_PER_CATEGORY.min(budget));
            budget -= cat_facts.len();

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

/// Build the user message for the extraction LLM call from a single
/// conversation turn. Shared so both shells phrase the extraction identically.
pub fn build_extraction_input(user_message: &str, ai_response: &str) -> String {
    format!(
        "Analyze this conversation turn and extract meaningful insights about the human.\n\n\
         User: {user_message}\nAssistant: {ai_response}"
    )
}

/// A normalized fact extracted from a conversation turn, ready to store.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedFact {
    pub fact: String,
    pub category: String,
    pub importance: f64,
    pub confidence: f64,
}

/// Parse + normalize the extraction model's raw JSON array into storable facts.
///
/// Mirrors the desktop pipeline exactly: a missing `category` defaults to
/// `life_situation`, a missing `confidence` to `0.5`; each `fact` is trimmed and
/// dropped when empty or longer than 500 chars (context-bloat guard); and
/// `importance`/`confidence` are clamped to `0.0..=1.0`. A malformed payload
/// yields an empty list (the turn simply teaches nothing). This is shared so
/// the web and desktop never drift in what they consider a valid insight.
pub fn parse_extracted_facts(raw: &str) -> Vec<ExtractedFact> {
    #[derive(Deserialize)]
    struct RawFact {
        fact: String,
        #[serde(default = "default_category")]
        category: String,
        importance: f64,
        #[serde(default = "default_confidence")]
        confidence: f64,
    }
    fn default_category() -> String {
        "life_situation".to_string()
    }
    fn default_confidence() -> f64 {
        0.5
    }

    let parsed: Vec<RawFact> = match serde_json::from_str(raw) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };

    parsed
        .into_iter()
        .filter_map(|f| {
            let fact = f.fact.trim();
            if fact.is_empty() || fact.len() > 500 {
                return None;
            }
            Some(ExtractedFact {
                fact: fact.to_string(),
                category: f.category,
                importance: f.importance.clamp(0.0, 1.0),
                confidence: f.confidence.clamp(0.0, 1.0),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fact(cat: &str, text: &str, imp: f64, at: &str) -> KnownFact {
        KnownFact { id: text.into(), category: cat.into(), fact: text.into(), importance: imp, confidence: 1.0, created_at: at.into() }
    }

    #[test]
    fn dedup_catches_rephrasings_not_new_facts() {
        let stored = vec![fact("values", "Values creative freedom above stability", 0.8, "2026-01-01")];
        assert!(is_duplicate_fact("values", "values creative freedom above stability", &stored));
        assert!(is_duplicate_fact("values", "They value creative freedom above stability.", &stored));
        assert!(is_duplicate_fact("values", "creative freedom", &stored), "contained in an existing fact");
        assert!(!is_duplicate_fact("values", "Values honesty in close friendships", &stored));
        assert!(!is_duplicate_fact("fears", "Values creative freedom above stability", &stored), "other category");
        assert!(is_duplicate_fact("values", "   ", &stored), "empty adds nothing");
    }

    #[test]
    fn fragment_stays_within_budget_and_keeps_the_strongest() {
        let mut facts = Vec::new();
        for i in 0..20 {
            facts.push(fact("core_values", &format!("value number {i}"), i as f64 / 20.0, "2026-01-01"));
        }
        let frag = KnowingProfile::from_facts(facts).to_prompt_fragment();
        let bullets = frag.lines().filter(|l| l.trim_start().starts_with("- value number")).count();
        assert_eq!(bullets, FRAGMENT_PER_CATEGORY);
        assert!(frag.contains("value number 19"), "strongest kept");
        assert!(!frag.contains("value number 0\n"), "weakest dropped");
    }

    #[test]
    fn from_facts_matches_stage_and_gaps() {
        let facts = vec![
            KnownFact {
                id: "1".into(),
                category: "core_values".into(),
                fact: "values freedom".into(),
                importance: 0.9,
                confidence: 0.9,
                created_at: "t".into(),
            },
            KnownFact {
                id: "2".into(),
                category: "core_values".into(),
                fact: "values honesty".into(),
                importance: 0.8,
                confidence: 0.8,
                created_at: "t".into(),
            },
        ];
        let p = KnowingProfile::from_facts(facts);
        assert_eq!(p.total_facts, 2);
        assert_eq!(p.stage, DiscoveryStage::NewMeet);
        // core_values has 2 facts → not a gap; others are gaps.
        assert!(!p.gaps.contains(&KnowingCategory::CoreValues));
        assert!(p.gaps.contains(&KnowingCategory::Fears));
    }

    #[test]
    fn parse_extracted_facts_normalizes_and_filters() {
        let raw = r#"[
            {"fact":"  they fear stagnation  ","category":"fears","importance":1.5,"confidence":0.7},
            {"fact":"","category":"desires","importance":0.4,"confidence":0.4},
            {"fact":"they want autonomy","importance":0.6}
        ]"#;
        let facts = parse_extracted_facts(raw);
        assert_eq!(facts.len(), 2);
        assert_eq!(facts[0].fact, "they fear stagnation");
        assert_eq!(facts[0].importance, 1.0, "importance is clamped");
        // Missing category/confidence fall back to the desktop defaults.
        assert_eq!(facts[1].category, "life_situation");
        assert_eq!(facts[1].confidence, 0.5);
    }

    #[test]
    fn parse_extracted_facts_tolerates_garbage() {
        assert!(parse_extracted_facts("not json").is_empty());
        assert!(parse_extracted_facts("[]").is_empty());
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
}
