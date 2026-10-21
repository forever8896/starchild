//! The listening pass — Starchild reads the person before it speaks.
//!
//! A single reply call has to do everything at once: understand the message,
//! decide what kind of response this moment needs, and write it in voice. A
//! mid-size model asked to do all three falls back on rules and habits — the
//! "echo a fragment, ask a question" tic. So each conversational turn first
//! runs a short, private, structured read of the person (what they said, what
//! it seems to mean to them, what they need right now, which move fits, which
//! trap to avoid). That read is appended to the reply prompt, so the reply is
//! written FROM understanding instead of from a template.
//!
//! Pure: prompt assembly + parsing only. Both shells make the call (E2EE,
//! internal tier) and fall back to a plain reply when it fails.

use serde::{Deserialize, Serialize};

use crate::ai::{ChatMessage, ConversationPhase};

/// What the person most needs from this reply.
pub const NEEDS: &[(&str, &str)] = &[
    ("witness", "to be received and understood — nothing fixed, nothing added"),
    ("explore", "room to unfold this further, at their pace"),
    ("clarify", "help finding the one thread that matters in a lot at once"),
    ("challenge", "honesty — a gentle, clear naming of what they're avoiding or getting wrong"),
    ("celebrate", "someone to be genuinely glad with them"),
    ("act", "a concrete next step — they're asking for one"),
    ("rest", "lightness and permission — low energy, no demands"),
];

/// The shape of the reply. The listener picks one; the reply prompt explains it.
pub const MOVES: &[(&str, &str)] = &[
    ("reflect", "say back what it MEANS to them, in your own words — tentatively, so they can correct you; no question needed"),
    ("wonder", "offer one hunch or observation you have about them, held lightly (\"i might be wrong, but…\")"),
    ("name", "name the tension, pattern or avoidance you see, kindly and plainly"),
    ("ask", "ask ONE simple, curious question in plain words — often about a door they left open (\"slow how?\", \"what happened to the bikes?\")"),
    ("affirm", "honour something specific and real about what they did or chose"),
    ("connect", "link this to something they told you before, so they feel remembered"),
    ("stay", "simple warm presence in very few words — no insight, no question"),
    ("offer", "offer something concrete (a quest, a small step) because they want one"),
];

/// The listener's private read of the latest message.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Listening {
    /// The essence of what they said, plainly.
    #[serde(default)]
    pub heard: String,
    /// What it seems to mean to them — the value, longing or tension underneath.
    #[serde(default)]
    pub meaning: String,
    /// How they seem to feel, in a few words.
    #[serde(default)]
    pub feeling: String,
    /// What they are circling but haven't said (or "").
    #[serde(default)]
    pub unsaid: String,
    /// The most tender or vulnerable thing they said, even in passing (or "").
    #[serde(default)]
    pub tender: String,
    /// A detail or hint they left unexplained that a curious friend would
    /// simply ask about (or "").
    #[serde(default)]
    pub door: String,
    /// What this message shows about how they like to be spoken to — a
    /// reaction to Starchild's tone, or their own register (or ""). Folded
    /// into the person's style notes (core `style`).
    #[serde(default)]
    pub style: String,
    /// One of [`NEEDS`].
    #[serde(default)]
    pub need: String,
    /// One of [`MOVES`].
    #[serde(default, rename = "move")]
    pub move_: String,
    /// Whether a question belongs in this reply at all.
    #[serde(default)]
    pub question: bool,
    /// The specific trap this reply must not fall into.
    #[serde(default)]
    pub avoid: String,
    /// "short" (1-2 sentences) or "medium" (2-3).
    #[serde(default)]
    pub length: String,
    /// In the Quest phase: false when this isn't the moment to offer one.
    #[serde(default = "default_true")]
    pub quest_ok: bool,
}

fn default_true() -> bool {
    true
}

/// Whether this phase gets a listening pass. Crisis keeps its fixed, fast
/// protocol; Crystallize already runs its own dedicated vision call.
pub fn listen_wanted(phase: ConversationPhase) -> bool {
    !matches!(phase, ConversationPhase::Crisis | ConversationPhase::Crystallize)
}

