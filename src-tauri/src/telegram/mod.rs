//! Telegram Bot Connector
//!
//! Manages a Node.js sidecar process running grammy that bridges
//! Telegram messages to the Starchild AI pipeline.
//!
//! Communication protocol (JSON lines over stdin/stdout):
//!   Bot → Host: {"type":"incoming","chat_id":123,"username":"john","text":"hello"}
//!   Bot → Host: {"type":"status","connected":true,"bot_username":"mybot"}
//!   Bot → Host: {"type":"error","error":"description"}
//!   Host → Bot: {"type":"reply","chat_id":123,"text":"response text"}

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::ai::{AiClient, ChatMessage, PersonalityParams, PromptBuilder};
use crate::db::Database;
use crate::knowing::KnowingSystem;
use crate::memory::MemorySystem;
use crate::{extract_memories, load_game_state, persist_state};

// ---------------------------------------------------------------------------
// Protocol types
// ---------------------------------------------------------------------------

#[derive(Deserialize, Debug)]
#[serde(tag = "type")]
enum BotMessage {
    #[serde(rename = "incoming")]
    Incoming {
        chat_id: i64,
        username: String,
        text: String,
    },
    #[serde(rename = "incoming_image")]
    IncomingImage {
        chat_id: i64,
        username: String,
        #[serde(default)]
        caption: String,
        image_base64: String,
        mime_type: String,
    },
    #[serde(rename = "status")]
    Status {
        connected: bool,
        #[serde(default)]
        bot_username: Option<String>,
    },
    #[serde(rename = "error")]
    Error { error: String },
}

#[derive(Serialize)]
struct HostReply {
    #[serde(rename = "type")]
    msg_type: &'static str,
    chat_id: i64,
    text: String,
}

// ---------------------------------------------------------------------------
// Bot manager
// ---------------------------------------------------------------------------

pub struct TelegramBot {
    child: Option<Child>,
    stdin_tx: Option<tokio::sync::mpsc::Sender<String>>,
    status: TelegramStatus,
    bot_username: Option<String>,
}

#[derive(Clone, Serialize, Debug, PartialEq)]
pub enum TelegramStatus {
    Stopped,
    Starting,
    Connected,
    Error(String),
}

impl TelegramBot {
    pub fn new() -> Self {
        Self {
            child: None,
            stdin_tx: None,
            status: TelegramStatus::Stopped,
            bot_username: None,
        }
    }

    pub fn status(&self) -> TelegramStatus {
        self.status.clone()
    }

    pub fn bot_username(&self) -> Option<String> {
        self.bot_username.clone()
    }
}

pub type TelegramBotHandle = Arc<Mutex<TelegramBot>>;

pub fn new_handle() -> TelegramBotHandle {
    Arc::new(Mutex::new(TelegramBot::new()))
}

// ---------------------------------------------------------------------------
// Start / stop
// ---------------------------------------------------------------------------

