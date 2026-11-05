//! Reply-shape awareness — Starchild notices its own habits.
//!
//! A model can't see that its last four replies all ended in a question or
//! all opened with the person's words and a dash; to the person, that sameness
//! is exactly what makes a companion feel scripted. This looks at the recent
//! assistant replies (pure string features, no model call) and, only when a
//! habit is showing, adds a short "vary this now" note to the prompt.

/// How many recent replies are inspected.
pub const SHAPE_WINDOW: usize = 4;

fn ends_with_question(r: &str) -> bool {
    r.trim_end_matches(|c: char| c.is_whitespace() || "✦◈☽".contains(c))
        .ends_with('?')
}

/// The first two words, lowercased, without punctuation.
fn opening(r: &str) -> String {
    r.split_whitespace()
        .take(2)
        .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric() && c != '\'').to_lowercase())
        .collect::<Vec<_>>()
        .join(" ")
}

/// The "their fragment — my commentary" opening: a short clause, then a dash.
fn echo_dash(r: &str) -> bool {
    let head: String = r.chars().take(48).collect();
    match head.find(" — ") {
        Some(i) => !head[..i].contains(['.', '?', '!']),
        None => false,
    }
}

/// The aphoristic "it's not X — it's Y" / "isn't X, it's Y" reframe.
fn not_x_but_y(r: &str) -> bool {
    let l = r.to_lowercase().replace('’', "'");
    ["it's not ", "that's not ", "isn't ", "wasn't ", "not about "]
        .iter()
        .any(|p| match l.find(p) {
            Some(i) => {
                let rest = &l[i + p.len()..];
                rest.find("it's ").or_else(|| rest.find("it was ")).is_some_and(|j| j < 60)
            }
            None => false,
        })
}

fn words(r: &str) -> usize {
    r.split_whitespace().count()
}

/// A prompt note naming the habits visible in `recent_replies` (oldest first),
/// or "" when the replies are already varied.
pub fn shape_fragment(recent_replies: &[String]) -> String {
    let start = recent_replies.len().saturating_sub(SHAPE_WINDOW);
    let last: Vec<&str> = recent_replies[start..]
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    if last.len() < 2 {
        return String::new();
    }
    let n = last.len();
    let mut notes: Vec<String> = Vec::new();

    let questions = last.iter().filter(|r| ends_with_question(r)).count();
    if questions >= 2 && questions * 2 >= n {
        notes.push(format!(
            "{questions} of your last {n} replies ended with a question — this one must NOT end with one."
        ));
    } else if ends_with_question(last[n - 1]) && n >= 2 && ends_with_question(last[n - 2]) {
        notes.push("your last two replies both ended with a question — don't ask one now.".into());
    }

    let asked_any = last.iter().any(|r| r.contains('?'));
    if n >= 4 && !asked_any {
        notes.push(
            "you haven't asked anything in a while — if they left something unexplained, a plain, curious question would feel natural now."
                .into(),
        );
    }

    let reframes = last.iter().filter(|r| not_x_but_y(r)).count();
    if reframes >= 2 {
        notes.push("you keep using \"it's not X — it's Y\" reframes — drop that shape entirely.".into());
    }

    let echoes = last.iter().filter(|r| echo_dash(r)).count();
    if echoes >= 2 {
        notes.push(
            "you keep opening with a fragment of their words and a dash (\"x — …\") — open some other way."
                .into(),
        );
    }

    let mut openings: Vec<String> = last.iter().map(|r| opening(r)).filter(|o| !o.is_empty()).collect();
    openings.sort();
    let mut repeated: Vec<String> = Vec::new();
    for w in openings.windows(2) {
        if w[0] == w[1] && !repeated.contains(&w[0]) {
            repeated.push(w[0].clone());
        }
    }
    if !repeated.is_empty() {
        let list: Vec<String> = repeated.iter().map(|o| format!("\"{o}…\"")).collect();
        notes.push(format!("don't open with {} again.", list.join(" or ")));
    }

    for sym in ['☽', '✦', '◈'] {
        if last.iter().filter(|r| r.ends_with(sym)).count() >= 2 {
            notes.push(format!("you keep signing off with {sym} — no closing symbol this time."));
        }
    }

    let lens: Vec<usize> = last.iter().map(|r| words(r)).collect();
    let (min, max) = (*lens.iter().min().unwrap(), *lens.iter().max().unwrap());
    if n >= 3 && min >= 25 && max - min <= 12 {
        notes.push("your replies have all been about the same length — this one can be much shorter.".into());
    }

    if notes.is_empty() {
        return String::new();
    }
    format!(
        "YOUR RECENT HABITS (the person can feel repetition — vary it now):\n- {}",
        notes.join("\n- ")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(xs: &[&str]) -> Vec<String> {
        xs.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn varied_replies_get_no_note() {
        let r = v(&[
            "that sounds like a heavy week, and you carried it anyway.",
            "what would it look like to put it down for one evening?",
            "i'm glad you told me. ☽",
        ]);
        assert_eq!(shape_fragment(&r), "");
        assert_eq!(shape_fragment(&v(&["only one?"])), "", "one reply is not a habit");
    }

    #[test]
    fn question_streak_is_named() {
        let r = v(&["a?", "something else entirely here?", "fine.", "and then what happens? ✦"]);
        let f = shape_fragment(&r);
        assert!(f.contains("3 of your last 4 replies ended with a question"), "{f}");
    }

    #[test]
    fn echo_dash_and_repeated_openings_are_named() {
        let r = v(&[
            "taking care of children — that says a lot about you.",
            "your dearest — the one who waits.",
            "your dearest is in every version of this.",
        ]);
        let f = shape_fragment(&r);
        assert!(f.contains("fragment of their words and a dash"), "{f}");
        assert!(f.contains("\"your dearest…\""), "{f}");
    }

    #[test]
    fn repeated_sign_off_symbol_is_named() {
        let r = v(&["go easy tonight. ☽", "that counts. ☽", "fair enough."]);
        assert!(shape_fragment(&r).contains("signing off with ☽"));
    }

    #[test]
    fn reframe_tic_and_long_silence_are_named() {
        let r = v(&[
            "it's not laziness — it's that the mornings belong to everyone else.",
            "that's not guilt, it's a habit of putting yourself last.",
            "fine.",
            "ok.",
        ]);
        let f = shape_fragment(&r);
        assert!(f.contains("it's not X"), "{f}");
        assert!(f.contains("haven't asked anything"), "{f}");
    }

    #[test]
    fn same_length_monotony_is_named() {
        let long = "word ".repeat(30);
        let r = v(&[&long, &long, &long]);
        assert!(shape_fragment(&r).contains("same length"));
    }

    #[test]
    fn only_the_recent_window_counts() {
        let mut r = v(&["a?", "b?", "c?", "d?"]);
        r.extend(v(&["one.", "two things here?", "three more words.", "four."]));
        assert_eq!(shape_fragment(&r), "");
    }
}
