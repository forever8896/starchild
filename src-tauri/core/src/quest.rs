//! Pure quest logic — the single source of truth shared by BOTH shells.
//!
//! Desktop (Tauri) and web (WASM) used to each carry their own copy of this
//! logic (`src-tauri/src/lib.rs` and `web/src/quests.ts`). It now lives here,
//! once, so an edit reaches both: offer-phrase detection, the extraction prompt,
//! the lenient parse + normalize/clamp, and the offline heuristic fallback.
//!
//! Everything here is pure (no clock, no IO) so it compiles to native AND
//! wasm32 and is exhaustively unit-testable.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Offer detection
// ---------------------------------------------------------------------------

/// Phrase markers an assistant reply uses to signal a quest offer. Canonical
/// set — the desktop extractor and the web shell both key off these.
pub const QUEST_OFFER_MARKERS: [&str; 3] =
    ["quest for you", "i have a quest", "here's something to try"];

/// True when an assistant reply contains a quest offer the UI should surface.
pub fn is_quest_offer(text: &str) -> bool {
    let lower = text.to_lowercase();
    QUEST_OFFER_MARKERS.iter().any(|m| lower.contains(m))
}

// ---------------------------------------------------------------------------
// Extraction prompt
// ---------------------------------------------------------------------------

/// Valid quest categories. Anything else normalizes to `"spirit"`.
pub const VALID_CATEGORIES: [&str; 3] = ["body", "mind", "spirit"];

/// System message for the extraction LLM call.
pub const QUEST_EXTRACTION_SYSTEM: &str =
    "Extract quest details from conversation. Return ONLY valid JSON.";

/// Build the user prompt that asks the model to extract the offered quest as
/// structured JSON. The text is byte-for-byte the prompt the desktop shipped.
pub fn build_extraction_prompt(recent_context: &str) -> String {
    format!(
        "Extract the quest from this conversation. The Starchild offered a quest and the human accepted.\n\n\
         Recent conversation:\n{recent_context}\n\n\
         Extract ONLY the specific quest/task that was offered. Return a JSON object:\n\
         {{\n\
         \"title\": \"short quest title, max 60 chars, warm tone\",\n\
         \"description\": \"1-2 sentence description of what to do\",\n\
         \"category\": \"one of: body, mind, spirit\",\n\
         \"quest_type\": \"daily or weekly\",\n\
         \"xp_reward\": 10-50 based on difficulty,\n\
         \"if_then\": \"the plan as 'When [cue from their day], I will [action].' — empty string if no cue was agreed\"\n\
         }}\n\n\
         Category guide:\n\
         - body: physical activity, health, movement, nature, embodiment\n\
         - mind: learning, reading, studying, thinking, creating, building\n\
         - spirit: meditation, reflection, inner work, connection, relationships, alchemy, presence\n\n\
         If no clear quest was offered, return exactly: null\n\
         Return ONLY valid JSON, no markdown fences, no explanation."
    )
}

// ---------------------------------------------------------------------------
// Extracted quest (the JSON shape the model returns)
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ExtractedQuest {
    pub title: String,
    pub description: String,
    pub category: String,
    pub quest_type: String,
    pub xp_reward: i64,
    /// The implementation intention, "When [cue], I will [action]." — the
    /// best-evidenced part of the loop (Gollwitzer; d≈.3–.6). Empty when no cue
    /// was agreed. Optional on the wire so older extractions still parse.
    #[serde(default)]
    pub if_then: String,
}

/// Apply the category/type defaults and the XP clamp (5–50), trim the
/// description, and bound the title length.
pub fn normalize_quest(e: ExtractedQuest) -> ExtractedQuest {
    let category = if VALID_CATEGORIES.contains(&e.category.as_str()) {
        e.category
    } else {
        "spirit".to_string()
    };
    let quest_type = if e.quest_type == "weekly" {
        "weekly".to_string()
    } else {
        "daily".to_string()
    };
    // `0` is treated as "unset" → default 10 (mirrors the web `xp || 10`).
    let xp = if e.xp_reward == 0 { 10 } else { e.xp_reward };
    let xp_reward = xp.clamp(5, 50);
    let title: String = e.title.trim().chars().take(200).collect();
    let if_then: String = e.if_then.trim().chars().take(240).collect();
    let mut description = e.description.trim().to_string();
    // Lead the description with the plan so every shell shows it on the quest
    // card with no schema change — unless the description already carries it.
    if !if_then.is_empty() && !description.to_lowercase().contains(&if_then.to_lowercase()) {
        description = if description.is_empty() { if_then.clone() } else { format!("{if_then}\n{description}") };
    }
    ExtractedQuest {
        title,
        description,
        category,
        quest_type,
        xp_reward,
        if_then,
    }
}