pub async fn start_bot(
    handle: TelegramBotHandle,
    token: String,
    bot_script_path: String,
    db: Database,
    ai_client: AiClient,
    memory: MemorySystem,
    knowing: KnowingSystem,
) -> Result<(), String> {
    let mut bot = handle.lock().await;

    // Already running?
    if bot.child.is_some() {
        return Err("Telegram bot is already running".into());
    }

    bot.status = TelegramStatus::Starting;

    // Spawn the Node.js process
    let mut child = Command::new("node")
        .arg(&bot_script_path)
        .env("TELEGRAM_BOT_TOKEN", &token)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to spawn telegram bot: {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or("Failed to capture bot stdout")?;
    let stdin = child.stdin.take().ok_or("Failed to capture bot stdin")?;

    // Channel for writing to the process stdin
    let (stdin_tx, mut stdin_rx) = tokio::sync::mpsc::channel::<String>(64);

    // Stdin writer task
    tokio::spawn(async move {
        let mut stdin = stdin;
        while let Some(line) = stdin_rx.recv().await {
            if stdin.write_all(line.as_bytes()).await.is_err() {
                break;
            }
            if stdin.flush().await.is_err() {
                break;
            }
        }
    });

    bot.child = Some(child);
    bot.stdin_tx = Some(stdin_tx.clone());

    // Stdout reader task — process incoming messages
    let reader_handle = handle.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            match serde_json::from_str::<BotMessage>(&line) {
                Ok(BotMessage::Incoming {
                    chat_id,
                    username,
                    text,
                }) => {
                    let reply = handle_telegram_message(
                        &db,
                        &ai_client,
                        &memory,
                        &knowing,
                        chat_id,
                        &username,
                        &text,
                    )
                    .await;

                    let reply_json = serde_json::to_string(&HostReply {
                        msg_type: "reply",
                        chat_id,
                        text: reply,
                    })
                    .unwrap_or_default()
                        + "\n";

                    let _ = stdin_tx.send(reply_json).await;
                }
                Ok(BotMessage::IncomingImage {
                    chat_id,
                    username,
                    caption,
                    image_base64,
                    mime_type,
                }) => {
                    let reply = handle_telegram_image(
                        &db,
                        &ai_client,
                        &memory,
                        &knowing,
                        chat_id,
                        &username,
                        &caption,
                        &image_base64,
                        &mime_type,
                    )
                    .await;

                    let reply_json = serde_json::to_string(&HostReply {
                        msg_type: "reply",
                        chat_id,
                        text: reply,
                    })
                    .unwrap_or_default()
                        + "\n";

                    let _ = stdin_tx.send(reply_json).await;
                }
                Ok(BotMessage::Status {
                    connected,
                    bot_username,
                }) => {
                    let mut bot = reader_handle.lock().await;
                    if connected {
                        bot.status = TelegramStatus::Connected;
                        bot.bot_username = bot_username;
                    } else {
                        bot.status = TelegramStatus::Stopped;
                    }
                }
                Ok(BotMessage::Error { error }) => {
                    log::error!("Telegram bot error: {error}");
                    let mut bot = reader_handle.lock().await;
                    bot.status = TelegramStatus::Error(error);
                }
                Err(e) => {
                    log::warn!("Failed to parse bot message: {e} — line: {line}");
                }
            }
        }

        // Process ended — clean up
        let mut bot = reader_handle.lock().await;
        if bot.status == TelegramStatus::Connected || bot.status == TelegramStatus::Starting {
            bot.status = TelegramStatus::Stopped;
        }
        bot.child = None;
        bot.stdin_tx = None;
    });

    Ok(())
}

pub async fn stop_bot(handle: TelegramBotHandle) -> Result<(), String> {
    let mut bot = handle.lock().await;
    if let Some(mut child) = bot.child.take() {
        let _ = child.kill().await;
    }
    bot.stdin_tx = None;
    bot.status = TelegramStatus::Stopped;
    bot.bot_username = None;
    Ok(())
}

// ---------------------------------------------------------------------------
// Message handling — routes through the same AI pipeline as desktop chat
// ---------------------------------------------------------------------------

async fn handle_telegram_message(
    db: &Database,
    ai_client: &AiClient,
    memory: &MemorySystem,
    knowing: &KnowingSystem,
    _chat_id: i64,
    _username: &str,
    text: &str,
) -> String {
    match process_message(db, ai_client, memory, knowing, text).await {
        Ok(reply) => reply,
        Err(e) => {
            log::error!("AI processing failed for telegram message: {e}");
            "Sorry, I had trouble thinking about that. Try again in a moment.".into()
        }
    }
}

