//! WASM bridge — a minimal `#[wasm_bindgen]` surface over the PURE engine.
//!
//! This module is compiled **only** for `wasm32` (`#[cfg(target_arch =
//! "wasm32")]` at the `pub mod wasm;` site in `lib.rs`), so it has zero effect
//! on the native/desktop build. It deliberately exposes ONLY pure functions —
//! phase detection, model routing, prompt assembly, the game-state tick, and
//! response post-processing. The async `Storage` / `InferenceSender` traits and
//! all networking stay out of WASM (handled in JS in a later phase, per PRD
//! §4.5–4.6); the only state crossing the boundary does so as serialized JSON
//! via `serde-wasm-bindgen`.
//!
//! Time is **injected** (the game tick takes `now_ms` from JS) so nothing here
//! calls `SystemTime::now()` / `Utc::now()` — keeping the surface deterministic
//! and free of the chrono wasm clock.

use chrono::DateTime;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::ai::{
    self, ChatMessage, ConversationPhase, ModelRouter, PersonalityParams, PhaseDetector,
    PromptBuilder,
};
use crate::game;
use crate::knowing::{self, KnowingProfile, KnownFact};
use crate::messages;
use crate::quest;
use crate::recall::{self, MemoryItem};

/// Map a [`ConversationPhase`] to its stable string tag (the same tag the
/// detector/prompt layer use). Centralized so the parse below stays in sync.
fn phase_to_str(p: ConversationPhase) -> &'static str {
    p.as_str()
}

/// Parse a phase tag back into the enum (core [`ConversationPhase::from_tag`]:
/// every phase round-trips; unknown tags fall back to `Arrive`).
fn phase_from_str(s: &str) -> ConversationPhase {
    ConversationPhase::from_tag(s)
}

// ---------------------------------------------------------------------------
// Phase detection
// ---------------------------------------------------------------------------

/// Detect the conversation phase from a list of `{role, content}` messages.
///
/// `messages` is a JS array of `ChatMessage` objects; `crystallize_pending`
/// flags that a preferential-reality exists but the vision isn't placed yet.
/// Returns the phase tag (e.g. `"arrive"`, `"dig"`, `"quest"`).
#[wasm_bindgen]
pub fn detect_phase(messages: JsValue, crystallize_pending: bool) -> Result<String, JsValue> {
    let recent: Vec<ChatMessage> = serde_wasm_bindgen::from_value(messages)?;
    let phase = PhaseDetector::detect_with_context(&recent, crystallize_pending);
    Ok(phase_to_str(phase).to_string())
}

// ---------------------------------------------------------------------------
// Model routing
// ---------------------------------------------------------------------------

/// Route a raw user message to a model tier. Returns the tier name
/// (`"quick" | "regular" | "deep" | "vision"`) plus its Venice model id.
#[derive(Serialize)]
struct RouteResult {
    tier: String,
    model_id: String,
}

#[wasm_bindgen]
pub fn route_model(user_message: &str) -> Result<JsValue, JsValue> {
    let tier = ModelRouter::route(user_message);
    let name = match tier {
        ai::ModelTier::Quick => "quick",
        ai::ModelTier::Regular => "regular",
        ai::ModelTier::Deep => "deep",
        ai::ModelTier::Vision => "vision",
        ai::ModelTier::Internal => "internal",
    };
    let out = RouteResult {
        tier: name.to_string(),
        model_id: tier.model_id().to_string(),
    };
    Ok(serde_wasm_bindgen::to_value(&out)?)
}

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------

/// Everything `PromptBuilder::build` needs, shaped for a single JS object.
#[derive(Deserialize)]
struct PromptInput {
    #[serde(default)]
    state: ai::StarchildState,
    #[serde(default)]
    personality: PersonalityParams,
    #[serde(default)]
    memories: Vec<String>,
    #[serde(default)]
    active_quests: Vec<String>,
    #[serde(default)]
    recent_messages: Vec<ChatMessage>,
    /// Phase tag; defaults to `"arrive"` when omitted.
    #[serde(default)]
    phase: Option<String>,
    /// Optional Great Work position — the user's macro developmental state.
    #[serde(default)]
    great_work: Option<crate::opus::GreatWorkPosition>,
}

