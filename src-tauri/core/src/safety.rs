//! Duty of care — crisis detection, crisis resources, and AI disclosure.
//!
//! Starchild is a purpose companion, not a therapist or a crisis service. But it
//! listens to people at their lowest, so this module holds the rules both shells
//! must apply identically:
//!
//! * [`detect_crisis`] / [`crisis_active`] — a high-recall keyword net over the
//!   human's words. Tuned to over-trigger: a resource card shown when it wasn't
//!   strictly needed is a small cost; a missed crisis is not. Runs locally —
//!   nothing about a crisis is ever sent anywhere by this module.
//! * [`crisis_resources`] — real, human help lines, ordered for the person's
//!   region, for the shell to render as a card (never left to the model).
//! * [`ai_disclosure_due`] — the "you're talking to an AI" cadence: at the start
//!   of every session and at least every three hours, as companion-chatbot laws
//!   (New York GBL Art. 47, California SB 243) require.

use serde::Serialize;

/// How many of the human's most recent messages keep a crisis "active". A crisis
/// isn't over the moment the next message is calm — the game stays paused and
/// the resources stay visible for a couple more turns.
pub const CRISIS_STICKY_TURNS: usize = 3;

/// Minimum gap between AI disclosures within one session (3 hours).
pub const AI_DISCLOSURE_INTERVAL_MS: f64 = 3.0 * 60.0 * 60.0 * 1000.0;

/// The plain-language disclosure the shells show.
pub const AI_DISCLOSURE_TEXT: &str =
    "Starchild is an AI — not a person, and not a therapist. If you're struggling or unsafe, please reach out to someone who can be with you.";

/// Phrases that on their own signal suicidal intent, self-harm, or harm to others.
/// Matched against [`normalize`]d text (lowercase, straight apostrophes, single
/// spaces), and also against the same text with apostrophes removed, so "don't"
/// and "dont" both hit.
const STRONG: &[&str] = &[
    // suicidal ideation
    "kill myself", "killing myself", "end my life", "ending my life", "end my own life",
    "take my own life", "take my life", "taking my life", "end it all", "ending it all",
    "suicidal", "suicide",
    "don't want to exist", "don't want to be alive", "not want to be alive",
    "don't want to live", "don't want to wake up", "don't want to be here anymore",
    "better off dead", "better off without me",
    "no reason to live", "no reason to go on", "no reason for living",
    "no point in living", "no point living", "no point in going on",
    "can't go on", "can't keep going",
    "wish i was dead", "wish i were dead", "wish i wasn't here", "wish i weren't here",
    "wish i could disappear", "wish i didn't exist",
    // self-harm
    "hurt myself", "harm myself", "self harm", "self-harm", "selfharm",
    "cut myself", "cutting myself", "burn myself", "starve myself",
    // plan / means
    "overdose", "overdosing",
    // harm to others
    "kill someone", "hurt someone",
];

/// Lowercase, straighten curly apostrophes, collapse whitespace.
fn normalize(text: &str) -> String {
    let lower = text.to_lowercase().replace(['\u{2019}', '\u{2018}', '`'], "'");
    lower.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// True when a message signals acute crisis / self-harm / suicidal intent, or
/// intent to harm someone else.
///
/// Deliberately high-recall and dependency-free — a keyword net, not an ML
/// classifier. False positives (routing a dark-but-safe message to Crisis) are
/// far cheaper than false negatives here. Extend the phrase list as needed; the
/// unit tests pin the must-catch and must-not-catch cases.
pub fn detect_crisis(text: &str) -> bool {
    let t = normalize(text);
    if t.is_empty() {
        return false;
    }
    let bare = t.replace('\'', "");
    let hit = |p: &&str| t.contains(*p) || bare.contains(&p.replace('\'', ""));
    if STRONG.iter().any(hit) {
        return true;
    }
    // "want to die" family — real, but ambiguous with the "die/dye my hair"
    // false friend, so guard it.
    let hair = t.contains("die my hair") || t.contains("dye my hair") || t.contains("die your hair");
    if !hair
        && (t.contains("want to die") || t.contains("wanna die") || t.contains("going to die by")
            || t.contains("ready to die"))
    {
        return true;
    }
    // "disappear forever" — vanish-intent; require a nearby self/pain cue to avoid
    // flagging e.g. "i wish this deadline would disappear forever" (still allowed
    // to over-flag — false positives are cheaper than misses here).
    let vanish = t.contains("disappear forever") || t.contains("disappear and never");
    let self_pain = t.contains("myself") || t.contains("pain") || t.contains("want to disappear")
        || t.contains("i'll disappear") || t.contains("i will disappear") || t.contains("let me disappear");
    vanish && self_pain
}

/// True when any of the human's last [`CRISIS_STICKY_TURNS`] messages signalled
/// crisis. `user_messages` is oldest-first (the shells' natural order).
pub fn crisis_active<S: AsRef<str>>(user_messages: &[S]) -> bool {
    user_messages
        .iter()
        .rev()
        .take(CRISIS_STICKY_TURNS)
        .any(|m| detect_crisis(m.as_ref()))
}

/// One human help line, for the shell to render.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CrisisResource {
    pub name: &'static str,
    /// Where it serves and when, e.g. "US · call or text, 24/7".
    pub detail: &'static str,
    /// What to dial / text / visit, shown verbatim.
    pub contact: &'static str,
    /// A tappable link (tel:, sms:, https:).
    pub href: &'static str,
}

