//! Open threads — the companion remembers your story, not just your traits.
//!
//! The knowing profile holds stable facts ("values family"). Feeling heard
//! over time comes from something else: a friend remembers that your hard talk
//! with your cofounder was on Thursday and asks how it went. A thread is that —
//! something still unfolding in the person's life (an upcoming event, an
//! intention, an ongoing situation, a raw feeling), with when it was mentioned
//! and, for events, when it happens.
//!
//! After each turn the shells run a small E2EE extraction call
//! ([`threads_extraction_system`] + [`build_threads_extraction_input`]) and fold
//! the result in with [`apply_thread_update`]. Each prompt then carries
//! [`threads_fragment`]: the open threads with their age, the ones that have
//! likely moved flagged for a light check-in — once, never as surveillance.
//!
//! Pure: time is injected as epoch milliseconds. Stored by the shells as one
//! JSON setting (`open_threads`), so it travels with every export.

use chrono::DateTime;
use serde::{Deserialize, Serialize};

use crate::knowing::content_words;

pub const DAY_MS: i64 = 86_400_000;
const HOUR_MS: i64 = 3_600_000;
/// Open threads kept at most (the least recently touched are dropped first).
pub const MAX_OPEN: usize = 10;
/// Threads shown in a prompt.
pub const FRAGMENT_MAX: usize = 5;
/// An open thread nobody has mentioned for this long has quietly ended.
pub const STALE_AFTER_MS: i64 = 45 * DAY_MS;
/// Resolved threads are kept this long (so a re-mention dedups), then dropped.
pub const RESOLVED_KEEP_MS: i64 = 14 * DAY_MS;
/// Away this long → the next turn is treated as a return.
pub const RETURN_GAP_MS: i64 = 6 * HOUR_MS;
/// An intention this old is worth a gentle "how's it going".
const INTENTION_CHECK_MS: i64 = 2 * DAY_MS;

pub const KINDS: &[&str] = &["event", "intention", "situation", "feeling"];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OpenThread {
    pub id: String,
    pub kind: String,
    pub summary: String,
    /// When the event happens (events only), epoch ms.
    #[serde(default)]
    pub due_ms: Option<i64>,
    pub created_ms: i64,
    /// Last time it came up in conversation.
    pub touched_ms: i64,
    #[serde(default)]
    pub resolved: bool,
    /// It has come up again since it became due (no need to ask after it).
    #[serde(default)]
    pub checked_in: bool,
}

impl OpenThread {
    /// Worth a light check-in now: an event that has happened, or an
    /// intention old enough to have a story — and not already talked about.
    pub fn ripe(&self, now_ms: i64) -> bool {
        if self.resolved || self.checked_in {
            return false;
        }
        match self.due_ms {
            Some(due) => due <= now_ms,
            None => self.kind == "intention" && now_ms - self.created_ms >= INTENTION_CHECK_MS,
        }
    }
}

/// The model's per-turn update.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct ThreadUpdate {
    #[serde(default)]
    pub new: Vec<NewThread>,
    #[serde(default)]
    pub resolved: Vec<String>,
    #[serde(default)]
    pub touched: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewThread {
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub due_in_days: Option<f64>,
}

fn day_label(ms: i64) -> String {
    DateTime::from_timestamp_millis(ms)
        .map(|d| d.format("%A %Y-%m-%d").to_string())
        .unwrap_or_default()
}

/// "today", "yesterday", "3 days ago", "2 weeks ago".
pub fn age_label(then_ms: i64, now_ms: i64) -> String {
    let days = (now_ms - then_ms).max(0) / DAY_MS;
    match days {
        0 => "today".into(),
        1 => "yesterday".into(),
        2..=13 => format!("{days} days ago"),
        _ => format!("{} weeks ago", days / 7),
    }
}

/// "in 2 days", "tomorrow", "today", "2 days ago" — for an event's date.
fn due_label(due_ms: i64, now_ms: i64) -> String {
    let d = (due_ms - now_ms) as f64 / DAY_MS as f64;
    if d >= 1.5 {
        format!("in {} days", d.round() as i64)
    } else if d >= 0.5 {
        "tomorrow".into()
    } else if d > -0.5 {
        "today".into()
    } else if d > -1.5 {
        "yesterday".into()
    } else {
        format!("{} days ago", (-d).round() as i64)
    }
}