// `ai::StarchildState` / `PersonalityParams` already impl `Default`, but serde's
// `#[serde(default)]` on the fields needs the types to be `Default` — they are.

#[wasm_bindgen]
pub fn build_prompt(input: JsValue) -> Result<String, JsValue> {
    let inp: PromptInput = serde_wasm_bindgen::from_value(input)?;
    let phase = phase_from_str(inp.phase.as_deref().unwrap_or("arrive"));
    let prompt = PromptBuilder::build(
        &inp.state,
        &inp.personality,
        &inp.memories,
        &inp.active_quests,
        &inp.recent_messages,
        phase,
        inp.great_work.as_ref(),
    );
    Ok(prompt)
}

// ---------------------------------------------------------------------------
// Game-state tick (clock injected from JS)
// ---------------------------------------------------------------------------

/// Apply passive hunger decay to a serialized `game::StarchildState` using a
/// JS-supplied wall-clock timestamp (`now_ms`, Unix epoch milliseconds), and
/// return the updated state. Time is injected — the core never reads a clock.
#[wasm_bindgen]
pub fn tick_game_state(state: JsValue, now_ms: f64) -> Result<JsValue, JsValue> {
    let mut s: game::StarchildState = serde_wasm_bindgen::from_value(state)?;
    let now = DateTime::from_timestamp_millis(now_ms as i64)
        .ok_or_else(|| JsValue::from_str("tick_game_state: now_ms out of range"))?;
    s.apply_hunger_decay_at(now);
    Ok(serde_wasm_bindgen::to_value(&s)?)
}

/// Construct a fresh `game::StarchildState` at the injected timestamp.
#[wasm_bindgen]
pub fn new_game_state(now_ms: f64) -> Result<JsValue, JsValue> {
    let now = DateTime::from_timestamp_millis(now_ms as i64)
        .ok_or_else(|| JsValue::from_str("new_game_state: now_ms out of range"))?;
    let s = game::StarchildState::new_at(now);
    Ok(serde_wasm_bindgen::to_value(&s)?)
}

// ---------------------------------------------------------------------------
// Response post-processing
// ---------------------------------------------------------------------------

/// Post-process a model response for a given phase tag (paragraph collapse,
/// crystallize ✦ ending, emoji stripping). Mirrors the desktop pipeline.
#[wasm_bindgen]
pub fn postprocess(text: &str, phase: &str) -> String {
    ai::postprocess_response(text, phase_from_str(phase))
}

/// The core crate version, handy as a load-time sanity check from JS.
#[wasm_bindgen]
pub fn core_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// ---------------------------------------------------------------------------
// Quest logic (offer detection · extraction prompt · parse/normalize · fallback)
// ---------------------------------------------------------------------------

/// The single-purpose vision-synthesis prompt (system message).
#[wasm_bindgen]
pub fn vision_synthesis_prompt(preferential_reality: &str, conversation: &str) -> String {
    ai::vision_synthesis_prompt(preferential_reality, conversation)
}

/// The user turn that triggers vision synthesis.
#[wasm_bindgen]
pub fn vision_synthesis_trigger() -> String {
    ai::VISION_SYNTHESIS_TRIGGER.to_string()
}

/// Tidy a synthesized vision; "" if unusable.
#[wasm_bindgen]
pub fn clean_vision(raw: &str) -> String {
    ai::clean_vision(raw)
}

/// The vision + placement text appended after the Crystallize acknowledgement.
#[wasm_bindgen]
pub fn crystallize_suffix(vision: &str) -> String {
    ai::crystallize_suffix(vision)
}

/// Remove a "let's place this on your vision tree ✦" tail.
#[wasm_bindgen]
pub fn strip_placement(reply: &str) -> String {
    ai::strip_placement(reply)
}

/// Sampling temperature for the conversation in this phase.
#[wasm_bindgen]
pub fn conversation_temperature(phase: &str) -> f32 {
    ai::conversation_temperature(phase_from_str(phase))
}

/// The vision sentence from a Crystallize reply (what goes on the tree).
#[wasm_bindgen]
pub fn vision_from_crystallize(reply: &str) -> String {
    ai::vision_from_crystallize(reply)
}

