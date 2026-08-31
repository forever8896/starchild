//! Pure memory recall — keyword overlap + recency ranking, no SQLite.
//!
//! The desktop shell recalls memories with SQLite FTS5 (a desktop-only index
//! that can't compile to WASM). The web shell has no SQLite, so this module
//! provides a **pure, platform-agnostic** ranker both shells *could* use: given
//! a query and an in-memory list of stored memories, it ranks by keyword
//! overlap (primary, FTS5-like: only memories that share a term are candidates)
//! plus recency (secondary tiebreak/boost) and returns the top-N memory
//! contents.
//!
//! Time is **not read here** — recency is computed *relative to the supplied
//! set* (newest item in the batch = 1.0), so the function stays deterministic
//! and free of any clock, exactly like the rest of `core`.
//!
//! Desktop keeps FTS5 (better tokenization/stemming + an index that scales to
//! large memory tables); the web drives this ranker over the handful of facts
//! it holds in IndexedDB. Both feed the **same** `PromptBuilder` "memories"
//! slot, so recall is the one place the two shells differ — and only in the
//! retrieval backend, never in how the result is used.

use serde::Deserialize;

/// One stored memory the caller hands in for ranking.
#[derive(Debug, Clone, Deserialize)]
pub struct MemoryItem {
    /// The memory text (a fact about the human).
    pub content: String,
    /// When it was stored, Unix epoch **milliseconds**. `0` (the default) means
    /// "unknown" and simply contributes no recency signal.
    #[serde(default)]
    pub created_at_ms: f64,
}

/// How much the recency signal can add on top of the keyword score. Keyword
/// overlap is the dominant signal (range 0..1); recency only nudges/orders
/// among keyword matches, so it stays well below 1.0.
const RECENCY_WEIGHT: f64 = 0.25;

/// Minimum token length kept when tokenizing — drops noise like "a"/"of".
const MIN_TOKEN_LEN: usize = 3;

/// A tiny stopword set so common glue words don't create spurious overlaps.
const STOPWORDS: &[&str] = &[
    "the", "and", "you", "your", "for", "that", "this", "with", "what", "are", "was", "they",
    "them", "but", "not", "have", "has", "had", "from", "their", "about", "would", "could",
    "should", "into", "than", "then", "when", "where", "which", "been", "were", "his", "her",
    "she", "him", "its", "our", "out", "who", "why", "how", "all", "any", "can", "did", "does",
];

/// Lowercase, split on non-alphanumerics, drop short tokens + stopwords.
fn tokenize(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_alphanumeric())
        .filter_map(|w| {
            let w = w.to_lowercase();
            if w.len() >= MIN_TOKEN_LEN && !STOPWORDS.contains(&w.as_str()) {
                Some(w)
            } else {
                None
            }
        })
        .collect()
}