/// A plain-language note on what the current phase is for — the listener's
/// sense of the larger arc, without the reply prompt's rules.
fn phase_hint(phase: ConversationPhase) -> &'static str {
    match phase {
        ConversationPhase::Arrive => "they've just arrived; the first thing is that they feel received",
        ConversationPhase::Dig => "first conversation: understanding why their dream matters to them",
        ConversationPhase::Explore => "getting to know their real life — days, people, what drains and feeds them",
        ConversationPhase::Reframe => "enough is known to connect two things they've said into something new",
        ConversationPhase::Quest => "a small quest could be offered now — but only if this moment can hold one",
        ConversationPhase::Negotiate => "they're discussing or resisting a quest — collaborate, don't impose",
        ConversationPhase::Proof => "they say they did a quest — hear the story, be glad with them",
        ConversationPhase::Release => "the thread feels complete — let it land",
        ConversationPhase::Crystallize | ConversationPhase::Crisis => "",
    }
}

/// How many recent messages the listener sees verbatim.
pub const LISTEN_WINDOW: usize = 10;

/// The listener's system prompt: the recent conversation, what is known about
/// the person (`context` — knowing/summary/threads fragments, may be empty),
/// and the output contract.
pub fn listen_prompt(recent: &[ChatMessage], phase: ConversationPhase, context: &str) -> String {
    let start = recent.len().saturating_sub(LISTEN_WINDOW);
    let transcript: Vec<String> = recent[start..]
        .iter()
        .filter(|m| m.role != "system")
        .map(|m| {
            let who = if m.role == "user" { "them" } else { "starchild" };
            format!("{who}: {}", m.content.trim())
        })
        .collect();
    let needs: Vec<String> = NEEDS.iter().map(|(k, d)| format!("  {k}: {d}")).collect();
    let moves: Vec<String> = MOVES.iter().map(|(k, d)| format!("  {k}: {d}")).collect();
    let context = if context.trim().is_empty() {
        String::new()
    } else {
        format!("WHAT YOU ALREADY KNOW ABOUT THEM:\n{}\n\n", context.trim())
    };
    format!(
        "You are the inner listening of Starchild, a warm AI companion. Before Starchild replies, \
         you read the person carefully — the way the best human listener would — and decide what \
         this moment needs. You do NOT write the reply.\n\
         \n\
         {context}THE CONVERSATION (most recent last):\n{transcript}\n\
         \n\
         WHERE THE CONVERSATION IS: {hint}\n\
         \n\
         Read their LAST message in the light of everything above. Listen for the whole message, \
         not one phrase; for what it means to them, not just what it says; for feeling, and for \
         what they're circling but haven't said.\n\
         - Stay close to what they actually said. \"meaning\" is a modest guess their words \
         support — if it's light, the meaning is light; don't diagnose or find a wound in a joke. \
         \"unsaid\" only for something they're really circling, else empty.\n\
         - \"tender\": the most vulnerable or warm thing they let slip, even in passing (a detail \
         about someone they lost, \"haven't seen friends in weeks\") — the reply must not skip it.\n\
         - \"door\": something they mentioned but left unexplained, that a curious friend would \
         simply ask about (\"it's been a while since i had a bike\" → what happened?). Very often \
         the best reply is a plain question through that door.\n\
         - When they bring something — a story, an image, an opinion, a worry — the reply should \
         ENGAGE with it (reflect, wonder, name, connect, ask). \"stay\" and \"rest\" are only for \
         truly flat or closing moments, and never mean nudging them to go.\n\
         - If a thread you know about has likely moved and their message leaves room, \"connect\" \
         or \"ask\" about it by its specifics.\n\
         - If they hinted at something hard and moved on, notice it gently rather than retracting.\n\
         - \"style\": only when this message shows how they like to be spoken to — a reaction to \
         Starchild's last reply (eye-roll at poetic or cosmic language, laughing at a joke, \
         \"just tell me what to do\", irritation at questions) or something clear about their own \
         way of talking (dry and brief, playful, loves the spiritual). One short line, as advice \
         (\"keep it plain — cosmic language reads as cheesy to them\"). Usually empty.\n\
         - Look at what Starchild's last replies did — if they kept asking, choose differently; \
         if they haven't asked anything in a while and there's a door, ask. If they kept the same \
         shape or kept reaching for poetry or big interpretations, go plainer.\n\
         - Never invent facts about their life.\n\
         \n\
         NEEDS (pick one):\n{needs}\n\
         \n\
         MOVES (pick the one that serves that need):\n{moves}\n\
         \n\
         Reply with ONLY this JSON — every text value under 15 words, plain and concrete:\n\
         {{\"heard\":\"…\",\"meaning\":\"…\",\"feeling\":\"…\",\"unsaid\":\"… or empty\",\
         \"tender\":\"… or empty\",\"door\":\"… or empty\",\"style\":\"… or empty\",\
         \"need\":\"<need>\",\"move\":\"<move>\",\"question\":true|false,\
         \"avoid\":\"the specific mistake the reply must not make here\",\
         \"length\":\"short|medium\",\"quest_ok\":true|false}}",
        transcript = transcript.join("\n"),
        hint = phase_hint(phase),
        needs = needs.join("\n"),
        moves = moves.join("\n"),
    )
}