/// Judge a proof reply: "complete" | "not_yet" | "unclear" (core `quest::judge_proof`).
#[wasm_bindgen]
pub fn judge_proof(text: &str) -> String {
    match quest::judge_proof(text) {
        quest::ProofVerdict::Complete => "complete",
        quest::ProofVerdict::NotYet => "not_yet",
        quest::ProofVerdict::Unclear => "unclear",
    }
    .to_string()
}

/// The system-prompt steer for a proof verdict ("" for complete).
#[wasm_bindgen]
pub fn proof_note(verdict: &str) -> String {
    let v = match verdict {
        "not_yet" => quest::ProofVerdict::NotYet,
        "unclear" => quest::ProofVerdict::Unclear,
        _ => quest::ProofVerdict::Complete,
    };
    quest::proof_note(v).to_string()
}

/// How many unclear proof replies before the quest is quietly disarmed.
#[wasm_bindgen]
pub fn proof_max_unclear() -> u32 {
    quest::PROOF_MAX_UNCLEAR
}

/// True when an assistant reply contains a quest offer the UI should surface.
#[wasm_bindgen]
pub fn is_quest_offer(text: &str) -> bool {
    quest::is_quest_offer(text)
}

/// True when a human message signals crisis / self-harm. The shell must NOT
/// capture such a message as a vision, crystallize it, or turn it into a quest.
#[wasm_bindgen]
pub fn detect_crisis(text: &str) -> bool {
    ai::detect_crisis(text)
}

/// True when any of the human's last few messages (oldest-first array of
/// strings) signalled crisis — the crisis state is sticky for a few turns.
#[wasm_bindgen]
pub fn crisis_active(user_messages: JsValue) -> Result<bool, JsValue> {
    let msgs: Vec<String> = serde_wasm_bindgen::from_value(user_messages)?;
    Ok(crate::safety::crisis_active(&msgs))
}

/// Crisis help lines for a region (ISO alpha-2, e.g. "US", "GB"), most local
/// first; always includes a worldwide directory and emergency services.
#[wasm_bindgen]
pub fn crisis_resources(region: &str) -> Result<JsValue, JsValue> {
    Ok(serde_wasm_bindgen::to_value(&crate::safety::crisis_resources(region))?)
}

/// Whether to show the "you're talking to an AI" disclosure now. Pass 0 when it
/// hasn't been shown this session.
#[wasm_bindgen]
pub fn ai_disclosure_due(last_shown_ms: f64, now_ms: f64) -> bool {
    crate::safety::ai_disclosure_due(Some(last_shown_ms), now_ms)
}

/// The plain-language AI disclosure text.
#[wasm_bindgen]
pub fn ai_disclosure_text() -> String {
    crate::safety::AI_DISCLOSURE_TEXT.to_string()
}

/// The system message for the extraction LLM call.
#[wasm_bindgen]
pub fn quest_extraction_system() -> String {
    quest::QUEST_EXTRACTION_SYSTEM.to_string()
}

/// Build the extraction user prompt from recent conversation context.
#[wasm_bindgen]
pub fn build_quest_extraction_prompt(recent_context: &str) -> String {
    quest::build_extraction_prompt(recent_context)
}

/// Parse + normalize a raw model extraction response. Returns the quest object,
/// or `null` when the model declined / the JSON could not be parsed.
#[wasm_bindgen]
pub fn parse_quest_extraction(raw: &str) -> Result<JsValue, JsValue> {
    Ok(serde_wasm_bindgen::to_value(&quest::parse_extraction(raw))?)
}

/// Apply the category/type defaults + XP clamp to an extracted quest.
#[wasm_bindgen]
pub fn normalize_quest(input: JsValue) -> Result<JsValue, JsValue> {
    let e: quest::ExtractedQuest = serde_wasm_bindgen::from_value(input)?;
    Ok(serde_wasm_bindgen::to_value(&quest::normalize_quest(e))?)
}

/// The offline heuristic fallback — turn an offer message into a quest.
#[wasm_bindgen]
pub fn quest_fallback_extract(offer_text: &str) -> Result<JsValue, JsValue> {
    Ok(serde_wasm_bindgen::to_value(&quest::fallback_extract(
        offer_text,
    ))?)
}