/// Rank `items` against `query` and return up to `top_n` memory contents,
/// most-relevant first.
///
/// Scoring: an item is a candidate only if it shares at least one query token
/// (mirrors FTS5 `MATCH` — irrelevant memories are never surfaced). Candidates
/// are scored `overlap_ratio + RECENCY_WEIGHT * recency_norm`, where
/// `overlap_ratio` is the fraction of distinct query tokens present and
/// `recency_norm` scales the item's timestamp linearly between the oldest (0.0)
/// and newest (1.0) candidate. Ties fall back to recency, then input order, so
/// the result is fully deterministic.
pub fn rank_memories(query: &str, items: &[MemoryItem], top_n: usize) -> Vec<String> {
    if top_n == 0 || items.is_empty() {
        return Vec::new();
    }

    // Distinct query tokens. With nothing usable to match on we return nothing
    // (an empty/stopword-only query has no relevant memories), matching FTS5.
    let mut query_tokens: Vec<String> = tokenize(query);
    query_tokens.sort();
    query_tokens.dedup();
    if query_tokens.is_empty() {
        return Vec::new();
    }

    // Gather keyword candidates with their overlap and raw timestamp.
    struct Cand<'a> {
        idx: usize,
        content: &'a str,
        overlap_ratio: f64,
        ts: f64,
    }
    let mut cands: Vec<Cand> = Vec::new();
    for (idx, item) in items.iter().enumerate() {
        let item_tokens: Vec<String> = tokenize(&item.content);
        let overlap = query_tokens
            .iter()
            .filter(|qt| item_tokens.iter().any(|it| it == *qt))
            .count();
        if overlap == 0 {
            continue;
        }
        cands.push(Cand {
            idx,
            content: &item.content,
            overlap_ratio: overlap as f64 / query_tokens.len() as f64,
            ts: item.created_at_ms,
        });
    }
    if cands.is_empty() {
        return Vec::new();
    }

    // Normalize recency relative to this candidate set (no wall clock read).
    let min_ts = cands.iter().map(|c| c.ts).fold(f64::INFINITY, f64::min);
    let max_ts = cands.iter().map(|c| c.ts).fold(f64::NEG_INFINITY, f64::max);
    let span = max_ts - min_ts;

    // Score, then sort by score desc, recency desc, original order asc.
    let mut scored: Vec<(f64, f64, usize, &str)> = cands
        .iter()
        .map(|c| {
            let recency_norm = if span > 0.0 { (c.ts - min_ts) / span } else { 0.0 };
            let score = c.overlap_ratio + RECENCY_WEIGHT * recency_norm;
            (score, c.ts, c.idx, c.content)
        })
        .collect();
    scored.sort_by(|a, b| {
        b.0.partial_cmp(&a.0)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal))
            .then(a.2.cmp(&b.2))
    });

    scored
        .into_iter()
        .take(top_n)
        .map(|(_, _, _, content)| content.to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(content: &str, ts: f64) -> MemoryItem {
        MemoryItem {
            content: content.to_string(),
            created_at_ms: ts,
        }
    }

    #[test]
    fn returns_only_keyword_matches() {
        let items = vec![
            item("They love rust programming and systems work", 1.0),
            item("They have two cats named pixel and byte", 2.0),
        ];
        let out = rank_memories("tell me about rust", &items, 5);
        assert_eq!(out.len(), 1);
        assert!(out[0].contains("rust"));
    }

    #[test]
    fn no_match_returns_empty() {
        let items = vec![item("They enjoy hiking on weekends", 1.0)];
        assert!(rank_memories("quantum chromodynamics", &items, 5).is_empty());
    }

    #[test]
    fn empty_or_stopword_query_returns_empty() {
        let items = vec![item("They value honesty above all", 1.0)];
        assert!(rank_memories("", &items, 5).is_empty());
        assert!(rank_memories("the and you", &items, 5).is_empty());
    }

    #[test]
    fn recency_breaks_ties_between_equal_keyword_matches() {
        // Both share exactly the token "music"; the newer one should rank first.
        let items = vec![
            item("They make music in the morning", 100.0),
            item("They make music late at night", 900.0),
        ];
        let out = rank_memories("music", &items, 5);
        assert_eq!(out.len(), 2);
        assert!(out[0].contains("night"), "newer memory should win the tie");
        assert!(out[1].contains("morning"));
    }

    #[test]
    fn stronger_overlap_outranks_mere_recency() {
        // The older item matches two query tokens; the newer matches one.
        let items = vec![
            item("They fear failure and public speaking", 100.0),
            item("They speaking softly about the weather", 900.0),
        ];
        let out = rank_memories("fear of speaking", &items, 5);
        assert_eq!(out[0], "They fear failure and public speaking");
    }

    #[test]
    fn respects_top_n_limit() {
        let items = vec![
            item("growth comes from discomfort", 1.0),
            item("growth needs honest feedback", 2.0),
            item("growth is slow but real", 3.0),
        ];
        let out = rank_memories("growth", &items, 2);
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn zero_top_n_returns_empty() {
        let items = vec![item("anything relevant here", 1.0)];
        assert!(rank_memories("relevant", &items, 0).is_empty());
    }

    #[test]
    fn missing_timestamps_still_rank_by_keyword() {
        // ts defaults to 0 for all → no recency signal, keyword overlap decides.
        let items = vec![
            item("They want to write a novel someday", 0.0),
            item("They want freedom more than money", 0.0),
        ];
        let out = rank_memories("freedom", &items, 5);
        assert_eq!(out.len(), 1);
        assert!(out[0].contains("freedom"));
    }
}
