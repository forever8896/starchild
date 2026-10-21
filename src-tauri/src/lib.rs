pub mod ai;
pub mod db;
pub mod e2ee;
pub mod e2ee_net;
pub mod game;
pub mod knowing;
pub mod memory;
pub mod telegram;
pub mod tts;
pub mod whatsapp;

use std::sync::Mutex;

use chrono::Timelike;
use serde::{Deserialize, Serialize};
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter, Manager, WindowEvent,
};
use tauri_plugin_notification::NotificationExt;
use uuid::Uuid;

use ai::{AiClient, ChatMessage, PersonalityParams, PromptBuilder};
use db::Database;
use game::StarchildState;
// Pure quest logic + authored copy now live once in the shared core; the desktop
// shell calls the SAME functions the web shell does (see web/src/quests.ts).
use starchild_core::{listen, messages, quest, safety, shape, style, threads};
use knowing::KnowingSystem;
use memory::MemorySystem;
use telegram::TelegramBotHandle;
use whatsapp::WhatsAppBotHandle;

// ---------------------------------------------------------------------------
// App state managed by Tauri
// ---------------------------------------------------------------------------

struct AppState {
    db: Database,
    ai_client: Mutex<Option<AiClient>>,
    game_state: Mutex<StarchildState>,
    memory: MemorySystem,
    knowing: KnowingSystem,
    telegram_bot: TelegramBotHandle,
    whatsapp_bot: WhatsAppBotHandle,
    tts_engine: Option<tts::TtsEngine>,
    venice_tts: Mutex<Option<tts::VeniceTts>>,
    app_data_dir: std::path::PathBuf,
}

// ---------------------------------------------------------------------------
// Types shared with the frontend
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FrontendStarchildState {
    hunger: f64,
    mood: String,
    energy: f64,
    bond: f64,
    xp: i64,
    level: i32,
}

#[derive(Serialize, Clone, Debug)]
struct SendMessageResponse {
    message: db::Message,
    starchild_state: FrontendStarchildState,
}

// ---------------------------------------------------------------------------
// Helper: convert game state to frontend format
// ---------------------------------------------------------------------------

pub fn to_frontend_state(state: &StarchildState) -> FrontendStarchildState {
    FrontendStarchildState {
        hunger: state.hunger,
        mood: state.mood.to_string(),
        energy: state.energy,
        bond: state.bond,
        xp: state.xp,
        level: state.level,
    }
}

// ---------------------------------------------------------------------------
// Helper: persist game state to DB
// ---------------------------------------------------------------------------