// ---------------------------------------------------------------------------
// Quest-completion reward (XP + feed) — the same math the desktop runs
// ---------------------------------------------------------------------------

/// Result of awarding a quest's reward: the updated creature plus whether it
/// levelled up.
#[derive(Serialize)]
struct RewardResult {
    state: game::StarchildState,
    levelled_up: bool,
}

/// Award a quest's XP and feed the creature exactly as the desktop quest
/// completion does (`add_xp(reward)` then `feed(reward / 10.0)`). Returns the
/// next creature state and whether it levelled up.
#[wasm_bindgen]
pub fn quest_complete_reward(state: JsValue, xp_reward: f64) -> Result<JsValue, JsValue> {
    let mut s: game::StarchildState = serde_wasm_bindgen::from_value(state)?;
    let levelled_up = s.add_xp(xp_reward as i64);
    s.feed(xp_reward / 10.0);
    Ok(serde_wasm_bindgen::to_value(&RewardResult {
        state: s,
        levelled_up,
    })?)
}

/// Derive the canonical mood label from a hunger value (`game::Mood::from_hunger`).
/// Centralized so the web stops re-deriving it with drifting thresholds.
#[wasm_bindgen]
pub fn mood_for_hunger(hunger: f64) -> String {
    game::Mood::from_hunger(hunger).to_string()
}

// ---------------------------------------------------------------------------
// Authored copy
// ---------------------------------------------------------------------------

/// The Starchild's fixed awakening (first) message for the given user name.
#[wasm_bindgen]
pub fn awakening_message(name: &str) -> String {
    messages::awakening_message(name)
}

// ---------------------------------------------------------------------------
// Memory recall (pure ranker — the web's FTS5 substitute)
// ---------------------------------------------------------------------------

/// Rank stored memories against a query by keyword overlap + recency and return
/// the top-N contents (a JS `string[]`). `items` is a JS array of
/// `{ content, created_at_ms }`. This is the web's recall path; desktop keeps
/// SQLite FTS5, but both feed the same `PromptBuilder` "memories" slot.
#[wasm_bindgen]
pub fn rank_memories(query: &str, items: JsValue, top_n: usize) -> Result<JsValue, JsValue> {
    let items: Vec<MemoryItem> = serde_wasm_bindgen::from_value(items)?;
    let ranked = recall::rank_memories(query, &items, top_n);
    Ok(serde_wasm_bindgen::to_value(&ranked)?)
}

// ---------------------------------------------------------------------------
// The Knowing protocol (7-dimension understanding — shared with desktop)
// ---------------------------------------------------------------------------

/// The system prompt for the knowing/insight extraction LLM call.
#[wasm_bindgen]
pub fn knowing_extraction_system() -> String {
    knowing::knowing_extraction_prompt().to_string()
}

/// Build the extraction user message from one `(user, assistant)` turn.
#[wasm_bindgen]
pub fn build_knowing_extraction_input(user_message: &str, ai_response: &str) -> String {
    knowing::build_extraction_input(user_message, ai_response)
}

/// Parse + normalize the extraction model's raw JSON into storable facts
/// (`ExtractedFact[]`), applying the same defaults/clamps/filters as desktop.
#[wasm_bindgen]
pub fn parse_knowing_facts(raw: &str) -> Result<JsValue, JsValue> {
    Ok(serde_wasm_bindgen::to_value(&knowing::parse_extracted_facts(
        raw,
    ))?)
}

// ---------------------------------------------------------------------------
// Rolling conversation summary (core `summary`)
// ---------------------------------------------------------------------------

/// Whether a (re)summary is due for `total` stored messages.
#[wasm_bindgen]
pub fn summary_due(total: u32, last_summarized: u32) -> bool {
    crate::summary::summary_due(total as usize, last_summarized as usize)
}

/// How many oldest messages to summarize (0 = not worth it yet).
#[wasm_bindgen]
pub fn summary_older_count(total: u32) -> u32 {
    crate::summary::older_count(total as usize).unwrap_or(0) as u32
}