pub fn threads_extraction_system() -> String {
    "You keep track of the OPEN THREADS in a person's life, from their conversations with a \
     companion. A thread is something still unfolding that a caring friend would remember and \
     ask about later:\n\
     - event: something coming up (a hard talk, an interview, a trip, an appointment, a deadline)\n\
     - intention: something they said they'll do or start (\"i'll call my mum\", \"started running\")\n\
     - situation: something ongoing they're in the middle of (a conflict, a decision, an illness in the family)\n\
     - feeling: something raw that hasn't settled (a fresh loss, a fear about next week)\n\
     NOT threads: stable traits, values, preferences, their life dream, or anything already finished.\n\
     \n\
     Given today's date, the currently open threads and ONE new exchange, reply with ONLY JSON:\n\
     {\"new\":[{\"kind\":\"event|intention|situation|feeling\",\"summary\":\"one short line, \
     third person, using their words\",\"due_in_days\":number|null}],\
     \"resolved\":[\"<id>\"],\"touched\":[\"<id>\"]}\n\
     - new: only genuinely new threads from THIS exchange; due_in_days only for events with a time \
     (\"thursday\" → days from today; \"tomorrow\" → 1)\n\
     - resolved: open threads this exchange shows are over or settled\n\
     - touched: open threads that came up in this exchange (by them or by the companion)\n\
     Most exchanges change nothing: then return {\"new\":[],\"resolved\":[],\"touched\":[]}. \
     Never invent anything they didn't say."
        .to_string()
}

pub fn build_threads_extraction_input(
    threads: &[OpenThread],
    user_message: &str,
    ai_response: &str,
    now_ms: i64,
) -> String {
    let open: Vec<String> = threads
        .iter()
        .filter(|t| !t.resolved)
        .map(|t| {
            let due = t
                .due_ms
                .map(|d| format!(", happens {} ({})", day_label(d), due_label(d, now_ms)))
                .unwrap_or_default();
            format!("{} [{}{due}] {}", t.id, t.kind, t.summary)
        })
        .collect();
    format!(
        "TODAY: {}\n\nOPEN THREADS:\n{}\n\nTHE EXCHANGE:\nthem: {}\ncompanion: {}",
        day_label(now_ms),
        if open.is_empty() { "(none)".to_string() } else { open.join("\n") },
        user_message.trim(),
        ai_response.trim(),
    )
}

fn similar(a: &str, b: &str) -> bool {
    let (wa, wb) = (content_words(a), content_words(b));
    if wa.is_empty() || wb.is_empty() {
        return false;
    }
    let inter = wa.intersection(&wb).count() as f64;
    let union = wa.union(&wb).count() as f64;
    inter / union >= 0.5
}

/// Fold one extraction result (raw model output) into the thread list. A
/// malformed result changes nothing beyond pruning.
pub fn apply_thread_update(threads: &[OpenThread], raw: &str, now_ms: i64) -> Vec<OpenThread> {
    let mut out: Vec<OpenThread> = threads.to_vec();
    let update: ThreadUpdate = match (raw.find('{'), raw.rfind('}')) {
        (Some(s), Some(e)) if e > s => serde_json::from_str(&raw[s..=e]).unwrap_or_default(),
        _ => ThreadUpdate::default(),
    };

    let touch = |t: &mut OpenThread| {
        t.touched_ms = now_ms;
        // Talked about again since it became current (an event that has
        // happened, or anything undated) — no check-in is owed any more.
        if t.due_ms.is_none_or(|d| d <= now_ms) && now_ms - t.created_ms >= HOUR_MS {
            t.checked_in = true;
        }
    };
    for id in &update.touched {
        if let Some(t) = out.iter_mut().find(|t| &t.id == id) {
            touch(t);
        }
    }
    for id in &update.resolved {
        if let Some(t) = out.iter_mut().find(|t| &t.id == id) {
            t.resolved = true;
            t.touched_ms = now_ms;
        }
    }

    let mut next_id = out
        .iter()
        .filter_map(|t| t.id.strip_prefix('t').and_then(|n| n.parse::<u32>().ok()))
        .max()
        .unwrap_or(0)
        + 1;
    for n in update.new {
        let summary = n.summary.trim().to_string();
        if summary.is_empty() || summary.chars().count() > 200 {
            continue;
        }
        if let Some(t) = out.iter_mut().find(|t| !t.resolved && similar(&t.summary, &summary)) {
            t.touched_ms = now_ms; // the same thread again
            continue;
        }
        let kind = n.kind.trim().to_lowercase();
        let kind = if KINDS.contains(&kind.as_str()) { kind } else { "situation".to_string() };
        let due_ms = n
            .due_in_days
            .filter(|d| d.is_finite() && *d >= 0.0 && *d <= 60.0)
            .map(|d| now_ms + (d * DAY_MS as f64) as i64);
        out.push(OpenThread {
            id: format!("t{next_id}"),
            kind,
            summary,
            due_ms,
            created_ms: now_ms,
            touched_ms: now_ms,
            resolved: false,
            checked_in: false,
        });
        next_id += 1;
    }

    prune(out, now_ms)
}