/// Strip a leading ```` ```json … ``` ```` fence if present, returning the inner body.
fn strip_code_fence(s: &str) -> Option<String> {
    let start = s.find("```")?;
    let after = &s[start + 3..];
    let after = after.strip_prefix("json").unwrap_or(after);
    let after = after.trim_start();
    let end = after.find("```")?;
    Some(after[..end].trim().to_string())
}

/// Parse + normalize a raw model extraction response into a valid
/// [`ExtractedQuest`], tolerating code fences / embedded JSON exactly as the
/// web shell did. Returns `None` when the model declined (`"null"`) or the JSON
/// could not be parsed (each shell decides how to handle `None`: desktop errs,
/// web falls back to the heuristic).
pub fn parse_extraction(raw: &str) -> Option<ExtractedQuest> {
    let mut trimmed = raw.trim().to_string();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("null") {
        return None;
    }
    if let Some(inner) = strip_code_fence(&trimmed) {
        trimmed = inner;
    }
    if !trimmed.starts_with('{') {
        if let (Some(start), Some(end)) = (trimmed.find('{'), trimmed.rfind('}')) {
            if end > start {
                trimmed = trimmed[start..=end].to_string();
            }
        }
    }

    let value: serde_json::Value = serde_json::from_str(&trimmed).ok()?;
    let obj = value.as_object()?;

    let title = obj
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if title.is_empty() {
        return None;
    }
    let description = obj
        .get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let category = obj
        .get("category")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let quest_type = obj
        .get("quest_type")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let xp_reward = obj
        .get("xp_reward")
        .and_then(|v| v.as_f64())
        .map(|f| f.round() as i64)
        .unwrap_or(10);
    let if_then = obj
        .get("if_then")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    Some(normalize_quest(ExtractedQuest {
        title,
        description,
        category,
        quest_type,
        xp_reward,
        if_then,
    }))
}

// ---------------------------------------------------------------------------
// Proof — did they actually do it?
// ---------------------------------------------------------------------------

/// What the human's reply to "tell me what happened" means for an armed quest.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProofVerdict {
    /// They told the story — complete the quest and celebrate.
    Complete,
    /// They said they haven't done it (yet) — disarm without completing, and
    /// talk about the quest instead of celebrating.
    NotYet,
    /// Too little to tell ("yes", "done") — keep the quest armed and let the
    /// Starchild ask once more for the story.
    Unclear,
}

/// Phrases that take back a completion claim. Phrase-level on purpose: a bare
/// "didn't" appears in real stories ("i didn't expect how calm it felt").
const NOT_YET_MARKERS: &[&str] = &[
    "not yet", "haven't done", "havent done", "haven't yet", "havent yet", "have not done",
    "didn't do", "didnt do", "did not do", "didn't get to", "didnt get to", "didn't manage",
    "didn't actually", "didnt actually", "never did", "i lied", "just kidding", "jk",
    "couldn't do", "couldnt do", "couldn't make", "wasn't able", "wasnt able", "forgot to",
    "gave up", "changed my mind", "i'll do it", "ill do it", "i will do it", "do it tomorrow",
    "do it later", "going to do it", "gonna do it", "not done",
];

/// Minimum words for a reply to count as the story of what happened.
const PROOF_MIN_WORDS: usize = 4;

/// How many unclear proof replies in a row before the quest is quietly disarmed
/// (they can tap "i did it" again any time).
pub const PROOF_MAX_UNCLEAR: u32 = 2;

/// A system-prompt note steering the reply for a non-complete verdict, so the
/// Starchild never celebrates a quest the shell didn't complete.
pub fn proof_note(verdict: ProofVerdict) -> &'static str {
    match verdict {
        ProofVerdict::Complete => "",
        ProofVerdict::Unclear => "PROOF NOTE: they haven't told you what happened yet. Do NOT celebrate yet. \
            Ask once more, warmly and briefly, what it was like — one question.",
        ProofVerdict::NotYet => "PROOF NOTE: they say they haven't done the quest (yet). Do NOT celebrate and do NOT \
            mark it done. No guilt, no pressure: be curious about what got in the way, and offer to make \
            the quest smaller or tie it to a better moment in their day if they want.",
    }
}