/// The summarizer system message.
#[wasm_bindgen]
pub fn summary_system() -> String {
    crate::summary::SUMMARY_SYSTEM.to_string()
}

/// The summarizer user prompt from the previous summary + older `ChatMessage[]`.
#[wasm_bindgen]
pub fn build_summary_prompt(existing: &str, older: JsValue) -> Result<String, JsValue> {
    let older: Vec<ChatMessage> = serde_wasm_bindgen::from_value(older)?;
    let pairs: Vec<(&str, &str)> = older.iter().map(|m| (m.role.as_str(), m.content.as_str())).collect();
    Ok(crate::summary::build_summary_prompt(existing, &pairs))
}

/// The system-prompt fragment carrying the summary ("" when none).
#[wasm_bindgen]
pub fn summary_fragment(summary: &str) -> String {
    crate::summary::summary_fragment(summary)
}

/// True when a newly extracted fact repeats a stored one (`existing: KnownFact[]`).
#[wasm_bindgen]
pub fn is_duplicate_fact(category: &str, fact: &str, existing: JsValue) -> Result<bool, JsValue> {
    let existing: Vec<KnownFact> = serde_wasm_bindgen::from_value(existing)?;
    Ok(knowing::is_duplicate_fact(category, fact, &existing))
}

/// Build the knowing prompt fragment from the stored facts (`KnownFact[]`):
/// derives stage + gaps via `KnowingProfile::from_facts`, then renders the same
/// "WHAT YOU UNDERSTAND … / AREAS STILL UNEXPLORED …" text the desktop appends.
#[wasm_bindgen]
pub fn build_knowing_fragment(facts: JsValue) -> Result<String, JsValue> {
    let facts: Vec<KnownFact> = serde_wasm_bindgen::from_value(facts)?;
    Ok(KnowingProfile::from_facts(facts).to_prompt_fragment())
}

// ---------------------------------------------------------------------------
// The Great Work (hermetic macro state — creature derivation)
// ---------------------------------------------------------------------------

/// Derive the creature's `StarchildState` from a `GreatWorkPosition` at a
/// JS-supplied timestamp. The creature becomes a homunculus mirror of the
/// user's inner state: hunger=plane balance, mood=stage health,
/// energy=PR alignment, bond=evidence, level=progress.
#[wasm_bindgen]
pub fn derive_state_from_position(
    position: JsValue,
    now_ms: f64,
) -> Result<JsValue, JsValue> {
    let pos: crate::opus::GreatWorkPosition = serde_wasm_bindgen::from_value(position)?;
    let now = DateTime::from_timestamp_millis(now_ms as i64)
        .ok_or_else(|| JsValue::from_str("derive_state_from_position: now_ms out of range"))?;
    let state = pos.derive_state_from_position(now);
    Ok(serde_wasm_bindgen::to_value(&state)?)
}

/// Record one piece of evidence into a `GreatWorkPosition`, advancing any plane
/// it makes ripe, and return the updated position. `now_iso` stamps
/// `last_advanced_at` when a plane advances. This is the ONLY way the shells
/// mutate the macro position, so the record→advance rule stays single-sourced
/// in the pure core (mirrors desktop; the web previously hand-rolled it and so
/// never advanced).
#[wasm_bindgen]
pub fn apply_evidence(
    position: JsValue,
    evidence: JsValue,
    now_iso: String,
) -> Result<JsValue, JsValue> {
    let mut pos: crate::opus::GreatWorkPosition = serde_wasm_bindgen::from_value(position)?;
    let ev: crate::opus::Evidence = serde_wasm_bindgen::from_value(evidence)?;
    pos.ingest_evidence(ev, now_iso);
    Ok(serde_wasm_bindgen::to_value(&pos)?)
}

// ---------------------------------------------------------------------------
// Listening pass, reply-shape awareness, open threads
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct ListenInput {
    #[serde(default)]
    recent_messages: Vec<ChatMessage>,
    #[serde(default)]
    phase: Option<String>,
    #[serde(default)]
    context: String,
}

/// Whether this phase gets a listening pass before the reply.
#[wasm_bindgen]
pub fn listen_wanted(phase: &str) -> bool {
    crate::listen::listen_wanted(phase_from_str(phase))
}

