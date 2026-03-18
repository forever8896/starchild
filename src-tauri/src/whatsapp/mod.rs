//! WhatsApp Bot Connector
//!
//! Manages a Node.js sidecar process running Baileys that bridges
//! WhatsApp messages to the Starchild AI pipeline.
//!
//! Communication protocol (JSON lines over stdin/stdout):
//!   Bot → Host: {"type":"qr","qr":"<qr-string>"}
//!   Bot → Host: {"type":"incoming","from":"123@s.whatsapp.net","name":"John","text":"hello"}
//!   Bot → Host: {"type":"status","connected":true,"phone":"1234567890"}
//!   Bot → Host: {"type":"error","error":"description"}
//!   Host → Bot: {"type":"reply","to":"123@s.whatsapp.net","text":"response text"}

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
    #[serde(rename = "qr")]
    Qr { qr: String },
    #[serde(rename = "incoming")]
    Incoming {
        from: String,
        name: String,
        text: String,
    },
    #[serde(rename = "status")]
    Status {
        connected: bool,
        #[serde(default)]
        phone: Option<String>,
        #[serde(default)]
        #[allow(dead_code)]
        reason: Option<String>,
    },
    #[serde(rename = "error")]
    Error { error: String },
}

#[derive(Serialize)]
struct HostReply {
    #[serde(rename = "type")]
    msg_type: &'static str,
    to: String,
    text: String,
}

// ---------------------------------------------------------------------------
// Bot manager
// ---------------------------------------------------------------------------

pub struct WhatsAppBot {
    child: Option<Child>,
    stdin_tx: Option<tokio::sync::mpsc::Sender<String>>,
    status: WhatsAppStatus,
    phone: Option<String>,
    qr_code: Option<String>,
}

#[derive(Clone, Serialize, Debug, PartialEq)]
pub enum WhatsAppStatus {
    Stopped,
    WaitingForQr,
    Connected,
    Error(String),
}

impl WhatsAppBot {
    pub fn new() -> Self {
        Self {
            child: None,
            stdin_tx: None,
            status: WhatsAppStatus::Stopped,
            phone: None,
            qr_code: None,
        }
    }

    pub fn status(&self) -> WhatsAppStatus {
        self.status.clone()
    }

    pub fn phone(&self) -> Option<String> {
        self.phone.clone()
    }

    pub fn qr_code(&self) -> Option<String> {
        self.qr_code.clone()
    }
}

pub type WhatsAppBotHandle = Arc<Mutex<WhatsAppBot>>;

pub fn new_handle() -> WhatsAppBotHandle {
    Arc::new(Mutex::new(WhatsAppBot::new()))
}

// ---------------------------------------------------------------------------
// Start / stop
// ---------------------------------------------------------------------------

pub async fn start_bot(
    handle: WhatsAppBotHandle,
    auth_dir: String,
    bot_script_path: String,
    db: Database,
    ai_client: AiClient,
    memory: MemorySystem,
    knowing: KnowingSystem,
) -> Result<(), String> {
    let mut bot = handle.lock().await;

    // Already running?
    if bot.child.is_some() {
        return Err("WhatsApp bot is already running".into());
    }

    bot.status = WhatsAppStatus::WaitingForQr;
    bot.qr_code = None;

    // Spawn the Node.js process
    let mut child = Command::new("node")
        .arg(&bot_script_path)
        .env("WHATSAPP_AUTH_DIR", &auth_dir)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to spawn whatsapp bot: {e}"))?;

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
                Ok(BotMessage::Qr { qr }) => {
                    let mut bot = reader_handle.lock().await;
                    bot.qr_code = Some(qr);
                    bot.status = WhatsAppStatus::WaitingForQr;
                }
                Ok(BotMessage::Incoming { from, name, text }) => {
                    let reply = handle_whatsapp_message(
                        &db,
                        &ai_client,
                        &memory,
                        &knowing,
                        &from,
                        &name,
                        &text,
                    )
                    .await;

                    let reply_json = serde_json::to_string(&HostReply {
                        msg_type: "reply",
                        to: from,
                        text: reply,
                    })
                    .unwrap_or_default()
                        + "\n";

                    let _ = stdin_tx.send(reply_json).await;
                }
                Ok(BotMessage::Status {
                    connected,
                    phone,
                    reason: _,
                }) => {
                    let mut bot = reader_handle.lock().await;
                    if connected {
                        bot.status = WhatsAppStatus::Connected;
                        bot.phone = phone;
                        bot.qr_code = None; // Clear QR once connected
                    } else {
                        bot.status = WhatsAppStatus::WaitingForQr;
                    }
                }
                Ok(BotMessage::Error { error }) => {
                    log::error!("WhatsApp bot error: {error}");
                    let mut bot = reader_handle.lock().await;
                    bot.status = WhatsAppStatus::Error(error);
                }
                Err(e) => {
                    log::warn!("Failed to parse whatsapp bot message: {e} — line: {line}");
                }
            }
        }

        // Process ended — clean up
        let mut bot = reader_handle.lock().await;
        if bot.status == WhatsAppStatus::Connected
            || bot.status == WhatsAppStatus::WaitingForQr
        {
            bot.status = WhatsAppStatus::Stopped;
        }
        bot.child = None;
        bot.stdin_tx = None;
        bot.qr_code = None;
    });

    Ok(())
}

pub async fn stop_bot(handle: WhatsAppBotHandle) -> Result<(), String> {
    let mut bot = handle.lock().await;
    if let Some(mut child) = bot.child.take() {
        let _ = child.kill().await;
    }
    bot.stdin_tx = None;
    bot.status = WhatsAppStatus::Stopped;
    bot.phone = None;
    bot.qr_code = None;
    Ok(())
}

// ---------------------------------------------------------------------------
// Message handling — routes through the same AI pipeline as desktop chat
// ---------------------------------------------------------------------------

async fn handle_whatsapp_message(
    db: &Database,
    ai_client: &AiClient,
    memory: &MemorySystem,
    knowing: &KnowingSystem,
    _from: &str,
    _name: &str,
    text: &str,
) -> String {
    match process_message(db, ai_client, memory, knowing, text).await {
        Ok(reply) => reply,
        Err(e) => {
            log::error!("AI processing failed for whatsapp message: {e}");
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
    // Save user message (platform = "whatsapp")
    let user_msg_id = uuid::Uuid::new_v4().to_string();
    db.save_message(&user_msg_id, "whatsapp", "user", text)
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
    let recent_msgs = db.get_messages(10).map_err(|e| e.to_string())?;
    let history: Vec<ChatMessage> = recent_msgs
        .iter()
        .rev()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .take(8)
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
    db.save_message(&assistant_msg_id, "whatsapp", "assistant", &response_text)
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