/// Judge the human's proof reply (the turn after the proof trigger). Without
/// this, ANY next message — "actually not yet" included — completed the quest.
pub fn judge_proof(text: &str) -> ProofVerdict {
    let t = text.to_lowercase().replace(['\u{2019}', '\u{2018}'], "'");
    let words: Vec<&str> = t.split(|c: char| !c.is_alphanumeric() && c != '\'').filter(|w| !w.is_empty()).collect();
    let joined = format!(" {} ", words.join(" "));
    if NOT_YET_MARKERS.iter().any(|m| joined.contains(&format!(" {m} "))) {
        return ProofVerdict::NotYet;
    }
    if words.len() < PROOF_MIN_WORDS {
        return ProofVerdict::Unclear;
    }
    ProofVerdict::Complete
}

/// Return the first sentence of `s` (text up to and including the first
/// `.`/`!`/`?` that is followed by whitespace), else the whole string.
fn first_sentence(s: &str) -> &str {
    let bytes = s.as_bytes();
    for (i, &b) in bytes.iter().enumerate() {
        if (b == b'.' || b == b'!' || b == b'?')
            && bytes
                .get(i + 1)
                .map(|n| n.is_ascii_whitespace())
                .unwrap_or(false)
        {
            return &s[..=i];
        }
    }
    s
}

