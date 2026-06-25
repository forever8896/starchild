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
