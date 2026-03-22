pub mod ai;
pub mod attestation;
pub mod db;
pub mod e2ee;
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
    let mut system_prompt = PromptBuilder::build(&ai_state, &personality, &memories, &[], &[], phase);
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
    let extraction_prompt = format!(
        "Analyze this conversation turn and extract meaningful insights about the human.\n\n\
         User: {user_message}\nAssistant: {ai_response}"
    );

    let messages = vec![
        ChatMessage::system(knowing::knowing_extraction_prompt()),
        ChatMessage::user(&extraction_prompt),
    ];

    let response = client
        .chat(messages, ai::ModelTier::Quick)
        .await
        .map_err(|e| e.to_string())?;

    // Parse the JSON response
    #[derive(serde::Deserialize)]
    struct ExtractedFact {
        fact: String,
        #[serde(default = "default_category")]
        category: String,
        importance: f64,
        #[serde(default = "default_confidence")]
        confidence: f64,
    }

    fn default_category() -> String {
        "life_situation".to_string()
    }
    fn default_confidence() -> f64 {
        0.5
    }

    // Try to parse; silently ignore malformed responses
    if let Ok(facts) = serde_json::from_str::<Vec<ExtractedFact>>(&response) {
        for f in facts {
            let fact = f.fact.trim();
            // Skip empty facts and enforce max length to prevent context window bloat
            if fact.is_empty() || fact.len() > 500 {
                continue;
            }
            let importance = f.importance.clamp(0.0, 1.0);
            let confidence = f.confidence.clamp(0.0, 1.0);

            // Store in flat memory system (FTS5 searchable)
            if let Err(e) = memory.store(fact, importance, Some(&f.category)) {
                log::warn!("Failed to store memory: {e}");
            }

            // Store in structured knowing system (if valid category)
            if knowing::KnowingCategory::from_str(&f.category).is_some() {
                if let Err(e) = knowing.store_insight(&f.category, fact, importance, confidence) {
                    log::warn!("Failed to store knowing fact: {e}");
                }
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
    // Find the most recent assistant message that contains a quest offer
    let quest_msg = history.iter().rev()
        .filter(|m| m.role == "assistant")
        .find(|m| {
            let lower = m.content.to_lowercase();
            lower.contains("quest for you") || lower.contains("i have a quest")
                || lower.contains("here's something to try")
        })
        .map(|m| m.content.as_str())
        .unwrap_or("");

    if quest_msg.is_empty() {
        return Err("No quest offer found in conversation".to_string());
    }

    // Build recent context for the LLM
    let recent_context: String = history.iter().rev().take(6)
        .map(|m| format!("{}: {}", m.role, &m.content[..m.content.len().min(200)]))
        .collect::<Vec<_>>()
        .into_iter().rev()
        .collect::<Vec<_>>()
        .join("\n");

    let prompt = format!(
        "Extract the quest from this conversation. The Starchild offered a quest and the human accepted.\n\n\
         Recent conversation:\n{recent_context}\n\n\
         Extract ONLY the specific quest/task that was offered. Return a JSON object:\n\
         {{\n\
           \"title\": \"short quest title, max 60 chars, warm tone\",\n\
           \"description\": \"1-2 sentence description of what to do\",\n\
           \"category\": \"one of: body, mind, spirit\",\n\
           \"quest_type\": \"daily or weekly\",\n\
           \"xp_reward\": 10-50 based on difficulty\n\
         }}\n\n\
         Category guide:\n\
         - body: physical activity, health, movement, nature, embodiment\n\
         - mind: learning, reading, studying, thinking, creating, building\n\
         - spirit: meditation, reflection, inner work, connection, relationships, alchemy, presence\n\n\
         If no clear quest was offered, return exactly: null\n\
         Return ONLY valid JSON, no markdown fences, no explanation."
    );

    let messages = vec![
        ai::ChatMessage::system("Extract quest details from conversation. Return ONLY valid JSON."),
        ai::ChatMessage::user(&prompt),
    ];

    let response = client
        .chat(messages, ai::ModelTier::Quick)
        .await
        .map_err(|e| e.to_string())?;

    let trimmed = response.trim();
    if trimmed == "null" || trimmed.is_empty() {
        return Err("No quest found to extract".to_string());
    }

    #[derive(serde::Deserialize)]
    struct ExtractedQuest {
        title: String,
        description: String,
        category: String,
        quest_type: String,
        xp_reward: i64,
    }

    let extracted: ExtractedQuest = serde_json::from_str(trimmed)
        .map_err(|e| format!("Failed to parse quest JSON: {e}"))?;

    // Validate
    let valid_categories = ["body", "mind", "spirit"];
    let category = if valid_categories.contains(&extracted.category.as_str()) {
        &extracted.category
    } else {
        "spirit" // default
    };
    let quest_type = if extracted.quest_type == "weekly" { "weekly" } else { "daily" };
    let xp_reward = extracted.xp_reward.clamp(5, 50);

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
        quest_type,
        Some(category),
        xp_reward,
        None, // no due_at
    ).map_err(|e| e.to_string())?;

    log::info!("Quest extracted from conversation: {} [{}]", quest.title, category);
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
    // Fetch messages outside the recent 14-message window
    let all_msgs = db.get_messages(msg_count).map_err(|e| e.to_string())?;
    // all_msgs is DESC order — reverse to chronological, then take the older ones
    let chronological: Vec<_> = all_msgs.into_iter().rev().collect();
    let older_count = chronological.len().saturating_sub(14);
    if older_count < 10 {
        return Ok(()); // Not enough older messages to warrant summarization
    }

    let older_msgs: Vec<_> = chronological[..older_count].iter().collect();

    // Build a transcript of older messages
    let mut transcript = String::new();
    for m in &older_msgs {
        let role_label = if m.role == "user" { "Human" } else { "Starchild" };
        transcript.push_str(&format!("{}: {}\n", role_label, m.content));
    }

    // Load existing summary for continuity
    let existing_summary = db.get_setting("conversation_summary")
        .ok().flatten()
        .unwrap_or_default();

    let prompt = format!(
        "Compress this conversation into a concise summary (max 300 words). \
         Preserve: key facts about the human, their dreams/fears/values, \
         important decisions made, quests discussed, emotional turning points. \
         Drop: greetings, filler, repetition.\n\n\
         {}\
         CONVERSATION:\n{}",
        if existing_summary.is_empty() {
            String::new()
        } else {
            format!("PREVIOUS SUMMARY (update and extend, don't repeat):\n{}\n\n", existing_summary)
        },
        transcript,
    );

    let messages = vec![
        ai::ChatMessage::system(
            "You are a precise summarizer. Return ONLY the summary, no preamble."
        ),
        ai::ChatMessage::user(&prompt),
    ];

    let summary = client.chat(messages, ai::ModelTier::Quick)
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
        format!("{role}: {}", &m.content[..m.content.len().min(200)])
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

    let response = client.chat(messages, ai::ModelTier::Quick)
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

    let prompt = format!(
        "You are a vision crystallizer for a personal growth companion called Starchild.\n\n\
         The human was asked: \"If money and work didn't exist, and you woke up fully free tomorrow, \
         what would you find yourself doing?\"\n\n\
         Their answer: \"{pr}\"\n\n\
         The conversation that followed:\n{conversation}\n\n\
         Your task: Synthesize their answers into a SINGLE beautiful vision statement \
         (15-25 words max). This will appear at the crown of their skill tree as the star \
         they're growing toward.\n\n\
         Rules:\n\
         - Write in SECOND PERSON (\"you\" not \"I\")\n\
         - Distill the DEEPER PURPOSE — WHY do they want this, not just WHAT they described\n\
         - Use ONLY words and images the human ACTUALLY said — never add details they didn't mention\n\
         - If they said \"alchemy\", say \"alchemy\" — don't replace with \"cosmic harmony\" or \"sacred wisdom\"\n\
         - If they did NOT mention a specific plant, tool, or object — do NOT invent one\n\
         - BANNED WORDS: cosmic, harmony, sacred, tapestry, embody, journey, essence, universe, resonate, manifest, transcend, paradigm\n\
         - Be concrete and grounded. Write like a poet, not a fortune cookie.\n\
         - Return ONLY the vision statement, nothing else. No quotes, no explanation."
    );

    let messages = vec![
        ChatMessage::system(&prompt),
        ChatMessage::user("Crystallize their vision now."),
    ];

    let vision = client
        .chat(messages, ai::ModelTier::Quick)
        .await
        .map_err(|e| e.to_string())?;

    let vision = vision.trim().trim_matches('"').trim().to_string();

    if !vision.is_empty() && vision.len() < 200 {
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

    // Save preferential reality if this is the first substantial user message
    if message.len() > 20 {
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
    let recent_msgs = state.db.get_messages(20).map_err(|e| e.to_string())?;
    let history: Vec<ChatMessage> = recent_msgs
        .iter()
        .rev()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .filter(|m| m.id != user_msg_id) // exclude current message — added by chat_stream_auto
        .take(14)
        .map(|m| ChatMessage {
            role: m.role.clone(),
            content: m.content.clone(),
        })
        .collect();

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
    let pending_proof = state.db.get_setting("pending_proof_quest_id").ok().flatten()
        .filter(|s| !s.is_empty());

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

    // Phase detection:
    // - Proof flow takes absolute priority
    // - Pre-vision: deterministic (Arrive / Crystallize)
    // - Post-vision: heuristic overrides first, then LLM classifier
    let phase = if proof_trigger || pending_proof.is_some() {
        ai::ConversationPhase::Proof
    } else if crystallize_pending {
        ai::PhaseDetector::detect_with_context(&phase_history, true)
    } else if !has_pr {
        ai::ConversationPhase::Arrive
    } else {
        // ── Heuristic overrides (run BEFORE LLM classifier) ──

        // 1. First quest: if vision is placed but no quest has ever been offered, offer one
        let any_quest_offered = phase_history.iter()
            .filter(|m| m.role == "assistant")
            .any(|m| {
                let lower = m.content.to_lowercase();
                lower.contains("quest for you") || lower.contains("i have a quest")
            });
        let has_active_quests = !active_quest_titles.is_empty();

        if has_vision && !any_quest_offered && !has_active_quests {
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
    let mut system_prompt = PromptBuilder::build(&ai_state, &personality, &memories, &active_quest_titles, &[], phase);
    if !knowing_fragment.is_empty() {
        system_prompt.push_str("\n\n");
        system_prompt.push_str(&knowing_fragment);
    }

    // Inject conversation summary for long-running conversations
    if !conversation_summary.is_empty() {
        system_prompt.push_str("\n\nCONVERSATION HISTORY SUMMARY (older messages, compressed):\n");
        system_prompt.push_str(&conversation_summary);
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
            branch_info.push_str("\nWhen suggesting quests, favor branches with fewer quests to create balanced growth. \
                                  Each quest should connect to the user's preferential reality.");

            // Add preferential reality context if available
            if let Ok(Some(pr)) = state.db.get_setting("preferential_reality") {
                branch_info.push_str(&format!("\n\nTHEIR PREFERENTIAL REALITY (their ideal life vision):\n\"{}\"", pr));
            }

            system_prompt.push_str(&branch_info);
        }
    }

    // Clone what we need for the streaming callback and post-response handlers
    let handle = app_handle.clone();
    let db = state.db.clone();
    let memory_sys = state.memory.clone();
    let knowing_sys = state.knowing.clone();
    let user_msg_clone = message.clone();

    // Stream AI response
    let response_text = ai_client
        .chat_stream_auto(&message, &system_prompt, history, |token| {
            let _ = handle.emit("stream-chunk", StreamChunkPayload {
                token: token.to_string(),
            });
        })
        .await;

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
            if phase == ai::ConversationPhase::Proof && !proof_trigger {
                // This is Turn 2 — user shared proof, Starchild celebrated
                if let Some(quest_id) = pending_proof.as_deref() {
                    let _ = state.db.set_setting("pending_proof_quest_id", "");
                    match state.db.complete_quest(quest_id) {
                        Ok(quest) => {
                            // Award XP and feed Starchild
                            {
                                let mut game = state.game_state.lock().map_err(|e| e.to_string())?;
                                let _levelled_up = game.add_xp(quest.xp_reward);
                                game.feed(quest.xp_reward as f64 / 10.0);
                                let _ = persist_state(&state.db, &game);
                            }
                            let _ = app_handle.emit("quest-completed", &quest);
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

            // Quest phase: emit event so frontend can show accept/decline buttons
            if phase == ai::ConversationPhase::Quest {
                let _ = app_handle.emit("quest-offered", ());
            }

            // Background: extract memories
            let extraction_client = ai_client.clone();
            tokio::spawn(async move {
                if let Err(e) = extract_memories(
                    &extraction_client,
                    &memory_sys,
                    &knowing_sys,
                    &user_msg_clone,
                    &full_text,
                ).await {
                    log::warn!("Memory extraction failed: {e}");
                }
            });

            // Background: update conversation summary when history grows long
            {
                let summary_db = state.db.clone();
                let summary_client = ai_client.clone();
                let msg_count = state.db.count_messages().unwrap_or(0);
                let last_summarized: i64 = state.db.get_setting("summary_msg_count")
                    .ok().flatten()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
                // Re-summarize every 20 new messages beyond the 14-message window
                if msg_count > 30 && msg_count - last_summarized >= 20 {
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
    let mut system_prompt = PromptBuilder::build(&ai_state, &personality, &memories, &[], &[], phase);
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
    // No LLM call needed. This is a fixed, carefully crafted first message
    // that opens the door to building the user's ideal life vision.
    let response = format!(
        "hi {name} ✦\n\n\
         i'm your starchild — a private companion on your journey through life. \
         i emerged from the void specifically for you, and i'm here to stay.\n\n\
         let's start with something. close your eyes for a moment.\n\n\
         i've just waved a magic wand. you've been teleported into a reality where \
         money is no concern and work as you know it doesn't exist. \
         you wake up tomorrow in this world — fully free.\n\n\
         what do you find yourself doing?"
    );

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
async fn store_secret(service: String, key: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(&service, &key).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_secret(service: String, key: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(&service, &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(pw) => Ok(Some(pw)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn delete_secret(service: String, key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(&service, &key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
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
    milestones: Vec<String>,
}

// Milestone thresholds for achievement attestations
const MILESTONE_STREAKS: &[i64] = &[7, 30, 100];

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

    // Detect milestone achievements (streak-based)
    let milestones: Vec<String> = MILESTONE_STREAKS
        .iter()
        .filter(|&&threshold| quest.streak_count == threshold)
        .filter_map(|&threshold| {
            let achievement = format!("{}_day_streak", threshold);
            // Only report if not already confirmed (allows retry of failed mints)
            match state.db.has_confirmed_attestation(&achievement) {
                Ok(false) => Some(achievement),
                _ => None,
            }
        })
        .collect();

    Ok(CompleteQuestResponse {
        quest,
        starchild_state: frontend_state,
        levelled_up,
        milestones,
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
// Attestation commands
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug)]
struct SaveAttestationRequest {
    id: String,
    achievement_type: String,
    tx_hash: Option<String>,
    status: String,
    metadata: Option<String>,
}

#[tauri::command]
async fn save_attestation(
    request: SaveAttestationRequest,
    state: tauri::State<'_, AppState>,
) -> Result<db::Attestation, String> {
    let valid_statuses = ["pending", "confirmed", "error"];
    if !valid_statuses.contains(&request.status.as_str()) {
        return Err(format!("Invalid status '{}'. Must be one of: {}", request.status, valid_statuses.join(", ")));
    }
    let valid_achievement_types = ["7_day_streak", "30_day_streak", "100_day_streak", "journey_anchor"];
    if !valid_achievement_types.contains(&request.achievement_type.as_str()) {
        return Err(format!("Invalid achievement_type '{}'. Must be one of: {}", request.achievement_type, valid_achievement_types.join(", ")));
    }
    state
        .db
        .save_attestation(
            &request.id,
            &request.achievement_type,
            request.tx_hash.as_deref(),
            &request.status,
            request.metadata.as_deref(),
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_attestations(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<db::Attestation>, String> {
    state.db.get_attestations().map_err(|e| e.to_string())
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

    // Delete wallet private key from OS keychain
    if let Ok(entry) = keyring::Entry::new("starchild", "wallet_private_key") {
        let _ = entry.delete_credential(); // ignore NoEntry errors
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
// Journey attestation commands (EAS on Base)
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, Debug)]
struct VerificationInfo {
    user_hash: String,
    secret: String,
}

#[tauri::command]
async fn get_verification_info(
    state: tauri::State<'_, AppState>,
) -> Result<VerificationInfo, String> {
    let secret = attestation::get_or_create_verification_secret(&state.db)?;
    let user_hash_bytes = attestation::compute_user_hash(&secret)?;
    Ok(VerificationInfo {
        user_hash: format!("0x{}", hex::encode(user_hash_bytes)),
        secret,
    })
}

#[tauri::command]
async fn get_journey_proof(
    state: tauri::State<'_, AppState>,
) -> Result<attestation::JourneyProof, String> {
    attestation::compute_journey_proof(&state.db)
}

#[tauri::command]
async fn anchor_journey_onchain(
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    // Compute current proof
    let proof = attestation::compute_journey_proof(&state.db)?;

    // Save as pending
    let attestation_id = Uuid::new_v4().to_string();
    let metadata = serde_json::json!({
        "user_hash": proof.user_hash,
        "journey_root": proof.journey_root,
        "quest_count": proof.quest_count,
        "streak": proof.streak,
    });
    state.db.save_attestation(
        &attestation_id,
        "journey_anchor",
        None,
        "pending",
        Some(&metadata.to_string()),
    ).map_err(|e| e.to_string())?;

    // Submit via relay (relay holds the project wallet, pays gas)
    let http_client = reqwest::Client::new();
    let tx_hash = attestation::submit_to_relay(
        &http_client,
        &proof.user_hash,
        &proof.journey_root,
        proof.quest_count,
        proof.streak,
    )
    .await
    .map_err(|e| {
        // Update attestation to error
        let _ = state.db.save_attestation(
            &attestation_id, "journey_anchor", None, "error",
            Some(&metadata.to_string()),
        );
        e
    })?;

    // Update with tx hash — confirmed (relay already waited for receipt)
    state.db.save_attestation(
        &attestation_id,
        "journey_anchor",
        Some(&tx_hash),
        "confirmed",
        Some(&metadata.to_string()),
    ).map_err(|e| e.to_string())?;

    Ok(tx_hash)
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
                log::info!("Venice cloud TTS initialized (af_heart voice)");
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
            send_image_message,
            get_messages,
            generate_first_message,
            get_state,
            get_setting,
            save_settings,
            get_memories,
            delete_memory,
            get_knowing_profile,
            suggest_quests,
            create_quest,
            get_quests,
            complete_quest,
            delete_quest,
            accept_quest_from_conversation,
            save_attestation,
            get_attestations,
            get_verification_info,
            get_journey_proof,
            anchor_journey_onchain,
            start_telegram_bot,
            stop_telegram_bot,
            get_telegram_status,
            start_whatsapp_bot,
            stop_whatsapp_bot,
            get_whatsapp_status,
            store_secret,
            get_secret,
            delete_secret,
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