/// Heuristic fallback when no model is reachable (trial exhausted / offline).
/// Turns the offer message into a serviceable quest so ACCEPT never dead-ends.
pub fn fallback_extract(offer_text: &str) -> ExtractedQuest {
    let lower = offer_text.to_lowercase();
    let mut byte_from = 0usize;
    for m in QUEST_OFFER_MARKERS {
        if let Some(i) = lower.find(m) {
            byte_from = i + m.len();
            break;
        }
    }
    // `to_lowercase` can shift byte offsets for non-ASCII; fall back to the
    // whole string if the offset isn't a valid boundary in the original.
    let tail_src = if byte_from <= offer_text.len() && offer_text.is_char_boundary(byte_from) {
        &offer_text[byte_from..]
    } else {
        offer_text
    };
    let tail = tail_src.trim_start_matches(|c: char| {
        c == ':' || c == '—' || c == '-' || c.is_whitespace()
    });

    let sentence_ref = first_sentence(tail);
    let sentence: String = if sentence_ref.trim().is_empty() {
        if tail.trim().is_empty() {
            "A small step toward your vision".to_string()
        } else {
            tail.to_string()
        }
    } else {
        sentence_ref.to_string()
    };

    let collapsed = sentence.split_whitespace().collect::<Vec<_>>().join(" ");
    let title: String = collapsed.chars().take(60).collect();
    let title = if title.trim().is_empty() {
        "A small step".to_string()
    } else {
        title
    };

    normalize_quest(ExtractedQuest {
        title,
        description: sentence,
        category: "spirit".to_string(),
        quest_type: "daily".to_string(),
        xp_reward: 15,
        if_then: String::new(),
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proof_needs_a_story_and_respects_not_yet() {
        assert_eq!(judge_proof("it is complete — i stepped out at dawn and it was still and calm"), ProofVerdict::Complete);
        assert_eq!(judge_proof("I didn't expect how calm it felt, honestly"), ProofVerdict::Complete);
        assert_eq!(judge_proof("actually not yet, sorry"), ProofVerdict::NotYet);
        assert_eq!(judge_proof("I haven’t done it, I’ll do it tomorrow"), ProofVerdict::NotYet);
        assert_eq!(judge_proof("jk"), ProofVerdict::NotYet);
        assert_eq!(judge_proof("yes"), ProofVerdict::Unclear);
        assert_eq!(judge_proof("done!"), ProofVerdict::Unclear);
    }

    #[test]
    fn if_then_plan_leads_the_description() {
        let q = parse_extraction(r#"{"title":"Dawn breath","description":"Ten slow breaths outside.","category":"body","quest_type":"daily","xp_reward":15,"if_then":"When I pour my first coffee, I will step outside."}"#).unwrap();
        assert_eq!(q.if_then, "When I pour my first coffee, I will step outside.");
        assert!(q.description.starts_with("When I pour my first coffee"));
        assert!(q.description.contains("Ten slow breaths"));
        // Older extractions without the field still parse.
        let old = parse_extraction(r#"{"title":"Walk","description":"Walk.","category":"body","quest_type":"daily","xp_reward":10}"#).unwrap();
        assert_eq!(old.if_then, "");
        assert_eq!(old.description, "Walk.");
    }

    #[test]
    fn offer_detection_matches_markers() {
        assert!(is_quest_offer("ok, i have a quest for you ✦"));
        assert!(is_quest_offer("Here's something to try this week"));
        assert!(is_quest_offer("I HAVE A QUEST")); // case-insensitive
        assert!(!is_quest_offer("let's keep exploring your vision"));
    }

    #[test]
    fn extraction_prompt_is_stable() {
        let p = build_extraction_prompt("user: hi\nassistant: i have a quest for you");
        // Desktop's `\`-continuations strip indentation: keys are not indented.
        assert!(p.contains("Return a JSON object:\n{\n\"title\":"));
        assert!(p.contains("user: hi\nassistant: i have a quest for you"));
        assert!(p.ends_with("no markdown fences, no explanation."));
    }

    #[test]
    fn parse_clean_json() {
        let raw = r#"{"title":"Walk at dawn","description":"Take a 10 min walk.","category":"body","quest_type":"daily","xp_reward":20}"#;
        let q = parse_extraction(raw).expect("parses");
        assert_eq!(q.title, "Walk at dawn");
        assert_eq!(q.category, "body");
        assert_eq!(q.quest_type, "daily");
        assert_eq!(q.xp_reward, 20);
    }

    #[test]
    fn parse_null_and_empty_decline() {
        assert!(parse_extraction("null").is_none());
        assert!(parse_extraction("NULL").is_none());
        assert!(parse_extraction("   ").is_none());
        assert!(parse_extraction("not json at all").is_none());
    }

    #[test]
    fn parse_tolerates_code_fence() {
        let raw = "```json\n{\"title\":\"Meditate\",\"description\":\"5 min\",\"category\":\"spirit\",\"quest_type\":\"daily\",\"xp_reward\":15}\n```";
        let q = parse_extraction(raw).expect("parses fenced");
        assert_eq!(q.title, "Meditate");
        assert_eq!(q.xp_reward, 15);
    }

    #[test]
    fn parse_tolerates_prose_wrapped_json() {
        let raw = "Sure! {\"title\":\"Read\",\"description\":\"a chapter\",\"category\":\"mind\",\"quest_type\":\"weekly\",\"xp_reward\":40} done";
        let q = parse_extraction(raw).expect("parses embedded");
        assert_eq!(q.title, "Read");
        assert_eq!(q.category, "mind");
        assert_eq!(q.quest_type, "weekly");
    }

    #[test]
    fn normalize_defaults_and_clamps() {
        let n = normalize_quest(ExtractedQuest {
            title: "  hi  ".to_string(),
            description: "  there  ".to_string(),
            category: "bogus".to_string(),
            quest_type: "monthly".to_string(),
            xp_reward: 999,
            if_then: String::new(),
        });
        assert_eq!(n.title, "hi");
        assert_eq!(n.description, "there");
        assert_eq!(n.category, "spirit"); // invalid → spirit
        assert_eq!(n.quest_type, "daily"); // non-weekly → daily
        assert_eq!(n.xp_reward, 50); // clamped high
    }

    #[test]
    fn normalize_clamps_low_and_treats_zero_as_unset() {
        assert_eq!(
            normalize_quest(ExtractedQuest {
                title: "t".into(),
                description: String::new(),
                category: "mind".into(),
                quest_type: "weekly".into(),
                xp_reward: 1,
                if_then: String::new(),
            })
            .xp_reward,
            5
        );
        assert_eq!(
            normalize_quest(ExtractedQuest {
                title: "t".into(),
                description: String::new(),
                category: "mind".into(),
                quest_type: "weekly".into(),
                xp_reward: 0,
                if_then: String::new(),
            })
            .xp_reward,
            10
        );
    }

    #[test]
    fn fallback_uses_offer_tail() {
        let q = fallback_extract("ok, i have a quest for you: walk outside today. it helps.");
        assert_eq!(q.title, "walk outside today.");
        assert_eq!(q.category, "spirit");
        assert_eq!(q.quest_type, "daily");
        assert_eq!(q.xp_reward, 15);
    }

    #[test]
    fn fallback_never_empty() {
        let q = fallback_extract("i have a quest for you");
        assert!(!q.title.trim().is_empty());
    }
}