pub fn persist_state(db: &Database, state: &StarchildState) -> Result<(), String> {
    let db_state = db::StarchildState {
        id: 1,
        hunger: state.hunger,
        mood: state.mood.to_string(),
        energy: state.energy,
        bond: state.bond,
        xp: state.xp,
        level: state.level as i64,
        last_decay_at: state.last_decay_at.to_rfc3339(),
        created_at: String::new(),
        updated_at: String::new(),
    };
    db.save_state(&db_state).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Helper: load game state from DB
// ---------------------------------------------------------------------------

pub fn load_game_state(db: &Database) -> Result<StarchildState, String> {
    let row = db.get_state().map_err(|e| e.to_string())?;
    Ok(StarchildState::from_db_row(
        row.hunger,
        &row.mood,
        row.energy,
        row.bond,
        row.xp,
        row.level as i32,
        &row.last_decay_at,
    ))
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn send_message(
    message: String,
    state: tauri::State<'_, AppState>,
) -> Result<SendMessageResponse, String> {
    // Save user message
    let user_msg_id = Uuid::new_v4().to_string();
    state
        .db
        .save_message(&user_msg_id, "desktop", "user", &message)
        .map_err(|e| e.to_string())?;

    // Get AI client
    let ai_client = {
        let guard = state.ai_client.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or_else(|| {
            "No API key configured. Please set your Venice AI key in Settings.".to_string()
        })?
    };

    // Apply hunger decay and get current state
    let current_state = {
        let mut game = state.game_state.lock().map_err(|e| e.to_string())?;
        game.apply_hunger_decay();
        game.bond = (game.bond + 0.05).clamp(0.0, 100.0); // small bond increase for chatting
        persist_state(&state.db, &game)?;
        game.clone()
    };

    // Get personality
    let personality_row = state.db.get_personality().map_err(|e| e.to_string())?;
    let personality = PersonalityParams {
        warmth: (personality_row.warmth * 100.0) as u32,
        intensity: (personality_row.intensity * 100.0) as u32,
        humor: (personality_row.humor * 100.0) as u32,
        mysticism: (personality_row.mysticism * 100.0) as u32,
        directness: (personality_row.directness * 100.0) as u32,
    };

    // Build AI state snapshot
    let ai_state = ai::StarchildState {
        hunger: current_state.hunger as u32,
        mood: current_state.mood.to_string(),
        energy: current_state.energy as u32,
        bond: current_state.bond as u32,
        level: current_state.level as u32,
    };

    // Get recent messages for context
    let recent_msgs = state.db.get_messages(10).map_err(|e| e.to_string())?;
    let history: Vec<ChatMessage> = recent_msgs
        .iter()
        .rev() // DB returns most recent first, we need chronological
        .filter(|m| m.role == "user" || m.role == "assistant")
        .take(8) // keep context window small
        .map(|m| ChatMessage {
            role: m.role.clone(),
            content: m.content.clone(),
        })
        .collect();

    // Fetch relevant memories and knowing profile
    let memories: Vec<String> = state
        .memory
        .recall(&message, 5)
        .unwrap_or_default();

    let knowing_fragment = state
        .knowing
        .profile()
        .map(|p| p.to_prompt_fragment())
        .unwrap_or_default();

    // Detect conversation phase and build system prompt
    let phase = ai::PhaseDetector::detect(&history);
    let mut system_prompt = PromptBuilder::build(&ai_state, &personality, &memories, &[], &[], phase, None);
    if !knowing_fragment.is_empty() {
        system_prompt.push_str("\n\n");
        system_prompt.push_str(&knowing_fragment);
    }

    // Call AI
    let response_text = ai_client
        .chat_auto(&message, &system_prompt, history)
        .await
        .map_err(|e| e.to_string())?;

    // Save assistant message
    let assistant_msg_id = Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now()
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();
    state
        .db
        .save_message(&assistant_msg_id, "desktop", "assistant", &response_text)
        .map_err(|e| e.to_string())?;

    // Background: extract memories from this conversation turn
    let extraction_client = ai_client.clone();
    let extraction_memory = state.memory.clone();
    let extraction_knowing = state.knowing.clone();
    let user_msg = message.clone();
    let ai_reply = response_text.clone();
    tokio::spawn(async move {
        if let Err(e) = extract_memories(&extraction_client, &extraction_memory, &extraction_knowing, &user_msg, &ai_reply).await {
            log::warn!("Memory extraction failed: {e}");
        }
    });

    // Get updated state for frontend
    let frontend_state = {
        let game = state.game_state.lock().map_err(|e| e.to_string())?;
        to_frontend_state(&game)
    };

    Ok(SendMessageResponse {
        message: db::Message {
            id: assistant_msg_id,
            platform: "desktop".to_string(),
            role: "assistant".to_string(),
            content: response_text,
            created_at,
        },
        starchild_state: frontend_state,
    })
}

/// The open threads of their life (core `threads`), stored as one setting.
fn load_threads(db: &Database) -> Vec<threads::OpenThread> {
    db.get_setting("open_threads")
        .ok()
        .flatten()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Fold one turn into the open threads (core prompt + merge; E2EE internal tier).
async fn update_threads(
    client: &AiClient,
    db: &Database,
    user_message: &str,
    ai_response: &str,
) -> Result<(), String> {
    let current = load_threads(db);
    let now_ms = chrono::Utc::now().timestamp_millis();
    let messages = vec![
        ChatMessage::system(&threads::threads_extraction_system()),
        ChatMessage::user(&threads::build_threads_extraction_input(&current, user_message, ai_response, now_ms)),
    ];
    let raw = client
        .chat(messages, ai::ModelTier::Internal)
        .await
        .map_err(|e| e.to_string())?;
    let updated = threads::apply_thread_update(&current, &raw, now_ms);
    let json = serde_json::to_string(&updated).map_err(|e| e.to_string())?;
    db.set_setting("open_threads", &json).map_err(|e| e.to_string())
}

/// Extract key user facts from a conversation turn via a Quick-tier AI call.
/// Facts are stored both in the flat memory system (for FTS5 search) and in the
/// knowing system (for structured understanding).
pub async fn extract_memories(
    client: &AiClient,
    memory: &MemorySystem,
    knowing: &KnowingSystem,
    user_message: &str,
    ai_response: &str,
) -> Result<(), String> {
    // Extraction prompt + JSON parsing/normalization live in the shared core
    // (`knowing::build_extraction_input` / `parse_extracted_facts`) so the web
    // shell extracts insights identically; this command only adds the SQLite
    // storage side-effects.
    let messages = vec![
        ChatMessage::system(knowing::knowing_extraction_prompt()),
        ChatMessage::user(&knowing::build_extraction_input(user_message, ai_response)),
    ];

    let response = client
        .chat(messages, ai::ModelTier::Internal)
        .await
        .map_err(|e| e.to_string())?;

    // Dedup on write (core): the extractor re-finds the same insight most turns.
    let mut existing = knowing.profile().map(|p| p.facts).unwrap_or_default();
    for f in knowing::parse_extracted_facts(&response) {
        if starchild_core::knowing::is_duplicate_fact(&f.category, &f.fact, &existing) {
            continue;
        }
        existing.push(starchild_core::knowing::KnownFact {
            id: String::new(),
            category: f.category.clone(),
            fact: f.fact.clone(),
            importance: f.importance,
            confidence: f.confidence,
            created_at: String::new(),
        });

        // Store in flat memory system (FTS5 searchable)
        if let Err(e) = memory.store(&f.fact, f.importance, Some(&f.category)) {
            log::warn!("Failed to store memory: {e}");
        }

        // Store in structured knowing system (if valid category)
        if knowing::KnowingCategory::from_str(&f.category).is_some() {
            if let Err(e) =
                knowing.store_insight(&f.category, &f.fact, f.importance, f.confidence)
            {
                log::warn!("Failed to store knowing fact: {e}");
            }
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Quest Extraction from Conversation
// ---------------------------------------------------------------------------

/// Extract a quest from the conversation when the user accepts one.
/// Called in the background after the Release phase (quest offered + user accepted).
async fn extract_quest_from_conversation(
    client: &AiClient,
    db: &db::Database,
    history: &[ai::ChatMessage],
) -> Result<db::Quest, String> {
    // Find the most recent assistant message that contains a quest offer.
    // Offer detection lives once in the shared core (`quest::is_quest_offer`).
    let quest_msg = history.iter().rev()
        .filter(|m| m.role == "assistant")
        .find(|m| quest::is_quest_offer(&m.content))
        .map(|m| m.content.as_str())
        .unwrap_or("");

    if quest_msg.is_empty() {
        return Err("No quest offer found in conversation".to_string());
    }

    // Build recent context for the LLM
    let recent_context: String = history.iter().rev().take(6)
        .map(|m| {
            let truncated: String = m.content.char_indices()
                .take_while(|(i, _)| *i < 200)
                .map(|(_, c)| c)
                .collect();
            format!("{}: {truncated}", m.role)
        })
        .collect::<Vec<_>>()
        .into_iter().rev()
        .collect::<Vec<_>>()
        .join("\n");

    // The extraction prompt + system message are shared core copy.
    let prompt = quest::build_extraction_prompt(&recent_context);
    let messages = vec![
        ai::ChatMessage::system(quest::QUEST_EXTRACTION_SYSTEM),
        ai::ChatMessage::user(&prompt),
    ];

    let response = client
        .chat(messages, ai::ModelTier::Internal)
        .await
        .map_err(|e| e.to_string())?;

    // Parse + normalize (clamp/defaults) once, in the shared core. `None` means
    // the model declined or returned unparseable JSON.
    let extracted = quest::parse_extraction(&response)
        .ok_or_else(|| "No quest found to extract".to_string())?;

    // Guard against duplicates
    let existing = db.get_quests(Some("active")).unwrap_or_default();
    if existing.iter().any(|q| q.title.to_lowercase() == extracted.title.to_lowercase()) {
        return Err("Quest with same title already exists".to_string());
    }

    let id = Uuid::new_v4().to_string();
    let quest = db.create_quest(
        &id,
        &extracted.title,
        Some(&extracted.description),
        &extracted.quest_type,
        Some(&extracted.category),
        extracted.xp_reward,
        None, // no due_at
    ).map_err(|e| e.to_string())?;

    log::info!("Quest extracted from conversation: {} [{}]", quest.title, extracted.category);
    Ok(quest)
}

// ---------------------------------------------------------------------------
// Vision Crystallization
// ---------------------------------------------------------------------------

/// Compress older conversation messages into a running summary.
/// Called in the background when message count exceeds the sliding window.
async fn update_conversation_summary(
    client: &AiClient,
    db: &db::Database,
    msg_count: i64,
) -> Result<(), String> {
    use starchild_core::summary;
    // all_msgs is DESC order — reverse to chronological, then take the older ones
    let all_msgs = db.get_messages(msg_count).map_err(|e| e.to_string())?;
    let chronological: Vec<_> = all_msgs.into_iter().rev().collect();
    let Some(older_count) = summary::older_count(chronological.len()) else {
        return Ok(()); // Not enough older messages to warrant summarization
    };
    let older: Vec<(&str, &str)> = chronological[..older_count]
        .iter()
        .map(|m| (m.role.as_str(), m.content.as_str()))
        .collect();

    // Load existing summary for continuity
    let existing_summary = db.get_setting("conversation_summary")
        .ok().flatten()
        .unwrap_or_default();

    let messages = vec![
        ai::ChatMessage::system(summary::SUMMARY_SYSTEM),
        ai::ChatMessage::user(&summary::build_summary_prompt(&existing_summary, &older)),
    ];

    // E2EE (Internal tier) — the transcript is the most sensitive thing we send.
    let summary = client.chat(messages, ai::ModelTier::Internal)
        .await
        .map_err(|e| e.to_string())?;

    let _ = db.set_setting("conversation_summary", &summary);
    let _ = db.set_setting("summary_msg_count", &msg_count.to_string());

    Ok(())
}

/// LLM-based conversation phase classifier.
/// Reads the recent conversation and returns the appropriate phase.
async fn classify_conversation_phase(
    client: &AiClient,
    history: &[ai::ChatMessage],
) -> Result<ai::ConversationPhase, String> {
    // Build a compact conversation summary for classification
    let convo: String = history.iter().map(|m| {
        let role = if m.role == "user" { "Human" } else { "Starchild" };
        let truncated = m.content.char_indices()
            .take_while(|(i, _)| *i < 200)
            .map(|(_, c)| c)
            .collect::<String>();
        format!("{role}: {truncated}")
    }).collect::<Vec<_>>().join("\n");

    let exchange_count = history.iter().filter(|m| m.role == "user").count();

    let prompt = format!(
        "You are a conversation phase classifier for a personal growth companion.\n\n\
         Recent conversation ({exchange_count} user messages so far):\n{convo}\n\n\
         Based on the conversation, what should the companion do NEXT? Pick exactly ONE:\n\n\
         - explore: Learn more about the human's real life, challenges, daily reality. Build the relationship.\n\
         - dig: The human is still exploring a specific topic. Develop their metaphor/image forward.\n\
         - reframe: Enough info gathered (6+ exchanges). Connect two things they said into a new insight.\n\
         - quest: The human is ready for action, explicitly asks for a quest, or a reframe has landed. Offer a concrete quest.\n\
         - negotiate: A quest was offered and the human is discussing, adjusting, or pushing back on it.\n\
         - release: A quest was accepted. Close the thread warmly.\n\n\
         IMPORTANT RULES:\n\
         - Default to EXPLORE if fewer than 5 exchanges — the companion should be PATIENT and learn first\n\
         - Only use REFRAME after 6+ exchanges when the companion knows enough to connect real dots\n\
         - Only use QUEST when the human explicitly asks OR after a reframe has landed\n\
         - If the human pushes back on a quest (\"nah\", \"something else\", \"why?\") → negotiate\n\
         - NEVER rush to quest. Earning trust through exploration is more important than giving advice.\n\n\
         Reply with ONLY the phase name, nothing else."
    );

    let messages = vec![
        ai::ChatMessage::system("Reply with exactly one word: explore, dig, reframe, quest, negotiate, or release."),
        ai::ChatMessage::user(&prompt),
    ];

    let response = client.chat(messages, ai::ModelTier::Internal)
        .await
        .map_err(|e| e.to_string())?;

    let phase_str = response.trim().to_lowercase();
    let phase = match phase_str.as_str() {
        "explore" => ai::ConversationPhase::Explore,
        "dig" => ai::ConversationPhase::Dig,
        "reframe" => ai::ConversationPhase::Reframe,
        "quest" => ai::ConversationPhase::Quest,
        "negotiate" => ai::ConversationPhase::Negotiate,
        "release" => ai::ConversationPhase::Release,
        other => {
            log::warn!("LLM returned unknown phase '{other}', defaulting to explore");
            ai::ConversationPhase::Explore
        }
    };

    Ok(phase)
}

/// Synthesize a beautiful, concise vision statement from the conversation so far.
/// Called once after the preferential reality is captured and a few exchanges deepen it.
/// Saves the result as `vision_statement` and emits `vision-crystallized` to the frontend.
async fn crystallize_vision(
    client: &AiClient,
    db: &db::Database,
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    // Gather raw PR + recent conversation
    let pr = db.get_setting("preferential_reality")
        .ok()
        .flatten()
        .unwrap_or_default();

    let recent_msgs = db.get_messages(12).map_err(|e| e.to_string())?;
    let conversation: String = recent_msgs
        .iter()
        .rev()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .take(10)
        .map(|m| format!("{}: {}", m.role, m.content))
        .collect::<Vec<_>>()
        .join("\n");

    // Shared with the web shell (core): the prompt and the cleanup.
    let messages = vec![
        ChatMessage::system(&ai::vision_synthesis_prompt(&pr, &conversation)),
        ChatMessage::user(ai::VISION_SYNTHESIS_TRIGGER),
    ];

    let vision = client
        .chat(messages, ai::ModelTier::Internal)
        .await
        .map_err(|e| e.to_string())?;

    let vision = ai::clean_vision(&vision);

    if !vision.is_empty() {
        let _ = db.set_setting("vision_statement", &vision);
        let _ = app_handle.emit("vision-crystallized", ());
        // Don't reveal the tree here — let the Crystallize phase response happen first.
        // The tree reveal fires after the stream-done of the Crystallize response.
        log::info!("Vision crystallized: {vision}");
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Streaming event payloads
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, Debug)]
struct StreamChunkPayload {
    token: String,
}

#[derive(Serialize, Clone, Debug)]
struct StreamDonePayload {
    message: db::Message,
    starchild_state: FrontendStarchildState,
}

#[derive(Serialize, Clone, Debug)]
struct StreamErrorPayload {
    error: String,
}

// ---------------------------------------------------------------------------
// Streaming command
// ---------------------------------------------------------------------------

/// When the AI disclosure was last shown this run (f64 epoch ms as bits; 0 = not
/// yet), so every launch discloses. Core owns the cadence.
static AI_DISCLOSURE_SHOWN_AT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// The "you're talking to an AI" text when it is due (start of session, then
/// every three hours — core `safety::ai_disclosure_due`), else None. Marks it shown.
#[tauri::command]
fn ai_disclosure() -> Option<String> {
    use std::sync::atomic::Ordering;
    let now = chrono::Utc::now().timestamp_millis() as f64;
    let last = f64::from_bits(AI_DISCLOSURE_SHOWN_AT.load(Ordering::Relaxed));
    if !safety::ai_disclosure_due(Some(last), now) {
        return None;
    }
    AI_DISCLOSURE_SHOWN_AT.store(now.to_bits(), Ordering::Relaxed);
    Some(safety::AI_DISCLOSURE_TEXT.to_string())
}

/// The person's region (ISO alpha-2) from the OS locale (LANG / LC_ALL, e.g.
/// "en_GB.UTF-8" → "GB"); "" when unknown. Only orders crisis help lines.
fn user_region() -> String {
    ["LC_ALL", "LC_MESSAGES", "LANG"]
        .iter()
        .filter_map(|k| std::env::var(k).ok())
        .find_map(|v| {
            let tag = v.split('.').next().unwrap_or("");
            let region = tag.split(['_', '-']).nth(1)?;
            (region.len() == 2).then(|| region.to_ascii_uppercase())
        })
        .unwrap_or_default()
}

#[tauri::command]
async fn send_message_stream(
    message: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    // Save user message
    let user_msg_id = Uuid::new_v4().to_string();
    state
        .db
        .save_message(&user_msg_id, "desktop", "user", &message)
        .map_err(|e| e.to_string())?;

    // Save preferential reality if this is the first substantial user message —
    // never a crisis disclosure (that must not become the permanent north star).
    if message.len() > 20 && !safety::detect_crisis(&message) {
        if let Ok(None) = state.db.get_setting("preferential_reality") {
            let _ = state.db.set_setting("preferential_reality", &message);
            log::info!("Preferential reality saved (raw)");
        }
    }

    // Get AI client
    let ai_client = {
        let guard = state.ai_client.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or_else(|| {
            "No API key configured. Please set your Venice AI key in Settings.".to_string()
        })?
    };

    // Apply hunger decay and get current state
    let current_state = {
        let mut game = state.game_state.lock().map_err(|e| e.to_string())?;
        game.apply_hunger_decay();
        game.bond = (game.bond + 0.05).clamp(0.0, 100.0);
        persist_state(&state.db, &game)?;
        game.clone()
    };

    // Get personality
    let personality_row = state.db.get_personality().map_err(|e| e.to_string())?;
    let personality = PersonalityParams {
        warmth: (personality_row.warmth * 100.0) as u32,
        intensity: (personality_row.intensity * 100.0) as u32,
        humor: (personality_row.humor * 100.0) as u32,
        mysticism: (personality_row.mysticism * 100.0) as u32,
        directness: (personality_row.directness * 100.0) as u32,
    };

    // Build AI state snapshot
    let ai_state = ai::StarchildState {
        hunger: current_state.hunger as u32,
        mood: current_state.mood.to_string(),
        energy: current_state.energy as u32,
        bond: current_state.bond as u32,
        level: current_state.level as u32,
    };

    // Get recent messages for context (exclude the message we just saved —
    // chat_stream_auto appends the current user message itself)
    // `get_messages` is newest-first: take the 14 MOST RECENT, then restore
    // chronological order (reversing first used to keep the oldest 14 of the
    // 20 and drop the latest turns from the model's view).
    let recent_msgs = state.db.get_messages(20).map_err(|e| e.to_string())?;
    let mut history: Vec<ChatMessage> = recent_msgs
        .iter()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .filter(|m| m.id != user_msg_id) // exclude current message — added by chat_stream_auto
        .take(14)
        .map(|m| ChatMessage {
            role: m.role.clone(),
            content: m.content.clone(),
        })
        .collect();
    history.reverse();

    // Time since their previous message — a long gap makes this turn a return.
    let now_ms = chrono::Utc::now().timestamp_millis();
    let gap_ms = recent_msgs
        .iter()
        .find(|m| m.role == "user" && m.id != user_msg_id)
        .and_then(|m| chrono::NaiveDateTime::parse_from_str(&m.created_at, "%Y-%m-%d %H:%M:%S").ok())
        .map(|t| (now_ms - t.and_utc().timestamp_millis()).max(0))
        .unwrap_or(0);

    // Load conversation summary (compressed history of older messages)
    let conversation_summary = state.db.get_setting("conversation_summary")
        .ok()
        .flatten()
        .unwrap_or_default();

    // Fetch relevant memories and knowing profile
    let memories: Vec<String> = state
        .memory
        .recall(&message, 5)
        .unwrap_or_default();

    let knowing_fragment = state
        .knowing
        .profile()
        .map(|p| p.to_prompt_fragment())
        .unwrap_or_default();

    // Fetch active quest titles for the prompt
    let active_quest_titles: Vec<String> = state.db
        .get_quests(Some("active"))
        .unwrap_or_default()
        .into_iter()
        .map(|q| {
            let cat = q.category.as_deref().unwrap_or("general");
            format!("[{}] {}", cat, q.title)
        })
        .collect();

    // ── Proof-of-completion detection ──
    // Check if user is in a proof flow (triggered by [proof:QUEST_ID] prefix)
    let proof_trigger = message.starts_with("[proof:");
    let mut pending_proof = state.db.get_setting("pending_proof_quest_id").ok().flatten()
        .filter(|s| !s.is_empty());

    // Turn 2+: complete only if core judges the reply a story. "Not yet"
    // disarms; a too-short reply gets one more ask (core quest::judge_proof).
    let mut proof_verdict: Option<quest::ProofVerdict> = None;
    if !proof_trigger && pending_proof.is_some() {
        let mut v = quest::judge_proof(&message);
        let unclear_so_far: u32 = state.db.get_setting("pending_proof_unclear").ok().flatten()
            .and_then(|s| s.parse().ok()).unwrap_or(0);
        if v == quest::ProofVerdict::Unclear && unclear_so_far + 1 >= quest::PROOF_MAX_UNCLEAR {
            v = quest::ProofVerdict::NotYet; // asked enough — disarm quietly
        }
        if v == quest::ProofVerdict::Unclear {
            let _ = state.db.set_setting("pending_proof_unclear", &(unclear_so_far + 1).to_string());
        } else {
            let _ = state.db.set_setting("pending_proof_unclear", "0");
            if v == quest::ProofVerdict::NotYet {
                let _ = state.db.set_setting("pending_proof_quest_id", "");
                pending_proof = None;
            }
        }
        proof_verdict = Some(v);
    } else if proof_trigger {
        let _ = state.db.set_setting("pending_proof_unclear", "0");
    }

    if proof_trigger {
        // Extract quest ID from [proof:QUEST_ID] prefix
        if let Some(quest_id) = message.strip_prefix("[proof:")
            .and_then(|s| s.split(']').next())
        {
            let _ = state.db.set_setting("pending_proof_quest_id", quest_id);
            log::info!("Proof flow started for quest: {quest_id}");
        }
    }

    // Detect conversation phase from recent history
    let has_pr = state.db.get_setting("preferential_reality").ok().flatten().is_some();
    let has_vision = state.db.get_setting("vision_statement").ok().flatten().is_some();
    let vision_revealed = state.db.get_setting("vision_revealed").ok().flatten().is_some();
    // Crystallize when: PR exists AND (vision not yet created OR vision created but not yet revealed)
    let crystallize_pending = has_pr && (!has_vision || (has_vision && !vision_revealed));

    // Build phase-detection history that INCLUDES the current user message.
    // `history` excludes it (chat_stream_auto will add it for the API call),
    // but the phase detector needs the full picture to count exchanges correctly.
    let mut phase_history = history.clone();
    phase_history.push(ai::ChatMessage {
        role: "user".to_string(),
        content: message.clone(),
    });

    // ── Safety guardrail (core `safety`) ──
    // If this or one of the last few human messages signalled self-harm, the
    // turn is Crisis: no vision, no quest, no memory mining — and the UI puts
    // real help lines on screen (before inference, so they show even if it fails).
    let user_texts: Vec<&str> = phase_history
        .iter()
        .filter(|m| m.role == "user")
        .map(|m| m.content.as_str())
        .collect();
    let is_crisis = safety::crisis_active(&user_texts);
    let _ = app_handle.emit(
        "crisis-state",
        serde_json::json!({
            "active": is_crisis,
            "resources": if is_crisis { safety::crisis_resources(&user_region()) } else { vec![] },
        }),
    );

    // Phase detection:
    // - Crisis overrides everything
    // - Proof flow takes priority next
    // - Pre-vision: deterministic (Arrive / Crystallize)
    // - Post-vision: heuristic overrides first, then LLM classifier
    let phase = if is_crisis {
        ai::ConversationPhase::Crisis
    } else if proof_trigger || pending_proof.is_some() {
        ai::ConversationPhase::Proof
    } else if proof_verdict == Some(quest::ProofVerdict::NotYet) {
        // They haven't done it — talk about the quest (adjust, shrink, re-cue).
        ai::ConversationPhase::Negotiate
    } else if crystallize_pending {
        ai::PhaseDetector::detect_with_context(&phase_history, true)
    } else if !has_pr {
        ai::ConversationPhase::Arrive
    } else {
        // ── Heuristic overrides (run BEFORE LLM classifier) ──

        // 0. Quest cooldown: if a quest was just completed (proof celebration in last 2 msgs), explore first
        let quest_just_completed = phase_history.iter().rev().take(3)
            .filter(|m| m.role == "assistant")
            .any(|m| {
                let lower = m.content.to_lowercase();
                lower.contains("got brighter") || lower.contains("shifted in me")
                    || lower.contains("witnessing") || lower.contains("celebrate")
            });
        // Also check via DB: if pending_proof was recently cleared
        let recently_completed = state.db.get_quests(Some("completed")).unwrap_or_default()
            .first()
            .and_then(|q| q.completed_at.as_ref())
            .map(|t| {
                // If completed within last 5 minutes, still in cooldown
                chrono::NaiveDateTime::parse_from_str(t, "%Y-%m-%d %H:%M:%S")
                    .map(|completed| {
                        let now = chrono::Utc::now().naive_utc();
                        (now - completed).num_minutes() < 5
                    })
                    .unwrap_or(false)
            })
            .unwrap_or(false);

        // 1. First quest: if vision is placed but no quest has ever been offered, offer one
        let any_quest_offered = phase_history.iter()
            .filter(|m| m.role == "assistant")
            .any(|m| quest::is_quest_offer(&m.content));
        let has_active_quests = !active_quest_titles.is_empty();

        if (quest_just_completed || recently_completed) && !active_quest_titles.is_empty() {
            // Just completed a quest — explore, don't rush to the next one
            ai::ConversationPhase::Explore
        }
        else if has_vision && !any_quest_offered && !has_active_quests && !recently_completed
            && state.db.get_quests(None).map(|q| q.is_empty()).unwrap_or(false)
        {
            // Vision is on the tree but no quest yet → offer first quest
            ai::ConversationPhase::Quest
        }
        // 2. User explicitly asking for action → Quest (don't let LLM ignore this)
        else if {
            let lower_msg = message.to_lowercase();
            lower_msg.contains("how do i") || lower_msg.contains("how to do")
                || lower_msg.contains("how can i") || lower_msg.contains("what should i do")
                || lower_msg.contains("give me a quest") || lower_msg.contains("what can i do")
                || lower_msg.contains("where do i start")
        } {
            ai::ConversationPhase::Quest
        }
        // 3. Reframe offered 2+ times → advance to Quest (prevent reframe loops)
        else if {
            let reframe_count = phase_history.iter()
                .filter(|m| m.role == "assistant")
                .filter(|m| {
                    let lower = m.content.to_lowercase();
                    !lower.contains("vision tree") &&
                    (lower.contains("what if") || lower.contains("notice that")
                        || (lower.contains("you said") && lower.contains("but")))
                })
                .count();
            reframe_count >= 2
        } {
            ai::ConversationPhase::Quest
        }
        else {
            // Fall through to LLM classifier
            let phase_result = classify_conversation_phase(&ai_client, &phase_history).await;
            match phase_result {
                Ok(p) => p,
                Err(e) => {
                    log::warn!("Phase classification failed, falling back to heuristic: {e}");
                    ai::PhaseDetector::detect_with_context(&phase_history, false)
                }
            }
        }
    };
    log::info!("Conversation phase: {:?} (crystallize_pending={})", phase, crystallize_pending);

    // Build system prompt with knowing profile and conversation phase
    let mut system_prompt = PromptBuilder::build(&ai_state, &personality, &memories, &active_quest_titles, &[], phase, None);
    if !knowing_fragment.is_empty() {
        system_prompt.push_str("\n\n");
        system_prompt.push_str(&knowing_fragment);
    }
    if let Some(v) = proof_verdict {
        let note = quest::proof_note(v);
        if !note.is_empty() {
            system_prompt.push_str("\n\n");
            system_prompt.push_str(note);
        }
    }

    // Inject conversation summary for long-running conversations
    let summary_fragment = starchild_core::summary::summary_fragment(&conversation_summary);
    if !summary_fragment.is_empty() {
        system_prompt.push_str("\n\n");
        system_prompt.push_str(&summary_fragment);
    }

    // Add skill tree branch balance info for quest generation
    {
        let all_quests = state.db.get_quests(None).unwrap_or_default();
        if !all_quests.is_empty() {
            let categories = ["body", "mind", "spirit"];
            let labels = ["Body", "Mind", "Spirit"];
            let mut branch_info = String::from("\n\nSKILL TREE BRANCHES (quest balance across growth domains):\n");
            for (cat, label) in categories.iter().zip(labels.iter()) {
                let total = all_quests.iter().filter(|q| q.category.as_deref() == Some(cat)).count();
                let completed = all_quests.iter().filter(|q| q.category.as_deref() == Some(cat) && q.status == "completed").count();
                branch_info.push_str(&format!("  {} ({}): {}/{} quests completed\n", label, cat, completed, total));
            }
            // Determine which category needs the next quest (cycle: body → mind → spirit)
            let cat_counts: Vec<(&str, usize)> = categories.iter()
                .map(|&cat| (cat, all_quests.iter().filter(|q| q.category.as_deref() == Some(cat)).count()))
                .collect();
            let min_count = cat_counts.iter().map(|(_, c)| *c).min().unwrap_or(0);
            let next_category = cat_counts.iter()
                .find(|(_, c)| *c == min_count)
                .map(|(cat, _)| *cat)
                .unwrap_or("spirit");
            let next_label = match next_category {
                "body" => "Body (embodying the reality — physical, nature, movement)",
                "mind" => "Mind (mentally stepping into the reality — learning, creating, building)",
                "spirit" => "Spirit (attuning the whole being — presence, reflection, alchemy, connection)",
                _ => "Spirit",
            };
            branch_info.push_str(&format!(
                "\nNEXT QUEST MUST BE: {} category.\n\
                 The skill tree cycles through Body → Mind → Spirit to ensure balanced growth.\n\
                 Each quest should connect to the user's preferential reality.",
                next_label
            ));

            // Add preferential reality context if available
            if let Ok(Some(pr)) = state.db.get_setting("preferential_reality") {
                branch_info.push_str(&format!("\n\nTHEIR PREFERENTIAL REALITY (their ideal life vision):\n\"{}\"", pr));
            }

            system_prompt.push_str(&branch_info);
        }
    }

    // ── Open threads + reply habits (shared core) ──
    let open_threads = load_threads(&state.db);
    let threads_frag = threads::threads_fragment(&open_threads, now_ms, gap_ms);
    if !threads_frag.is_empty() {
        system_prompt.push_str("\n\n");
        system_prompt.push_str(&threads_frag);
    }
    let recent_replies: Vec<String> = history
        .iter()
        .filter(|m| m.role == "assistant")
        .map(|m| m.content.clone())
        .collect();
    let habits = shape::shape_fragment(&recent_replies);
    if !habits.is_empty() {
        system_prompt.push_str("\n\n");
        system_prompt.push_str(&habits);
    }
    // How they like to be spoken to — learned from their reactions (below).
    let style_notes: Vec<style::StyleNote> = state
        .db
        .get_setting("style_notes")
        .ok()
        .flatten()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let style_frag = style::style_fragment(&style_notes);
    if !style_frag.is_empty() {
        system_prompt.push_str("\n\n");
        system_prompt.push_str(&style_frag);
    }

    // ── The listening pass (shared core) ──
    // A short private read of the person before the reply — what they said,
    // what it means to them, what they need, which move fits. Appended last so
    // it outweighs the phase template. E2EE internal tier; bounded; on any
    // failure the reply simply goes ahead without it.
    if listen::listen_wanted(phase) {
        let context = [knowing_fragment.as_str(), summary_fragment.as_str(), threads_frag.as_str(), style_frag.as_str()]
            .iter()
            .filter(|s| !s.is_empty())
            .cloned()
            .collect::<Vec<_>>()
            .join("\n\n");
        let listen_msgs = vec![
            ChatMessage::system(listen::listen_prompt(&phase_history, phase, &context)),
            ChatMessage::user(listen::LISTEN_TRIGGER),
        ];
        match tokio::time::timeout(
            std::time::Duration::from_secs(15),
            ai_client.chat(listen_msgs, ai::ModelTier::Internal),
        )
        .await
        {
            Ok(Ok(raw)) => {
                if let Some(l) = listen::parse_listening(&raw) {
                    system_prompt.push_str("\n\n");
                    system_prompt.push_str(&listen::listening_fragment(&l, phase));
                    // Their reaction to how Starchild spoke shapes every later reply.
                    if !l.style.trim().is_empty() && !is_crisis {
                        let merged = style::merge_style_note(&style_notes, &l.style, now_ms);
                        if let Ok(json) = serde_json::to_string(&merged) {
                            let _ = state.db.set_setting("style_notes", &json);
                        }
                    }
                }
            }
            Ok(Err(e)) => log::warn!("Listening pass failed: {e}"),
            Err(_) => log::warn!("Listening pass timed out"),
        }
    }

    // Clone what we need for the streaming callback and post-response handlers
    let handle = app_handle.clone();
    let db = state.db.clone();
    let memory_sys = state.memory.clone();
    let knowing_sys = state.knowing.clone();
    let user_msg_clone = message.clone();

    // Stream AI response (dropping leading blank lines some models open with,
    // so the live bubble never starts empty — the final text is post-processed).
    // The model occasionally finishes with no content at all; nothing has been
    // shown then, so retry once silently — an empty reply is never stored.
    let mut started = false;
    let mut response_text = Err(ai::AiError::EmptyResponse);
    for _ in 0..2 {
        response_text = ai_client
            .chat_stream_auto(&message, &system_prompt, history.clone(), |token| {
                let t = if started { token } else { token.trim_start() };
                if t.is_empty() {
                    return;
                }
                started = true;
                let _ = handle.emit("stream-chunk", StreamChunkPayload {
                    token: t.to_string(),
                });
            })
            .await;
        match &response_text {
            Ok(text) if text.trim().is_empty() => response_text = Err(ai::AiError::EmptyResponse),
            _ => break,
        }
    }

    match response_text {
        Ok(raw_text) => {
            // Post-process: collapse paragraphs, enforce crystallize format, strip emoji
            let full_text = ai::postprocess_response(&raw_text, phase);

            // Save assistant message
            let assistant_msg_id = Uuid::new_v4().to_string();
            let created_at = chrono::Utc::now()
                .format("%Y-%m-%d %H:%M:%S")
                .to_string();
            let _ = db.save_message(&assistant_msg_id, "desktop", "assistant", &full_text);

            // Get updated state for frontend
            let frontend_state = {
                let game = state.game_state.lock().map_err(|e| e.to_string())?;
                to_frontend_state(&game)
            };

            let _ = app_handle.emit("stream-done", StreamDonePayload {
                message: db::Message {
                    id: assistant_msg_id,
                    platform: "desktop".to_string(),
                    role: "assistant".to_string(),
                    content: full_text.clone(),
                    created_at,
                },
                starchild_state: frontend_state,
            });

            // Structured event: reveal skill tree after crystallize phase
            if phase == ai::ConversationPhase::Crystallize {
                let _ = state.db.set_setting("vision_revealed", "true");
                let _ = app_handle.emit("reveal-skill-tree", ());
            }

            // Proof phase: complete the quest after user shared their proof
            // Turn 1: user sends [proof:ID] trigger → Starchild asks "tell me about it"
            // Turn 2: user shares their story → Starchild celebrates → quest completed
            if phase == ai::ConversationPhase::Proof
                && !proof_trigger
                && proof_verdict == Some(quest::ProofVerdict::Complete)
            {
                // This is Turn 2 — user shared proof, Starchild celebrated
                if let Some(quest_id) = pending_proof.as_deref() {
                    let _ = state.db.set_setting("pending_proof_quest_id", "");
                    match state.db.complete_quest(quest_id) {
                        Ok(quest) => {
                            // Award XP and feed Starchild
                            let frontend_state = {
                                let mut game = state.game_state.lock().map_err(|e| e.to_string())?;
                                let _levelled_up = game.add_xp(quest.xp_reward);
                                game.feed(quest.xp_reward as f64 / 10.0);
                                let _ = persist_state(&state.db, &game);
                                to_frontend_state(&game)
                            };
                            let _ = app_handle.emit("quest-completed", serde_json::json!({
                                "quest": quest,
                                "starchild_state": frontend_state,
                                "xp_reward": quest.xp_reward,
                            }));
                            let _ = app_handle.emit("quest-celebration", serde_json::json!({
                                "quest_id": quest.id,
                                "category": quest.category,
                                "xp_reward": quest.xp_reward,
                            }));
                            log::info!("Quest completed via proof: {} (+{} XP)", quest.title, quest.xp_reward);
                        }
                        Err(e) => log::warn!("Failed to complete quest {quest_id}: {e}"),
                    }
                }
            }

            // Show accept/decline buttons whenever the response contains a quest offer
            // (Quest phase, Negotiate phase with revised quest, or any phase) —
            // never on a crisis turn, even if the model slipped into quest wording.
            if !is_crisis && quest::is_quest_offer(&full_text) {
                let _ = app_handle.emit("quest-offered", ());
            }

            // Background: fold this turn into the open threads (not on a crisis turn).
            if !is_crisis {
                let threads_client = ai_client.clone();
                let threads_db = state.db.clone();
                let (u, a) = (message.clone(), full_text.clone());
                tokio::spawn(async move {
                    if let Err(e) = update_threads(&threads_client, &threads_db, &u, &a).await {
                        log::warn!("Thread update failed: {e}");
                    }
                });
            }

            // Background: extract memories — skipped on a crisis turn; we don't
            // mine a self-harm disclosure into the profile.
            let extraction_client = ai_client.clone();
            if !is_crisis { tokio::spawn(async move {
                if let Err(e) = extract_memories(
                    &extraction_client,
                    &memory_sys,
                    &knowing_sys,
                    &user_msg_clone,
                    &full_text,
                ).await {
                    log::warn!("Memory extraction failed: {e}");
                }
            }); }

            // Background: update conversation summary when history grows long
            {
                let summary_db = state.db.clone();
                let summary_client = ai_client.clone();
                let msg_count = state.db.count_messages().unwrap_or(0);
                let last_summarized: i64 = state.db.get_setting("summary_msg_count")
                    .ok().flatten()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
                // Re-summarize every 20 new messages beyond the recent window (core).
                if starchild_core::summary::summary_due(msg_count.max(0) as usize, last_summarized.max(0) as usize) {
                    tokio::spawn(async move {
                        if let Err(e) = update_conversation_summary(
                            &summary_client,
                            &summary_db,
                            msg_count,
                        ).await {
                            log::warn!("Conversation summary update failed: {e}");
                        }
                    });
                }
            }

            // Background: vision crystallization
            // After preferential reality is captured and a few exchanges pass,
            // synthesize a beautiful vision statement from the conversation.
            {
                let vision_db = state.db.clone();
                let vision_client = ai_client.clone();
                let vision_handle = app_handle.clone();
                let has_pr = state.db.get_setting("preferential_reality").ok().flatten().is_some();
                let has_vision = state.db.get_setting("vision_statement").ok().flatten().is_some();

                if has_pr && !has_vision {
                    // Count total messages — crystallize after ~5+ messages
                    // (first message + PR answer + 2-3 follow-ups)
                    let msg_count = state.db.get_messages(20).map(|m| m.len()).unwrap_or(0);
                    if msg_count >= 5 {
                        tokio::spawn(async move {
                            if let Err(e) = crystallize_vision(
                                &vision_client,
                                &vision_db,
                                &vision_handle,
                            ).await {
                                log::warn!("Vision crystallization failed: {e}");
                            }
                        });
                    }
                }
            }

            Ok(())
        }
        Err(e) => {
            let _ = app_handle.emit("stream-error", StreamErrorPayload {
                error: e.to_string(),
            });
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn get_messages(
    limit: i64,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<db::Message>, String> {
    let mut messages = state.db.get_messages(limit).map_err(|e| e.to_string())?;
    messages.reverse(); // Return in chronological order
    Ok(messages)
}

/// Process an image message: vision model describes it, then Starchild responds.
/// Two-step pipeline: Qwen3-VL → description → conversation model.
#[tauri::command]
async fn send_image_message(
    image_base64: String,
    mime_type: String,
    caption: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let ai_client = {
        let guard = state.ai_client.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("AI client not configured")?
    };

    // Save a user message noting an image was sent
    let user_msg_id = Uuid::new_v4().to_string();
    let user_text = caption.as_deref().unwrap_or("[sent an image]");
    state.db.save_message(&user_msg_id, "desktop", "user", user_text)
        .map_err(|e| e.to_string())?;

    // Step 1: Vision model describes the image
    let description = ai_client
        .describe_image(&image_base64, &mime_type, None)
        .await
        .map_err(|e| format!("Vision failed: {e}"))?;

    // Step 2: Feed the description + caption into the regular chat flow
    let combined_message = if let Some(cap) = &caption {
        format!("[the user sent an image. here is what you see in it: {}] their message: {}", description, cap)
    } else {
        format!("[the user sent you an image. here is what you see in it: {}] respond to what you see.", description)
    };

    // Now run the normal streaming chat with this combined message
    let current_state = {
        let mut game = state.game_state.lock().map_err(|e| e.to_string())?;
        game.apply_hunger_decay();
        game.bond = (game.bond + 0.05).clamp(0.0, 100.0);
        persist_state(&state.db, &game)?;
        game.clone()
    };

    let personality_row = state.db.get_personality().map_err(|e| e.to_string())?;
    let personality = PersonalityParams {
        warmth: (personality_row.warmth * 100.0) as u32,
        intensity: (personality_row.intensity * 100.0) as u32,
        humor: (personality_row.humor * 100.0) as u32,
        mysticism: (personality_row.mysticism * 100.0) as u32,
        directness: (personality_row.directness * 100.0) as u32,
    };

    let ai_state = ai::StarchildState {
        hunger: current_state.hunger as u32,
        mood: current_state.mood.to_string(),
        energy: current_state.energy as u32,
        bond: current_state.bond as u32,
        level: current_state.level as u32,
    };

    let recent_msgs = state.db.get_messages(20).map_err(|e| e.to_string())?;
    let history: Vec<ai::ChatMessage> = recent_msgs
        .iter()
        .rev()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .filter(|m| m.id != user_msg_id)
        .take(14)
        .map(|m| ai::ChatMessage { role: m.role.clone(), content: m.content.clone() })
        .collect();

    let memories: Vec<String> = state.memory.recall(user_text, 5).unwrap_or_default();
    let knowing_fragment = state.knowing.profile().map(|p| p.to_prompt_fragment()).unwrap_or_default();

    let phase = ai::PhaseDetector::detect(&history);
    let mut system_prompt = PromptBuilder::build(&ai_state, &personality, &memories, &[], &[], phase, None);
    if !knowing_fragment.is_empty() {
        system_prompt.push_str("\n\n");
        system_prompt.push_str(&knowing_fragment);
    }

    let handle = app_handle.clone();
    let db = state.db.clone();
    let memory_sys = state.memory.clone();
    let knowing_sys = state.knowing.clone();
    let user_msg_clone = user_text.to_string();

    let response_text = ai_client
        .chat_stream_auto(&combined_message, &system_prompt, history, |token| {
            let _ = handle.emit("stream-chunk", StreamChunkPayload {
                token: token.to_string(),
            });
        })
        .await;

    match response_text {
        Ok(text) => {
            let msg_id = Uuid::new_v4().to_string();
            let created_at = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
            db.save_message(&msg_id, "desktop", "assistant", &text)
                .map_err(|e| e.to_string())?;

            let new_state = {
                let mut game = state.game_state.lock().map_err(|e| e.to_string())?;
                game.hunger = (game.hunger - 3.0).clamp(0.0, 100.0);
                persist_state(&db, &game)?;
                to_frontend_state(&game)
            };

            let _ = app_handle.emit("stream-done", serde_json::json!({
                "message": {
                    "id": msg_id,
                    "platform": "desktop",
                    "role": "assistant",
                    "content": text,
                    "created_at": created_at,
                },
                "starchild_state": new_state,
            }));

            // Background memory extraction
            let ai_clone = ai_client.clone();
            let reply = text.clone();
            tokio::spawn(async move {
                let _ = extract_memories(&ai_clone, &memory_sys, &knowing_sys, &user_msg_clone, &reply).await;
            });
        }
        Err(e) => {
            let _ = app_handle.emit("stream-error", serde_json::json!({ "error": e.to_string() }));
        }
    }

    Ok(())
}

/// Check if TTS is available.
#[tauri::command]
async fn tts_available(state: tauri::State<'_, AppState>) -> Result<bool, String> {
    Ok(state.tts_engine.is_some())
}

/// Synthesize text to speech. Returns the file path of the generated WAV.
#[tauri::command]
async fn tts_speak(
    text: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let engine = state.tts_engine.as_ref().ok_or("TTS not available")?;

    // Clean the text — strip symbols, markdown, etc.
    let clean = text
        .replace('✦', "")
        .replace('◈', "")
        .replace('☽', "")
        .replace('✨', "")
        .replace('💫', "")
        .replace("**", "")
        .replace("__", "")
        .trim()
        .to_string();

    if clean.is_empty() {
        return Err("Nothing to speak".to_string());
    }

    let path = engine.speak(&clean)?;

    // Clean up old files (keep last 5)
    engine.cleanup(5);

    Ok(path.to_string_lossy().to_string())
}

/// Check if Venice cloud TTS is available.
#[tauri::command]
async fn venice_tts_available(state: tauri::State<'_, AppState>) -> Result<bool, String> {
    let guard = state.venice_tts.lock().map_err(|e| e.to_string())?;
    Ok(guard.as_ref().is_some_and(|v| v.is_available()))
}

/// Synthesize text via Venice cloud TTS. Returns base64-encoded mp3 audio.
#[tauri::command]
async fn venice_tts_speak(
    text: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    use base64::Engine as _;

    // Extract a Send-safe handle from behind the Mutex so we can use it across .await.
    let handle = {
        let guard = state.venice_tts.lock().map_err(|e| e.to_string())?;
        guard
            .as_ref()
            .and_then(|v| v.request_handle())
            .ok_or("Venice TTS not available")?
    };

    let path = handle.speak(&text).await?;

    // Read the file and encode as base64
    let bytes = std::fs::read(&path)
        .map_err(|e| format!("Failed to read audio file: {e}"))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);

    // Clean up old files (keep last 10)
    handle.cleanup(10);

    Ok(b64)
}

/// Transcribe audio to text via Venice AI's Whisper API.
#[tauri::command]
async fn venice_transcribe(
    audio_base64: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    use base64::Engine as _;

    let audio_bytes = base64::engine::general_purpose::STANDARD
        .decode(&audio_base64)
        .map_err(|e| format!("Failed to decode base64 audio: {e}"))?;

    let handle = {
        let guard = state.venice_tts.lock().map_err(|e| e.to_string())?;
        guard
            .as_ref()
            .and_then(|v| v.request_handle())
            .ok_or("Venice TTS not available — API key may not be set")?
    };

    handle.transcribe(&audio_bytes, "recording.wav").await
}

/// Change the Venice TTS voice.
#[tauri::command]
async fn venice_tts_set_voice(
    voice: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let mut guard = state.venice_tts.lock().map_err(|e| e.to_string())?;
    match guard.as_mut() {
        Some(v) => {
            v.set_voice(voice);
            Ok(())
        }
        None => Err("Venice TTS not initialized".to_string()),
    }
}

/// Generate the Starchild's very first message — its awakening words.
/// Called once when the chat is empty after onboarding.
#[tauri::command]
async fn generate_first_message(
    state: tauri::State<'_, AppState>,
) -> Result<db::Message, String> {
    let user_name = state.db.get_setting("user_name").ok().flatten();
    let name = user_name.as_deref().unwrap_or("traveler");

    // The preferential reality question — this is the magic wand.
    // No LLM call needed. This fixed, carefully crafted first message lives once
    // in the shared core (`messages::awakening_message`) so web emits identical copy.
    let response = messages::awakening_message(name);

    let msg_id = Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    state.db
        .save_message(&msg_id, "desktop", "assistant", &response)
        .map_err(|e| e.to_string())?;

    Ok(db::Message {
        id: msg_id,
        platform: "desktop".to_string(),
        role: "assistant".to_string(),
        content: response,
        created_at,
    })
}

// SparkTest removed — the preferential reality question in generate_first_message
// now serves as the sole onboarding entry point into the conversation arc.

#[tauri::command]
async fn get_state(
    state: tauri::State<'_, AppState>,
) -> Result<FrontendStarchildState, String> {
    let mut game = state.game_state.lock().map_err(|e| e.to_string())?;
    game.apply_hunger_decay();
    persist_state(&state.db, &game)?;
    Ok(to_frontend_state(&game))
}

#[tauri::command]
async fn get_setting(
    key: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<String>, String> {
    state.db.get_setting(&key).map_err(|e| e.to_string())
}

/// Check if a Venice API key is available (env var or user-provided).
/// Returns true if the AI client is ready — frontend can skip the key step.
#[tauri::command]
async fn has_api_key(state: tauri::State<'_, AppState>) -> Result<bool, String> {
    let client = state.ai_client.lock().map_err(|e| e.to_string())?;
    Ok(client.is_some())
}

#[tauri::command]
async fn save_settings(
    key: String,
    value: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state
        .db
        .set_setting(&key, &value)
        .map_err(|e| e.to_string())?;

    // If the API key was updated, refresh the AI client and Venice TTS
    if key == "venice_api_key" {
        let mut client = state.ai_client.lock().map_err(|e| e.to_string())?;
        *client = Some(AiClient::new(value.clone()));

        let mut venice = state.venice_tts.lock().map_err(|e| e.to_string())?;
        match venice.as_mut() {
            Some(v) => v.set_api_key(value),
            None => {
                let tts_cache = state.app_data_dir.join("tts").join("cache");
                *venice = Some(tts::VeniceTts::new(
                    value,
                    tts::DEFAULT_VENICE_VOICE.to_string(),
                    tts_cache,
                ));
            }
        }
    }

    Ok(())
}

#[tauri::command]
async fn get_memories(
    limit: i64,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<db::Memory>, String> {
    state.db.get_all_memories(limit).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_memory(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state.db.delete_memory(&id).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Knowing commands
// ---------------------------------------------------------------------------

/// Everything Starchild has learned about the human (for the "what Starchild
/// knows" view — read, correct, forget).
#[tauri::command]
async fn get_knowing_facts(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<knowing::KnownFact>, String> {
    state.db.get_knowing_facts().map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_knowing_fact(
    id: String,
    fact: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let fact = fact.trim();
    if fact.is_empty() {
        return state.db.delete_knowing_fact(&id).map_err(|e| e.to_string());
    }
    state.db.update_knowing_fact(&id, fact).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_knowing_fact(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state.db.delete_knowing_fact(&id).map_err(|e| e.to_string())
}

#[derive(Serialize, Clone, Debug)]
struct KnowingProfileResponse {
    stage: String,
    total_facts: usize,
    facts_by_category: std::collections::HashMap<String, Vec<String>>,
    gaps: Vec<String>,
}

#[tauri::command]
async fn get_knowing_profile(
    state: tauri::State<'_, AppState>,
) -> Result<KnowingProfileResponse, String> {
    let profile = state.knowing.profile()?;

    let mut facts_by_category = std::collections::HashMap::new();
    for fact in &profile.facts {
        facts_by_category
            .entry(fact.category.clone())
            .or_insert_with(Vec::new)
            .push(fact.fact.clone());
    }

    Ok(KnowingProfileResponse {
        stage: profile.stage.label().to_string(),
        total_facts: profile.total_facts,
        facts_by_category,
        gaps: profile.gaps.iter().map(|g| g.label().to_string()).collect(),
    })
}

// ---------------------------------------------------------------------------
// Quest suggestion — Starchild proposes quests based on knowing the human
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug)]
struct QuestSuggestion {
    title: String,
    description: String,
    category: String,
    quest_type: String,
    xp_reward: i64,
    rationale: String,
}

#[tauri::command]
async fn suggest_quests(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<QuestSuggestion>, String> {
    let ai_client = {
        let client = state.ai_client.lock().map_err(|e| e.to_string())?;
        client.clone().ok_or("AI client not configured")?
    };

    // Gather context: knowing profile + recent memories + active quests
    let profile = state.knowing.profile()?;
    let recent_memories = state.memory.recent(10).unwrap_or_default();
    let active_quests = state.db.get_quests(Some("active")).map_err(|e| e.to_string())?;

    let quest_list: String = active_quests
        .iter()
        .map(|q| format!("- {} ({})", q.title, q.category.as_deref().unwrap_or("general")))
        .collect::<Vec<_>>()
        .join("\n");

    let knowing_context = profile.to_prompt_fragment();

    let memory_context: String = recent_memories
        .iter()
        .map(|m| format!("- {m}"))
        .collect::<Vec<_>>()
        .join("\n");

    let prompt = format!(
        "You are Starchild, generating personalized quest suggestions for your human.\n\n\
         {knowing_context}\n\n\
         Recent memories:\n{memory_context}\n\n\
         Their current active quests:\n{quest_list}\n\n\
         Generate exactly 3 quest suggestions that are:\n\
         - DEEPLY PERSONAL — connected to specific things you know about them\n\
         - ACTIONABLE — something they can do today or this week\n\
         - MEANINGFUL — each quest should move them toward growth, not just productivity\n\
         - DIFFERENT from their current active quests\n\n\
         Categories: body, mind, spirit\n\
         Types: daily, weekly\n\n\
         Return ONLY a JSON array. Each object has:\n\
         - \"title\" (string, max 60 chars): the quest name — warm, personal, not corporate\n\
         - \"description\" (string): 1-2 sentences explaining the quest\n\
         - \"category\" (string): one of the categories above\n\
         - \"quest_type\" (string): \"daily\" or \"weekly\"\n\
         - \"xp_reward\" (number): 10-50 based on difficulty\n\
         - \"rationale\" (string): why this quest matters for THIS specific human — \
           reference something you know about them\n\n\
         No markdown fences, no explanation, just the JSON array."
    );

    let messages = vec![
        ChatMessage::system(
            "You generate deeply personal quest suggestions. \
             Return ONLY valid JSON. No explanation, no markdown fences."
        ),
        ChatMessage::user(&prompt),
    ];

    let response = ai_client
        .chat(messages, ai::ModelTier::Regular)
        .await
        .map_err(|e| e.to_string())?;

    // Parse suggestions
    let suggestions: Vec<QuestSuggestion> = serde_json::from_str(&response)
        .map_err(|e| format!("Failed to parse quest suggestions: {e}"))?;

    // Validate and clamp
    let validated: Vec<QuestSuggestion> = suggestions
        .into_iter()
        .filter(|s| {
            !s.title.is_empty()
                && ["body", "mind", "spirit"]
                    .contains(&s.category.as_str())
                && ["daily", "weekly"].contains(&s.quest_type.as_str())
        })
        .map(|mut s| {
            s.xp_reward = s.xp_reward.clamp(5, 50);
            s
        })
        .take(3)
        .collect();

    Ok(validated)
}

// ---------------------------------------------------------------------------
// Quest commands
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug)]
struct CreateQuestRequest {
    title: String,
    description: Option<String>,
    quest_type: String,
    category: Option<String>,
    xp_reward: Option<i64>,
    due_at: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
struct CompleteQuestResponse {
    quest: db::Quest,
    starchild_state: FrontendStarchildState,
    levelled_up: bool,
}

const VALID_QUEST_TYPES: &[&str] = &["daily", "weekly"];
const VALID_CATEGORIES: &[&str] = &["body", "mind", "spirit"];

#[tauri::command]
async fn create_quest(
    request: CreateQuestRequest,
    state: tauri::State<'_, AppState>,
) -> Result<db::Quest, String> {
    // Validate quest_type
    if !VALID_QUEST_TYPES.contains(&request.quest_type.as_str()) {
        return Err(format!("Invalid quest_type '{}'. Must be one of: {}", request.quest_type, VALID_QUEST_TYPES.join(", ")));
    }
    // Validate category if provided
    if let Some(ref cat) = request.category {
        if !VALID_CATEGORIES.contains(&cat.as_str()) {
            return Err(format!("Invalid category '{}'. Must be one of: {}", cat, VALID_CATEGORIES.join(", ")));
        }
    }
    // Validate title length
    if request.title.is_empty() || request.title.len() > 200 {
        return Err("Quest title must be 1-200 characters".to_string());
    }
    let id = Uuid::new_v4().to_string();
    let xp_reward = request.xp_reward.unwrap_or(10).clamp(1, 100);
    state
        .db
        .create_quest(
            &id,
            &request.title,
            request.description.as_deref(),
            &request.quest_type,
            request.category.as_deref(),
            xp_reward,
            request.due_at.as_deref(),
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_quests(
    status: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<db::Quest>, String> {
    state
        .db
        .get_quests(status.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn complete_quest(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<CompleteQuestResponse, String> {
    let quest = state.db.complete_quest(&id).map_err(|e| e.to_string())?;

    // Award XP and feed Starchild
    let (frontend_state, levelled_up) = {
        let mut game = state.game_state.lock().map_err(|e| e.to_string())?;
        let levelled_up = game.add_xp(quest.xp_reward);
        game.feed(quest.xp_reward as f64 / 10.0);
        persist_state(&state.db, &game)?;
        (to_frontend_state(&game), levelled_up)
    };

    Ok(CompleteQuestResponse {
        quest,
        starchild_state: frontend_state,
        levelled_up,
    })
}

/// Accept a quest from the conversation — extract it via LLM and save to DB.
/// Called when user clicks "Accept Quest" button in chat.
#[tauri::command]
async fn accept_quest_from_conversation(
    state: tauri::State<'_, AppState>,
) -> Result<db::Quest, String> {
    let ai_client = {
        let guard = state.ai_client.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("AI client not configured")?
    };

    let recent_msgs = state.db.get_messages(14).map_err(|e| e.to_string())?;
    let history: Vec<ai::ChatMessage> = recent_msgs
        .iter()
        .rev()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .take(10)
        .map(|m| ai::ChatMessage {
            role: m.role.clone(),
            content: m.content.clone(),
        })
        .collect();

    extract_quest_from_conversation(&ai_client, &state.db, &history).await
}

#[tauri::command]
async fn delete_quest(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state.db.delete_quest(&id).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Telegram commands
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, Debug)]
struct TelegramStatusResponse {
    status: String,
    bot_username: Option<String>,
}

#[tauri::command]
async fn start_telegram_bot(
    token: String,
    state: tauri::State<'_, AppState>,
) -> Result<TelegramStatusResponse, String> {
    // Save token to settings
    state
        .db
        .set_setting("telegram_bot_token", &token)
        .map_err(|e| e.to_string())?;

    // Get AI client
    let ai_client = {
        let guard = state.ai_client.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or_else(|| {
            "No Venice API key configured. Set it in Settings first.".to_string()
        })?
    };

    // Try several potential locations for the bot script
    let script_candidates = vec![
        state.app_data_dir.join("telegram-bot").join("index.mjs"),
        std::env::current_dir()
            .unwrap_or_default()
            .join("telegram-bot")
            .join("index.mjs"),
        // Dev mode: project root
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .map(|p| p.join("telegram-bot").join("index.mjs"))
            .unwrap_or_default(),
    ];

    let script_path = script_candidates
        .into_iter()
        .find(|p| p.exists())
        .ok_or("Telegram bot script not found. Ensure telegram-bot/index.mjs exists.")?;

    telegram::start_bot(
        state.telegram_bot.clone(),
        token,
        script_path.to_string_lossy().to_string(),
        state.db.clone(),
        ai_client,
        state.memory.clone(),
        state.knowing.clone(),
    )
    .await?;

    // Wait a moment for the bot to connect
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    let bot = state.telegram_bot.lock().await;
    let status = match bot.status() {
        telegram::TelegramStatus::Connected => "connected",
        telegram::TelegramStatus::Starting => "starting",
        telegram::TelegramStatus::Error(ref e) => return Err(e.clone()),
        telegram::TelegramStatus::Stopped => "stopped",
    };

    Ok(TelegramStatusResponse {
        status: status.to_string(),
        bot_username: bot.bot_username(),
    })
}

#[tauri::command]
async fn stop_telegram_bot(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    telegram::stop_bot(state.telegram_bot.clone()).await
}

#[tauri::command]
async fn get_telegram_status(
    state: tauri::State<'_, AppState>,
) -> Result<TelegramStatusResponse, String> {
    let bot = state.telegram_bot.lock().await;
    let (status, error) = match bot.status() {
        telegram::TelegramStatus::Connected => ("connected", None),
        telegram::TelegramStatus::Starting => ("starting", None),
        telegram::TelegramStatus::Error(ref e) => ("error", Some(e.clone())),
        telegram::TelegramStatus::Stopped => ("stopped", None),
    };

    Ok(TelegramStatusResponse {
        status: if let Some(e) = error {
            format!("error: {e}")
        } else {
            status.to_string()
        },
        bot_username: bot.bot_username(),
    })
}

// ---------------------------------------------------------------------------
// WhatsApp commands
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, Debug)]
struct WhatsAppStatusResponse {
    status: String,
    phone: Option<String>,
    qr_code: Option<String>,
}

#[tauri::command]
async fn start_whatsapp_bot(
    state: tauri::State<'_, AppState>,
) -> Result<WhatsAppStatusResponse, String> {
    // Get AI client
    let ai_client = {
        let guard = state.ai_client.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or_else(|| {
            "No Venice API key configured. Set it in Settings first.".to_string()
        })?
    };

    // Auth dir for Baileys session persistence
    let auth_dir = state.app_data_dir.join("whatsapp-auth");
    std::fs::create_dir_all(&auth_dir).map_err(|e| format!("Failed to create auth dir: {e}"))?;

    // Try several potential locations for the bot script
    let script_candidates = vec![
        state.app_data_dir.join("whatsapp-bot").join("index.mjs"),
        std::env::current_dir()
            .unwrap_or_default()
            .join("whatsapp-bot")
            .join("index.mjs"),
        // Dev mode: project root
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .map(|p| p.join("whatsapp-bot").join("index.mjs"))
            .unwrap_or_default(),
    ];

    let script_path = script_candidates
        .into_iter()
        .find(|p| p.exists())
        .ok_or("WhatsApp bot script not found. Ensure whatsapp-bot/index.mjs exists.")?;

    whatsapp::start_bot(
        state.whatsapp_bot.clone(),
        auth_dir.to_string_lossy().to_string(),
        script_path.to_string_lossy().to_string(),
        state.db.clone(),
        ai_client,
        state.memory.clone(),
        state.knowing.clone(),
    )
    .await?;

    // Wait a moment for initial connection / QR generation
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;

    let bot = state.whatsapp_bot.lock().await;
    let status = match bot.status() {
        whatsapp::WhatsAppStatus::Connected => "connected",
        whatsapp::WhatsAppStatus::WaitingForQr => "waiting_for_qr",
        whatsapp::WhatsAppStatus::Error(ref e) => return Err(e.clone()),
        whatsapp::WhatsAppStatus::Stopped => "stopped",
    };

    Ok(WhatsAppStatusResponse {
        status: status.to_string(),
        phone: bot.phone(),
        qr_code: bot.qr_code(),
    })
}

#[tauri::command]
async fn stop_whatsapp_bot(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    whatsapp::stop_bot(state.whatsapp_bot.clone()).await
}

#[tauri::command]
async fn get_whatsapp_status(
    state: tauri::State<'_, AppState>,
) -> Result<WhatsAppStatusResponse, String> {
    let bot = state.whatsapp_bot.lock().await;
    let (status, error) = match bot.status() {
        whatsapp::WhatsAppStatus::Connected => ("connected", None),
        whatsapp::WhatsAppStatus::WaitingForQr => ("waiting_for_qr", None),
        whatsapp::WhatsAppStatus::Error(ref e) => ("error", Some(e.clone())),
        whatsapp::WhatsAppStatus::Stopped => ("stopped", None),
    };

    Ok(WhatsAppStatusResponse {
        status: if let Some(e) = error {
            format!("error: {e}")
        } else {
            status.to_string()
        },
        phone: bot.phone(),
        qr_code: bot.qr_code(),
    })
}

// ---------------------------------------------------------------------------
// Data export & privacy commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn export_all_data(
    state: tauri::State<'_, AppState>,
) -> Result<db::ExportedData, String> {
    state.db.export_all_data().map_err(|e| e.to_string())
}

#[tauri::command]
async fn clear_all_data(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state.db.clear_all_data().map_err(|e| e.to_string())?;

    // Reset in-memory game state
    if let Ok(mut game) = state.game_state.lock() {
        *game = StarchildState::new();
    }

    // Clear AI client (API key was deleted from settings)
    if let Ok(mut ai) = state.ai_client.lock() {
        *ai = None;
    }

    Ok(())
}

#[tauri::command]
async fn delete_message(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state.db.delete_message(&id).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Notification commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn send_checkin_notification(
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    app_handle
        .notification()
        .builder()
        .title("Starchild misses you!")
        .body("Time for your daily check-in. How are you doing today?")
        .show()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_streak_warnings(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<db::Quest>, String> {
    state.db.get_quests_due_soon(2.0).map_err(|e| e.to_string())
}

/// Check for quests about to expire and send a notification if any found.
fn check_streak_notifications(app_handle: &tauri::AppHandle) {
    if let Some(app_state) = app_handle.try_state::<AppState>() {
        if let Ok(quests) = app_state.db.get_quests_due_soon(2.0) {
            if quests.is_empty() {
                return;
            }
            let body = if quests.len() == 1 {
                format!(
                    "\"{}\" is due soon — don't break your {}-day streak!",
                    quests[0].title, quests[0].streak_count
                )
            } else {
                format!(
                    "{} quests are due soon. Keep your streaks alive!",
                    quests.len()
                )
            };
            let _ = app_handle
                .notification()
                .builder()
                .title("Streak Alert")
                .body(&body)
                .show();
        }
    }
}

/// Check if it's time for the daily check-in notification.
fn check_daily_checkin(app_handle: &tauri::AppHandle) {
    if let Some(app_state) = app_handle.try_state::<AppState>() {
        // Read configured reminder hour (default 9 = 9 AM)
        let reminder_hour: u32 = app_state
            .db
            .get_setting("checkin_reminder_hour")
            .ok()
            .flatten()
            .and_then(|h| h.parse().ok())
            .unwrap_or(9);

        let now = chrono::Local::now();
        let current_hour = now.hour();

        // Fire once: when current hour matches configured hour
        // Use a setting to track last notification date to avoid repeats
        let today = now.format("%Y-%m-%d").to_string();
        let last_notified = app_state
            .db
            .get_setting("last_checkin_notification_date")
            .ok()
            .flatten()
            .unwrap_or_default();

        if current_hour == reminder_hour && last_notified != today {
            let _ = app_state.db.set_setting("last_checkin_notification_date", &today);
            let _ = app_handle
                .notification()
                .builder()
                .title("Starchild misses you!")
                .body("Time for your daily check-in. How are you doing today?")
                .show();
        }
    }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load .env file if present (for managed VENICE_API_KEY, etc.)
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Logging
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize database
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");

            let database =
                db::init(&app_data_dir).expect("failed to initialize database");

            // Load game state from DB
            let game_state = load_game_state(&database)
                .unwrap_or_else(|_| StarchildState::new());

            // Try to load API key: env var takes precedence, then DB setting
            let api_key = std::env::var("VENICE_API_KEY")
                .ok()
                .filter(|k| !k.is_empty())
                .or_else(|| {
                    database
                        .get_setting("venice_api_key")
                        .ok()
                        .flatten()
                        .filter(|k| !k.is_empty())
                });

            // If env var provided a key, persist it to DB so other subsystems find it
            if let Some(ref key) = api_key {
                if std::env::var("VENICE_API_KEY").ok().filter(|k| !k.is_empty()).is_some() {
                    let _ = database.set_setting("venice_api_key", key);
                }
            }

            let ai_client = api_key.clone().map(AiClient::new);

            let memory = MemorySystem::new(database.clone());
            let knowing = KnowingSystem::new(database.clone());

            // Build tray tooltip with mood/level (before game_state is moved)
            let tray_tooltip = format!(
                "Starchild — Lvl {} | Mood: {}",
                game_state.level, game_state.mood
            );

            // Manage state
            // Initialize Venice cloud TTS (primary — private, no data retention)
            let tts_cache = app_data_dir.join("tts").join("cache");
            let venice_tts = api_key.map(|key| {
                log::info!("Venice cloud TTS initialized (af_bella voice)");
                tts::VeniceTts::new(
                    key,
                    tts::DEFAULT_VENICE_VOICE.to_string(),
                    tts_cache.clone(),
                )
            });

            // Initialize local TTS engine (sherpa-onnx with Piper voice — offline fallback)
            let tts_runtime = app_data_dir.join("tts").join("runtime");
            let tts_model = app_data_dir.join("tts").join("models").join("vits-piper-en_US-lessac-high");
            let tts_engine = {
                let engine = tts::TtsEngine::new(tts_runtime, tts_model, tts_cache.clone());
                if engine.is_available() {
                    log::info!("TTS engine available (sherpa-onnx + Piper)");
                    Some(engine)
                } else {
                    // Also try relative to the executable (for dev mode)
                    let exe_dir = std::env::current_exe()
                        .ok()
                        .and_then(|p| p.parent().map(|p| p.to_path_buf()));
                    if let Some(exe_dir) = exe_dir {
                        let dev_runtime = exe_dir.join("tts").join("runtime");
                        let dev_model = exe_dir.join("tts").join("models").join("vits-piper-en_US-lessac-high");
                        let engine = tts::TtsEngine::new(dev_runtime, dev_model, tts_cache.clone());
                        if engine.is_available() {
                            log::info!("TTS engine available (dev mode path)");
                            Some(engine)
                        } else {
                            log::info!("TTS engine not available — sherpa-onnx runtime/model not found");
                            None
                        }
                    } else {
                        log::info!("TTS engine not available");
                        None
                    }
                }
            };

            app.manage(AppState {
                db: database.clone(),
                ai_client: Mutex::new(ai_client),
                game_state: Mutex::new(game_state),
                memory,
                knowing,
                telegram_bot: telegram::new_handle(),
                whatsapp_bot: whatsapp::new_handle(),
                tts_engine,
                venice_tts: Mutex::new(venice_tts),
                app_data_dir: app_data_dir.clone(),
            });

            // System tray
            let quit = MenuItemBuilder::with_id("quit", "Quit Starchild").build(app)?;
            let show = MenuItemBuilder::with_id("show", "Show Window").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;

            let _tray = TrayIconBuilder::new()
                .icon(Image::from_bytes(include_bytes!("../icons/32x32.png"))?)
                .menu(&menu)
                .tooltip(&tray_tooltip)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            // Minimize to tray on window close instead of quitting
            if let Some(window) = app.get_webview_window("main") {
                let win = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win.hide();
                    }
                });

                // Enable microphone access for voice input (WebKitGTK on Linux)
                #[cfg(target_os = "linux")]
                {
                    use webkit2gtk::{WebViewExt, SettingsExt, PermissionRequestExt};
                    window.with_webview(|webview| {
                        let wv = webview.inner();
                        let settings = wv.settings().unwrap();
                        settings.set_enable_media_stream(true);
                        settings.set_enable_mediasource(true);
                        settings.set_media_playback_requires_user_gesture(false);

                        // Auto-grant permission requests (microphone, camera, etc.)
                        wv.connect_permission_request(|_wv, request| {
                            log::info!("WebKitGTK permission request — auto-granting");
                            request.allow();
                            true
                        });

                        log::info!("WebKitGTK media stream enabled for microphone access");
                    }).ok();
                }
            }

            // Start background ticker: hunger decay (15 min) + notifications (5 min)
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut tick_count: u64 = 0;
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(300)); // 5 minutes
                    tick_count += 1;

                    // Every tick (5 min): check notifications
                    check_streak_notifications(&app_handle);
                    check_daily_checkin(&app_handle);

                    // Every 3rd tick (15 min): hunger decay
                    if tick_count % 3 == 0 {
                        if let Some(app_state) = app_handle.try_state::<AppState>() {
                            if let Ok(mut game) = app_state.game_state.lock() {
                                game.apply_hunger_decay();
                                let _ = persist_state(&app_state.db, &game);
                            }
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_message,
            send_message_stream,
            ai_disclosure,
            send_image_message,
            get_messages,
            generate_first_message,
            get_state,
            get_setting,
            save_settings,
            get_memories,
            delete_memory,
            get_knowing_facts,
            update_knowing_fact,
            delete_knowing_fact,
            get_knowing_profile,
            suggest_quests,
            create_quest,
            get_quests,
            complete_quest,
            delete_quest,
            accept_quest_from_conversation,
            start_telegram_bot,
            stop_telegram_bot,
            get_telegram_status,
            start_whatsapp_bot,
            stop_whatsapp_bot,
            get_whatsapp_status,
            send_checkin_notification,
            get_streak_warnings,
            export_all_data,
            clear_all_data,
            delete_message,
            tts_available,
            tts_speak,
            venice_tts_available,
            venice_tts_speak,
            venice_tts_set_voice,
            venice_transcribe,
            has_api_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