/// The listener's system prompt (`{recent_messages, phase, context}`).
#[wasm_bindgen]
pub fn listen_prompt(input: JsValue) -> Result<String, JsValue> {
    let inp: ListenInput = serde_wasm_bindgen::from_value(input)?;
    let phase = phase_from_str(inp.phase.as_deref().unwrap_or("arrive"));
    Ok(crate::listen::listen_prompt(&inp.recent_messages, phase, &inp.context))
}

#[wasm_bindgen]
pub fn listen_trigger() -> String {
    crate::listen::LISTEN_TRIGGER.to_string()
}

/// Parse the listener's raw output → a `Listening` object, or `null`.
#[wasm_bindgen]
pub fn parse_listening(raw: &str) -> Result<JsValue, JsValue> {
    match crate::listen::parse_listening(raw) {
        Some(l) => Ok(serde_wasm_bindgen::to_value(&l)?),
        None => Ok(JsValue::NULL),
    }
}

/// Render a parsed `Listening` as the reply prompt's final layer.
#[wasm_bindgen]
pub fn listening_fragment(listening: JsValue, phase: &str) -> Result<String, JsValue> {
    let l: crate::listen::Listening = serde_wasm_bindgen::from_value(listening)?;
    Ok(crate::listen::listening_fragment(&l, phase_from_str(phase)))
}

/// A "vary this now" note from the recent assistant replies, or "".
#[wasm_bindgen]
pub fn shape_fragment(recent_replies: JsValue) -> Result<String, JsValue> {
    let r: Vec<String> = serde_wasm_bindgen::from_value(recent_replies)?;
    Ok(crate::shape::shape_fragment(&r))
}

#[wasm_bindgen]
pub fn threads_extraction_system() -> String {
    crate::threads::threads_extraction_system()
}

#[wasm_bindgen]
pub fn build_threads_extraction_input(
    threads: JsValue,
    user_message: &str,
    ai_response: &str,
    now_ms: f64,
) -> Result<String, JsValue> {
    let t: Vec<crate::threads::OpenThread> = serde_wasm_bindgen::from_value(threads)?;
    Ok(crate::threads::build_threads_extraction_input(&t, user_message, ai_response, now_ms as i64))
}

/// Fold one extraction result into the thread list; returns the new list.
#[wasm_bindgen]
pub fn apply_thread_update(threads: JsValue, raw: &str, now_ms: f64) -> Result<JsValue, JsValue> {
    let t: Vec<crate::threads::OpenThread> = serde_wasm_bindgen::from_value(threads)?;
    let out = crate::threads::apply_thread_update(&t, raw, now_ms as i64);
    Ok(serde_wasm_bindgen::to_value(&out)?)
}

/// The open-threads prompt layer (`gap_ms` = time since their previous message).
#[wasm_bindgen]
pub fn threads_fragment(threads: JsValue, now_ms: f64, gap_ms: f64) -> Result<String, JsValue> {
    let t: Vec<crate::threads::OpenThread> = serde_wasm_bindgen::from_value(threads)?;
    Ok(crate::threads::threads_fragment(&t, now_ms as i64, gap_ms as i64))
}

/// Whether conversation replies let the model reason first (core
/// `ai::REPLY_REASONING`); background calls never do.
#[wasm_bindgen]
pub fn reply_reasoning() -> bool {
    ai::REPLY_REASONING
}

/// Fold one style signal (from the listening pass) into the person's notes.
#[wasm_bindgen]
pub fn merge_style_note(notes: JsValue, signal: &str, now_ms: f64) -> Result<JsValue, JsValue> {
    let n: Vec<crate::style::StyleNote> = serde_wasm_bindgen::from_value(notes)?;
    Ok(serde_wasm_bindgen::to_value(&crate::style::merge_style_note(&n, signal, now_ms as i64))?)
}

/// The "how they like to be spoken to" prompt layer, or "".
#[wasm_bindgen]
pub fn style_fragment(notes: JsValue) -> Result<String, JsValue> {
    let n: Vec<crate::style::StyleNote> = serde_wasm_bindgen::from_value(notes)?;
    Ok(crate::style::style_fragment(&n))
}