async fn process_message(
    db: &Database,
    ai_client: &AiClient,
    memory: &MemorySystem,
    knowing: &KnowingSystem,
    text: &str,
) -> Result<String, String> {
    // Save user message (platform = "telegram")
    let user_msg_id = uuid::Uuid::new_v4().to_string();
    db.save_message(&user_msg_id, "telegram", "user", text)
        .map_err(|e| e.to_string())?;

    // Load and decay game state
    let current_state = {
        let mut game = load_game_state(db)?;
        game.apply_hunger_decay();
        game.bond = (game.bond + 0.05).clamp(0.0, 100.0);
        persist_state(db, &game)?;
        game
    };

    // Get personality
    let personality_row = db.get_personality().map_err(|e| e.to_string())?;
    let personality = PersonalityParams {
        warmth: (personality_row.warmth * 100.0) as u32,
        intensity: (personality_row.intensity * 100.0) as u32,
        humor: (personality_row.humor * 100.0) as u32,
        mysticism: (personality_row.mysticism * 100.0) as u32,
        directness: (personality_row.directness * 100.0) as u32,
    };

    let ai_state = crate::ai::StarchildState {
        hunger: current_state.hunger as u32,
        mood: current_state.mood.to_string(),
        energy: current_state.energy as u32,
        bond: current_state.bond as u32,
        level: current_state.level as u32,
    };

    // Get recent messages (from all platforms) for context
    // Exclude the message we just saved — chat_auto appends it itself
    let recent_msgs = db.get_messages(20).map_err(|e| e.to_string())?;
    let history: Vec<ChatMessage> = recent_msgs
        .iter()
        .rev()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .filter(|m| m.id != user_msg_id)
        .take(14)
        .map(|m| ChatMessage {
            role: m.role.clone(),
            content: m.content.clone(),
        })
        .collect();

    // Recall relevant memories and knowing profile
    let memories: Vec<String> = memory.recall(text, 5).unwrap_or_default();
    let knowing_fragment = knowing.profile().map(|p| p.to_prompt_fragment()).unwrap_or_default();

    // Detect conversation phase and build system prompt
    let phase = crate::ai::PhaseDetector::detect(&history);
    let mut system_prompt = PromptBuilder::build(&ai_state, &personality, &memories, &[], &[], phase);
    if !knowing_fragment.is_empty() {
        system_prompt.push_str("\n\n");
        system_prompt.push_str(&knowing_fragment);
    }

    // Call AI
    let response_text = ai_client
        .chat_auto(text, &system_prompt, history)
        .await
        .map_err(|e| e.to_string())?;

    // Save assistant message
    let assistant_msg_id = uuid::Uuid::new_v4().to_string();
    db.save_message(&assistant_msg_id, "telegram", "assistant", &response_text)
        .map_err(|e| e.to_string())?;

    // Background: extract memories
    let extraction_client = ai_client.clone();
    let extraction_memory = memory.clone();
    let extraction_knowing = knowing.clone();
    let user_msg = text.to_string();
    let ai_reply = response_text.clone();
    tokio::spawn(async move {
        let _ =
            extract_memories(&extraction_client, &extraction_memory, &extraction_knowing, &user_msg, &ai_reply).await;
    });

    Ok(response_text)
}

async fn handle_telegram_image(
    db: &Database,
    ai_client: &AiClient,
    memory: &MemorySystem,
    knowing: &KnowingSystem,
    _chat_id: i64,
    _username: &str,
    caption: &str,
    image_base64: &str,
    mime_type: &str,
) -> String {
    match process_image_message(db, ai_client, memory, knowing, caption, image_base64, mime_type).await {
        Ok(reply) => reply,
        Err(e) => {
            log::error!("AI image processing failed for telegram: {e}");
            "i couldn't see that image clearly. could you try sending it again? ✦".to_string()
        }
    }
}

async fn process_image_message(
    db: &Database,
    ai_client: &AiClient,
    memory: &MemorySystem,
    knowing: &KnowingSystem,
    caption: &str,
    image_base64: &str,
    mime_type: &str,
) -> Result<String, String> {
    // Save user message
    let user_msg_id = uuid::Uuid::new_v4().to_string();
    let user_text = if caption.is_empty() { "[sent an image]" } else { caption };
    db.save_message(&user_msg_id, "telegram", "user", user_text)
        .map_err(|e| e.to_string())?;

    // Step 1: Vision model describes the image
    let description = ai_client
        .describe_image(image_base64, mime_type, None)
        .await
        .map_err(|e| format!("Vision failed: {e}"))?;

    // Step 2: Feed description into regular conversation
    let combined_message = if caption.is_empty() {
        format!("[the user sent you an image. here is what you see: {}] respond to what you see.", description)
    } else {
        format!("[the user sent an image. what you see: {}] their message: {}", description, caption)
    };

    // Run through normal chat pipeline
    process_message(db, ai_client, memory, knowing, &combined_message).await
}