fn prune(mut threads: Vec<OpenThread>, now_ms: i64) -> Vec<OpenThread> {
    threads.retain(|t| {
        let idle = now_ms - t.touched_ms;
        if t.resolved {
            idle < RESOLVED_KEEP_MS
        } else {
            idle < STALE_AFTER_MS
        }
    });
    let mut open: Vec<OpenThread> = threads.iter().filter(|t| !t.resolved).cloned().collect();
    if open.len() > MAX_OPEN {
        open.sort_by_key(|t| std::cmp::Reverse(t.touched_ms));
        let keep: Vec<String> = open.iter().take(MAX_OPEN).map(|t| t.id.clone()).collect();
        threads.retain(|t| t.resolved || keep.contains(&t.id));
    }
    threads
}

/// The prompt layer: open threads with their age, ripe ones flagged, and how
/// to use them. `gap_ms` is the time since the person's previous message (0 =
/// unknown/mid-conversation). Empty when there are no open threads.
pub fn threads_fragment(threads: &[OpenThread], now_ms: i64, gap_ms: i64) -> String {
    let mut open: Vec<&OpenThread> = threads.iter().filter(|t| !t.resolved).collect();
    if open.is_empty() {
        return String::new();
    }
    open.sort_by_key(|t| (!t.ripe(now_ms), std::cmp::Reverse(t.touched_ms)));
    let lines: Vec<String> = open
        .iter()
        .take(FRAGMENT_MAX)
        .map(|t| {
            let due = t
                .due_ms
                .map(|d| format!(", happening {}", due_label(d, now_ms)))
                .unwrap_or_default();
            let ripe = if t.ripe(now_ms) {
                if t.due_ms.is_some() {
                    "  ← has likely happened by now; worth asking how it went"
                } else {
                    "  ← worth a light \"how's it going\""
                }
            } else {
                ""
            };
            format!("- {} (they mentioned it {}{due}){ripe}", t.summary, age_label(t.created_ms, now_ms))
        })
        .collect();
    let returning = gap_ms >= RETURN_GAP_MS;
    let guidance = if returning && open.iter().any(|t| t.ripe(now_ms)) {
        format!(
            "They're coming back after {}. If their opening leaves room, ask after ONE flagged \
             thread — lightly, once, by its specifics (\"how did thursday's talk go?\"). If they open \
             with something else that matters, follow them; the thread can wait.",
            gap_label(gap_ms)
        )
    } else {
        "Bring a thread up only when it truly connects to what they're saying now, or when a flagged \
         one has moved. Never list what you remember, and never make them feel watched."
            .to_string()
    };
    format!(
        "OPEN THREADS IN THEIR LIFE (what they told you that is still unfolding — remembering it is \
         how they feel known):\n{}\n{guidance}",
        lines.join("\n")
    )
}

