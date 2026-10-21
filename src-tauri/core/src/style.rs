//! Style — how this person likes to be spoken to, learned from their reactions.
//!
//! One fixed voice can't suit everyone: the cosmic, poetic Starchild delights
//! some people and makes a skeptic roll their eyes. The listening pass reads
//! each message for a style signal — a reaction to how Starchild just spoke
//! ("called the poetic line cheesy", "laughed at the joke"), or what their own
//! way of writing shows ("short, dry, no small talk"). Those observations
//! accumulate here and are rendered into every prompt, so the voice bends
//! toward the person over time. No extra model call: the signal rides on the
//! listening pass.
//!
//! Pure: time injected as epoch ms. Stored by the shells as one JSON setting
//! (`style_notes`), so it travels with every export.

use serde::{Deserialize, Serialize};

use crate::knowing::content_words;

/// Notes kept (the oldest unconfirmed ones drop first).
pub const MAX_NOTES: usize = 6;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StyleNote {
    pub note: String,
    /// How many times this has been observed.
    #[serde(default = "one")]
    pub seen: u32,
    pub last_ms: i64,
}

fn one() -> u32 {
    1
}

fn similar(a: &str, b: &str) -> bool {
    let (wa, wb) = (content_words(a), content_words(b));
    if wa.is_empty() || wb.is_empty() {
        return false;
    }
    let inter = wa.intersection(&wb).count() as f64;
    inter / (wa.len().min(wb.len()) as f64) >= 0.6
}

/// Fold one observation (from the listening pass) into the notes. Empty or
/// overlong signals are ignored; a repeat strengthens the existing note.
pub fn merge_style_note(notes: &[StyleNote], signal: &str, now_ms: i64) -> Vec<StyleNote> {
    let mut out = notes.to_vec();
    let signal = signal.trim().trim_end_matches('.').trim();
    let lower = signal.to_lowercase();
    if signal.is_empty()
        || signal.chars().count() > 160
        || ["none", "n/a", "nothing", "unclear", "no signal"].contains(&lower.as_str())
    {
        return out;
    }
    if let Some(n) = out.iter_mut().find(|n| similar(&n.note, signal)) {
        n.seen += 1;
        n.last_ms = now_ms;
        n.note = signal.to_string(); // the freshest wording
    } else {
        out.push(StyleNote { note: signal.to_string(), seen: 1, last_ms: now_ms });
    }
    if out.len() > MAX_NOTES {
        // Drop the weakest: fewest sightings, then oldest.
        out.sort_by_key(|n| (std::cmp::Reverse(n.seen), std::cmp::Reverse(n.last_ms)));
        out.truncate(MAX_NOTES);
    }
    out
}

/// The prompt layer, or "" when nothing has been learned yet.
pub fn style_fragment(notes: &[StyleNote]) -> String {
    if notes.is_empty() {
        return String::new();
    }
    let mut sorted: Vec<&StyleNote> = notes.iter().collect();
    sorted.sort_by_key(|n| (std::cmp::Reverse(n.seen), std::cmp::Reverse(n.last_ms)));
    let lines: Vec<String> = sorted
        .iter()
        .map(|n| {
            if n.seen > 1 {
                format!("- {} (seen {} times)", n.note, n.seen)
            } else {
                format!("- {}", n.note)
            }
        })
        .collect();
    format!(
        "HOW THIS PERSON LIKES TO BE SPOKEN TO (learned from how they react to you):\n{}\n\
         Where this conflicts with your default voice, follow this — your voice exists to reach \
         them. A skeptic gets a dry, plain-spoken friend; someone who loves the cosmic gets the \
         cosmic. Never mention that you adapted.",
        lines.join("\n")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signals_accumulate_and_repeats_strengthen() {
        let n = merge_style_note(&[], "finds poetic, cosmic language cheesy — wants it plain", 1);
        let n = merge_style_note(&n, "likes dry humour", 2);
        let n = merge_style_note(&n, "cosmic language feels cheesy to them; keep it plain.", 3);
        assert_eq!(n.len(), 2);
        let cosmic = n.iter().find(|x| x.note.contains("cosmic")).unwrap();
        assert_eq!(cosmic.seen, 2);
        assert_eq!(cosmic.last_ms, 3);
        let f = style_fragment(&n);
        assert!(f.contains("(seen 2 times)"), "{f}");
        assert!(f.lines().nth(1).unwrap().contains("cosmic"), "strongest first: {f}");
    }

    #[test]
    fn empty_and_placeholder_signals_are_ignored() {
        for s in ["", "  ", "none", "None.", "n/a", &"x".repeat(200)] {
            assert!(merge_style_note(&[], s, 1).is_empty(), "{s}");
        }
        assert_eq!(style_fragment(&[]), "");
    }

    #[test]
    fn capped_keeping_the_strongest() {
        let mut n = merge_style_note(&[], "wants short replies", 0);
        n = merge_style_note(&n, "wants short replies", 1);
        for i in 0..8 {
            n = merge_style_note(&n, &format!("distinct observation zebra{i} quokka{i}"), 10 + i);
        }
        assert_eq!(n.len(), MAX_NOTES);
        assert!(n.iter().any(|x| x.note == "wants short replies"), "a repeated note survives");
    }
}