const R_988: CrisisResource = CrisisResource {
    name: "988 Suicide & Crisis Lifeline",
    detail: "US & Canada · call or text, 24/7",
    contact: "988",
    href: "tel:988",
};
const R_TEXT: CrisisResource = CrisisResource {
    name: "Crisis Text Line",
    detail: "US · text HOME, 24/7",
    contact: "Text HOME to 741741",
    href: "sms:741741",
};
const R_TEXT_UK: CrisisResource = CrisisResource {
    name: "Shout",
    detail: "UK · text SHOUT, 24/7",
    contact: "Text SHOUT to 85258",
    href: "sms:85258",
};
const R_SAMARITANS: CrisisResource = CrisisResource {
    name: "Samaritans",
    detail: "UK & Ireland · call free, 24/7",
    contact: "116 123",
    href: "tel:116123",
};
const R_FIND: CrisisResource = CrisisResource {
    name: "Find a Helpline",
    detail: "Anywhere · free, confidential lines by country",
    contact: "findahelpline.com",
    href: "https://findahelpline.com",
};
const R_EMERGENCY: CrisisResource = CrisisResource {
    name: "Emergency services",
    detail: "If you or someone else is in immediate danger",
    contact: "Call your local emergency number (112 · 911 · 999)",
    href: "tel:112",
};

/// Crisis resources ordered for a region, most local first. `region` is an
/// ISO 3166 alpha-2 code (e.g. from the browser locale "en-GB" → "GB"); an
/// unknown or empty region gets the international set. Always ends with the
/// worldwide directory and emergency services, so no one is left without a line.
pub fn crisis_resources(region: &str) -> Vec<CrisisResource> {
    let mut out = match region.trim().to_ascii_uppercase().as_str() {
        "US" => vec![R_988, R_TEXT],
        "CA" => vec![R_988],
        "GB" | "UK" => vec![R_SAMARITANS, R_TEXT_UK],
        "IE" => vec![R_SAMARITANS],
        _ => vec![],
    };
    out.push(R_FIND);
    out.push(R_EMERGENCY);
    out
}

/// Whether the shell should show the AI disclosure now. `last_shown_ms` is when
/// it was last shown in THIS session (epoch ms), or `None`/0 if not yet — so a
/// fresh session always discloses. After that, at least every three hours.
pub fn ai_disclosure_due(last_shown_ms: Option<f64>, now_ms: f64) -> bool {
    match last_shown_ms {
        None => true,
        Some(t) if t <= 0.0 => true,
        Some(t) => now_ms - t >= AI_DISCLOSURE_INTERVAL_MS,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flags_crisis_language() {
        for s in [
            "honestly? nothing. even in that world I would just want to hurt myself and disappear forever",
            "the pain goes quiet. I just dont want to exist anymore",
            "i want to kill myself",
            "I’ve been feeling suicidal lately",
            "i keep cutting myself when it gets bad",
            "everyone would be better off without me",
            "I don’t want to wake up tomorrow",
            "there's no point in living like this",
            "i just want to end it all",
            "I took an overdose last year and I'm thinking about it again",
            "I wish I wasn't here",
            "sometimes I think about how I could kill someone",
        ] {
            assert!(detect_crisis(s), "should flag as crisis: {s:?}");
        }
    }

    #[test]
    fn ignores_ordinary_aspirations() {
        for s in [
            "i'd be painting outdoors every morning, feeling calm and creative",
            "i want to study alchemy in the forest",
            "i want to die my hair blue",
            "i wish this deadline would disappear forever",
            "my dream is to live by the ocean and write",
            "I'm dying to see the northern lights",
            "this workout is killing me but I love it",
            "",
        ] {
            assert!(!detect_crisis(s), "should NOT flag as crisis: {s:?}");
        }
    }

    #[test]
    fn crisis_stays_active_for_a_few_turns() {
        let msgs = ["i want to kill myself", "ok", "thanks for listening"];
        assert!(crisis_active(&msgs), "still within the sticky window");
        let later = ["i want to kill myself", "ok", "thanks", "i called my sister, i'm safe now"];
        assert!(!crisis_active(&later), "outside the window once three calm turns pass");
        let none: [&str; 0] = [];
        assert!(!crisis_active(&none));
    }

    #[test]
    fn resources_are_local_first_and_never_empty() {
        let us = crisis_resources("us");
        assert_eq!(us[0].contact, "988");
        let gb = crisis_resources("GB");
        assert_eq!(gb[0].name, "Samaritans");
        for r in ["", "DE", "JP", "BR"] {
            let v = crisis_resources(r);
            assert!(!v.is_empty());
            assert_eq!(v.last().unwrap().name, "Emergency services");
            assert!(v.iter().any(|x| x.href == "https://findahelpline.com"));
        }
    }

    #[test]
    fn disclosure_at_session_start_then_every_three_hours() {
        let now = 1_800_000_000_000.0;
        assert!(ai_disclosure_due(None, now));
        assert!(ai_disclosure_due(Some(0.0), now));
        assert!(!ai_disclosure_due(Some(now - 60_000.0), now));
        assert!(ai_disclosure_due(Some(now - AI_DISCLOSURE_INTERVAL_MS), now));
    }
}