fn gap_label(gap_ms: i64) -> String {
    if gap_ms >= DAY_MS {
        let d = gap_ms / DAY_MS;
        if d == 1 { "a day".into() } else { format!("{d} days") }
    } else {
        format!("{} hours", (gap_ms / HOUR_MS).max(1))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Tuesday 2026-10-20 19:00 UTC.
    const NOW: i64 = 1_792_522_800_000;

    fn update(raw: &str) -> Vec<OpenThread> {
        apply_thread_update(&[], raw, NOW)
    }

    #[test]
    fn day_labels_use_the_injected_clock() {
        assert!(day_label(NOW).starts_with("Tuesday 2026-10-20"), "{}", day_label(NOW));
        assert_eq!(age_label(NOW - 3 * DAY_MS, NOW), "3 days ago");
        assert_eq!(age_label(NOW, NOW), "today");
        assert_eq!(age_label(NOW - 20 * DAY_MS, NOW), "2 weeks ago");
    }

    #[test]
    fn new_threads_get_ids_kinds_and_due_dates() {
        let t = update(
            r#"```json
            {"new":[{"kind":"event","summary":"hard talk with cofounder about a 4-day week","due_in_days":2},
                    {"kind":"bogus","summary":"weighing a move to lisbon","due_in_days":null}],
             "resolved":[],"touched":[]}```"#,
        );
        assert_eq!(t.len(), 2);
        assert_eq!(t[0].id, "t1");
        assert_eq!(t[0].due_ms, Some(NOW + 2 * DAY_MS));
        assert_eq!(t[1].kind, "situation", "unknown kinds normalize");
        assert!(t[1].due_ms.is_none());
    }

    #[test]
    fn duplicates_touch_instead_of_adding_and_garbage_is_ignored() {
        let t = update(r#"{"new":[{"kind":"event","summary":"talk with cofounder on thursday"}]}"#);
        let later = NOW + HOUR_MS * 3;
        let t2 = apply_thread_update(&t, r#"{"new":[{"kind":"event","summary":"the thursday talk with the cofounder"}]}"#, later);
        assert_eq!(t2.len(), 1);
        assert_eq!(t2[0].touched_ms, later);
        assert_eq!(apply_thread_update(&t, "no json here", later), t);
    }

    #[test]
    fn resolve_touch_and_ids_continue() {
        let t = update(r#"{"new":[{"kind":"intention","summary":"started running again"},{"kind":"event","summary":"dentist","due_in_days":1}]}"#);
        let t = apply_thread_update(&t, r#"{"resolved":["t2"],"touched":["t1"],"new":[{"kind":"feeling","summary":"anxious about money"}]}"#, NOW + 3 * DAY_MS);
        assert!(t.iter().find(|x| x.id == "t2").unwrap().resolved);
        assert!(t.iter().find(|x| x.id == "t1").unwrap().checked_in, "talked about since → no check-in owed");
        assert_eq!(t.last().unwrap().id, "t3");
    }

    #[test]
    fn ripe_events_and_intentions_are_flagged_on_return() {
        let t = update(r#"{"new":[{"kind":"event","summary":"hard talk with cofounder","due_in_days":2},{"kind":"intention","summary":"started running again"},{"kind":"situation","summary":"sister is unwell"}]}"#);
        let later = NOW + 3 * DAY_MS;
        let f = threads_fragment(&t, later, 3 * DAY_MS);
        assert!(f.contains("hard talk with cofounder (they mentioned it 3 days ago, happening yesterday)  ← has likely happened"), "{f}");
        assert!(f.contains("started running again (they mentioned it 3 days ago)  ← worth a light"), "{f}");
        assert!(f.contains("coming back after 3 days"), "{f}");
        let first = f.lines().nth(1).unwrap();
        assert!(first.contains("←"), "ripe threads sort first: {first}");
        // Mid-conversation, nothing ripe yet → general guidance, no flags.
        let f = threads_fragment(&t, NOW + HOUR_MS, 0);
        assert!(!f.contains('←') && f.contains("Never list what you remember"), "{f}");
    }

    #[test]
    fn checked_in_threads_stop_being_flagged() {
        let t = update(r#"{"new":[{"kind":"event","summary":"interview at the studio","due_in_days":1}]}"#);
        let later = NOW + 2 * DAY_MS;
        assert!(t[0].ripe(later));
        let t = apply_thread_update(&t, r#"{"touched":["t1"]}"#, later);
        assert!(!t[0].ripe(later));
        // Touching an event BEFORE it happens doesn't count as the check-in.
        let t = update(r#"{"new":[{"kind":"event","summary":"interview","due_in_days":3}]}"#);
        let t = apply_thread_update(&t, r#"{"touched":["t1"]}"#, NOW + 2 * HOUR_MS);
        assert!(t[0].ripe(NOW + 4 * DAY_MS));
    }

    #[test]
    fn pruning_drops_stale_and_caps_open() {
        let mut t = update(r#"{"new":[{"kind":"situation","summary":"old worry about rent"}]}"#);
        t = apply_thread_update(&t, "{}", NOW + 50 * DAY_MS);
        assert!(t.is_empty(), "45 days untouched → gone");
        let many: Vec<String> = (0..14).map(|i| format!(r#"{{"kind":"situation","summary":"distinct topic number{i} zebra{i}"}}"#)).collect();
        let t = update(&format!(r#"{{"new":[{}]}}"#, many.join(",")));
        assert_eq!(t.len(), MAX_OPEN);
        assert_eq!(threads_fragment(&t, NOW, 0).lines().filter(|l| l.starts_with("- ")).count(), FRAGMENT_MAX);
    }

    #[test]
    fn no_open_threads_no_fragment() {
        assert_eq!(threads_fragment(&[], NOW, DAY_MS), "");
        let t = apply_thread_update(&update(r#"{"new":[{"kind":"event","summary":"dentist"}]}"#), r#"{"resolved":["t1"]}"#, NOW);
        assert_eq!(threads_fragment(&t, NOW, DAY_MS), "");
    }

    #[test]
    fn extraction_input_lists_open_threads_with_dates() {
        let t = update(r#"{"new":[{"kind":"event","summary":"hard talk","due_in_days":2}]}"#);
        let s = build_threads_extraction_input(&t, "hey", "hi", NOW);
        assert!(s.contains("TODAY: Tuesday 2026-10-20"));
        assert!(s.contains("t1 [event, happens Thursday 2026-10-22 (in 2 days)] hard talk"), "{s}");
        assert!(build_threads_extraction_input(&[], "a", "b", NOW).contains("(none)"));
    }
}
