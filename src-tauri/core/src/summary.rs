//! Rolling conversation summary — memory beyond the recent-message window.
//!
//! Both shells send only the most recent messages verbatim. Older history is
//! compressed into one running summary (updated every [`SUMMARY_EVERY`] new
//! messages) that rides in the system prompt, so the Starchild remembers the
//! arc of the relationship instead of forgetting everything past the window.
//! The shells only fetch messages, run the call, and store the result.

/// Messages kept verbatim (not summarized) — the live window.
pub const RECENT_WINDOW: usize = 14;
/// Summarize only once the conversation is longer than this.
pub const SUMMARY_MIN_MESSAGES: usize = 30;
/// Re-summarize after this many new messages since the last summary.
pub const SUMMARY_EVERY: usize = 20;
/// Don't bother summarizing fewer older messages than this.
const MIN_OLDER: usize = 10;

/// System message for the summarizer call.
pub const SUMMARY_SYSTEM: &str = "You are a precise summarizer. Return ONLY the summary, no preamble.";

/// Whether a (re)summary is due: `total` messages stored, `last_summarized` =
/// the total at the previous summary (0 if never).
pub fn summary_due(total: usize, last_summarized: usize) -> bool {
    total > SUMMARY_MIN_MESSAGES && total.saturating_sub(last_summarized) >= SUMMARY_EVERY
}

/// How many of `chronological` (oldest-first) are "older" — everything before
/// the recent window — or `None` if there are too few to be worth it.
pub fn older_count(total: usize) -> Option<usize> {
    let older = total.saturating_sub(RECENT_WINDOW);
    (older >= MIN_OLDER).then_some(older)
}

/// The summarizer's user prompt. `older` is `(role, content)` oldest-first;
/// `existing` is the previous summary ("" if none) so it extends, not restarts.
pub fn build_summary_prompt<R: AsRef<str>, C: AsRef<str>>(existing: &str, older: &[(R, C)]) -> String {
    let mut transcript = String::new();
    for (role, content) in older {
        let label = if role.as_ref() == "user" { "Human" } else { "Starchild" };
        transcript.push_str(label);
        transcript.push_str(": ");
        transcript.push_str(content.as_ref());
        transcript.push('\n');
    }
    let previous = if existing.trim().is_empty() {
        String::new()
    } else {
        format!("PREVIOUS SUMMARY (update and extend, don't repeat):\n{}\n\n", existing.trim())
    };
    format!(
        "Compress this conversation into a concise summary (max 300 words). \
         Preserve: key facts about the human, their dreams/fears/values, \
         important decisions made, quests discussed, emotional turning points. \
         Drop: greetings, filler, repetition. Do not record self-harm details; \
         note only that a hard moment happened and how they were afterwards.\n\n\
         {previous}CONVERSATION:\n{transcript}"
    )
}

/// The system-prompt fragment carrying the summary ("" when there is none).
pub fn summary_fragment(summary: &str) -> String {
    let s = summary.trim();
    if s.is_empty() {
        String::new()
    } else {
        format!("CONVERSATION HISTORY SUMMARY (older messages, compressed):\n{s}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn due_only_for_long_conversations_every_twenty() {
        assert!(!summary_due(30, 0));
        assert!(summary_due(31, 0));
        assert!(!summary_due(45, 31));
        assert!(summary_due(51, 31));
    }

    #[test]
    fn older_excludes_the_recent_window() {
        assert_eq!(older_count(20), None); // 6 older — not worth it
        assert_eq!(older_count(40), Some(26));
    }

    #[test]
    fn prompt_extends_the_previous_summary() {
        let p = build_summary_prompt("They love the sea.", &[("user", "hi"), ("assistant", "hello")]);
        assert!(p.contains("PREVIOUS SUMMARY"));
        assert!(p.contains("Human: hi\nStarchild: hello"));
        assert!(!build_summary_prompt("", &[("user", "x")]).contains("PREVIOUS SUMMARY"));
        assert_eq!(summary_fragment("  "), "");
        assert!(summary_fragment("arc").starts_with("CONVERSATION HISTORY SUMMARY"));
    }
}
