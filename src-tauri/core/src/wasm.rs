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

/// Parse a phase tag back into the enum. Unknown/empty tags fall back to
/// `Arrive` (the safe opening phase) so a bad string never panics the bridge.
fn phase_from_str(s: &str) -> ConversationPhase {
    match s {
        "dig" => ConversationPhase::Dig,
        "crystallize" => ConversationPhase::Crystallize,
        "quest" => ConversationPhase::Quest,
        "explore" => ConversationPhase::Explore,
        "reframe" => ConversationPhase::Reframe,
        "negotiate" => ConversationPhase::Negotiate,
        "proof" => ConversationPhase::Proof,
        "release" => ConversationPhase::Release,
        _ => ConversationPhase::Arrive,
    }
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

/// True when an assistant reply contains a quest offer the UI should surface.
#[wasm_bindgen]
pub fn is_quest_offer(text: &str) -> bool {
    quest::is_quest_offer(text)
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