/// The user-turn trigger for the listening call.
pub const LISTEN_TRIGGER: &str = "Listen to their last message now. JSON only.";

/// Parse the listener's output. Tolerates code fences and prose around the
/// JSON; unknown needs/moves are normalized to safe defaults. `None` when
/// nothing usable came back (the turn then proceeds without a read).
pub fn parse_listening(raw: &str) -> Option<Listening> {
    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    if end <= start {
        return None;
    }
    let mut l: Listening = serde_json::from_str(&raw[start..=end]).ok()?;
    let norm = |s: &str| s.trim().to_lowercase();
    l.need = norm(&l.need);
    if !NEEDS.iter().any(|(k, _)| *k == l.need) {
        l.need = "witness".into();
    }
    l.move_ = norm(&l.move_);
    if !MOVES.iter().any(|(k, _)| *k == l.move_) {
        l.move_ = "reflect".into();
    }
    // A question move always carries its question.
    if l.move_ == "ask" {
        l.question = true;
    }
    l.length = if norm(&l.length) == "medium" { "medium".into() } else { "short".into() };
    if l.heard.trim().is_empty() && l.meaning.trim().is_empty() {
        return None;
    }
    Some(l)
}

fn describe(table: &[(&str, &'static str)], key: &str) -> &'static str {
    table
        .iter()
        .find(|(k, _)| *k == key)
        .map(|(_, d)| *d)
        .unwrap_or("")
}

/// The read, rendered as the final layer of the reply prompt. Placed last so
/// it outweighs the generic phase guidance when the two pull apart.
pub fn listening_fragment(l: &Listening, phase: ConversationPhase) -> String {
    let mut lines = vec![
        "YOUR PRIVATE READ OF THIS MOMENT (you listened before speaking — let it shape every word; \
         never quote it, never mention it):"
            .to_string(),
    ];
    let mut push = |label: &str, v: &str| {
        if !v.trim().is_empty() {
            lines.push(format!("- {label}: {}", v.trim()));
        }
    };
    push("what they said", &l.heard);
    push("your guess at what it means to them (a guess: offer it tentatively or ask — never tell them what they feel)", &l.meaning);
    push("how they seem", &l.feeling);
    push("underneath", &l.unsaid);
    push("they let this slip — acknowledge it simply, even in a few words", &l.tender);
    push("a door they left open — a plain, curious question about it is often the best reply", &l.door);
    lines.push(format!("- what they need from you: {} — {}", l.need, describe(NEEDS, &l.need)));
    lines.push(format!("- your move: {} — {}", l.move_, describe(MOVES, &l.move_)));
    lines.push(if l.question {
        "- question: at most one, and only the one that matters".to_string()
    } else {
        "- question: NONE in this reply — let what you say land and leave them room".to_string()
    });
    if !l.avoid.trim().is_empty() {
        lines.push(format!("- avoid: {}", l.avoid.trim()));
    }
    lines.push(if l.length == "medium" {
        "- length: 2-3 sentences".to_string()
    } else {
        "- length: 1-2 sentences".to_string()
    });
    if phase == ConversationPhase::Quest && !l.quest_ok {
        lines.push(
            "- this is NOT the moment for a quest: do not offer one in this reply; meet them instead"
                .to_string(),
        );
    }
    lines.push(
        "Where this read and the phase guidance above disagree, follow this read — it is about \
         THIS person, right now."
            .to_string(),
    );
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msgs() -> Vec<ChatMessage> {
        vec![
            ChatMessage::assistant("what do you find yourself doing?"),
            ChatMessage::user("building software for people, with my partner, raising kids"),
        ]
    }

    #[test]
    fn prompt_carries_transcript_context_and_contract() {
        let p = listen_prompt(&msgs(), ConversationPhase::Arrive, "They value family.");
        assert!(p.contains("them: building software"));
        assert!(p.contains("starchild: what do you find"));
        assert!(p.contains("They value family."));
        assert!(p.contains("\"need\""));
        assert!(p.contains("witness") && p.contains("reflect"));
        assert!(p.contains("feel received"));
    }

    #[test]
    fn prompt_windows_long_conversations() {
        let many: Vec<ChatMessage> = (0..30).map(|i| ChatMessage::user(format!("msg-{i}-x"))).collect();
        let p = listen_prompt(&many, ConversationPhase::Explore, "");
        assert!(!p.contains("msg-0-x"));
        assert!(p.contains("msg-29-x"));
        assert!(!p.contains("WHAT YOU ALREADY KNOW"));
    }

    #[test]
    fn parses_fenced_json_and_normalizes() {
        let raw = "```json\n{\"heard\":\"tired\",\"meaning\":\"worn down\",\"feeling\":\"flat\",\
                   \"unsaid\":\"\",\"need\":\"REST\",\"move\":\"stay\",\"question\":false,\
                   \"avoid\":\"cheering them up\",\"length\":\"short\",\"quest_ok\":false}\n```";
        let l = parse_listening(raw).unwrap();
        assert_eq!(l.need, "rest");
        assert_eq!(l.move_, "stay");
        assert!(!l.question && !l.quest_ok);
    }

    #[test]
    fn unknown_values_fall_back_and_ask_implies_question() {
        let l = parse_listening(r#"{"heard":"x","need":"therapy","move":"ask","question":false}"#).unwrap();
        assert_eq!(l.need, "witness");
        assert!(l.question);
        assert_eq!(l.length, "short");
        assert!(l.quest_ok, "quest_ok defaults to true");
        let l = parse_listening(r#"{"heard":"x","move":"lecture"}"#).unwrap();
        assert_eq!(l.move_, "reflect");
    }

    #[test]
    fn garbage_is_none() {
        assert!(parse_listening("i think they feel sad").is_none());
        assert!(parse_listening("{not json}").is_none());
        assert!(parse_listening(r#"{"need":"rest"}"#).is_none(), "an empty read is no read");
    }

    #[test]
    fn fragment_renders_read_and_quest_gate() {
        let l = Listening {
            heard: "meh".into(),
            meaning: "worn down by work".into(),
            need: "rest".into(),
            move_: "stay".into(),
            quest_ok: false,
            ..Default::default()
        };
        let f = listening_fragment(&l, ConversationPhase::Quest);
        assert!(f.contains("worn down by work"));
        assert!(f.contains("question: NONE"));
        assert!(f.contains("NOT the moment for a quest"));
        assert!(!f.contains("underneath"), "empty fields are omitted");
        let f = listening_fragment(&l, ConversationPhase::Explore);
        assert!(!f.contains("NOT the moment for a quest"));
    }

    #[test]
    fn crisis_and_crystallize_skip_listening() {
        assert!(!listen_wanted(ConversationPhase::Crisis));
        assert!(!listen_wanted(ConversationPhase::Crystallize));
        assert!(listen_wanted(ConversationPhase::Explore));
        assert!(listen_wanted(ConversationPhase::Quest));
    }
}
