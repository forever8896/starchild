//! Venice AI client (desktop).
//!
//! All pure engine logic (routing, prompts, phases, post-processing, the
//! shared types and `AiError`) now lives in `starchild_core::ai`, re-exported
//! here at the original `crate::ai` path. This module keeps only the parts
//! that need the network: the `reqwest`-based `AiClient`, its wire types, and
//! the streamed `<think>`-tag stripper.

pub use starchild_core::ai::*;

use crate::e2ee::E2eeSession;
use futures_util::StreamExt;
use starchild_core::inference::InferenceSender;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VENICE_BASE_URL: &str = "https://api.venice.ai/api/v1";

#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Debug, Deserialize)]
#[serde(default)]
struct ChatResponse {
    choices: Vec<Choice>,
}

impl Default for ChatResponse {
    fn default() -> Self {
        Self { choices: Vec::new() }
    }
}

#[derive(Debug, Deserialize)]
#[serde(default)]
struct Choice {
    message: ChoiceMessage,
}

impl Default for Choice {
    fn default() -> Self {
        Self { message: ChoiceMessage::default() }
    }
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct ChoiceMessage {
    #[allow(dead_code)]
    role: Option<String>,
    content: Option<String>,
}

// ─── Vision (multimodal) request types ───────────────────────────────────────

#[derive(Debug, Serialize)]
struct VisionRequest {
    model: String,
    messages: Vec<VisionMessage>,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Debug, Serialize)]
struct VisionMessage {
    role: String,
    content: Vec<VisionContent>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type")]
enum VisionContent {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image_url")]
    ImageUrl { image_url: ImageUrlPayload },
}

#[derive(Debug, Serialize)]
struct ImageUrlPayload {
    url: String,
}

#[derive(Debug, Serialize)]
struct StreamChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    max_tokens: u32,
    stream: bool,
}

#[derive(Debug, Deserialize)]
struct StreamChatChunk {
    choices: Vec<StreamChoice>,
}

#[derive(Debug, Deserialize)]
struct StreamChoice {
    delta: StreamDelta,
    #[allow(dead_code)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct StreamDelta {
    #[allow(dead_code)]
    role: Option<String>,
    content: Option<String>,
}

// ---------------------------------------------------------------------------
// ThinkTagStripper — stateful filter for streamed `<think>` blocks
// ---------------------------------------------------------------------------

/// Strips `<think>...</think>` tags from a stream of text chunks.
/// Buffers partial tags to handle chunks that split across tag boundaries.
struct ThinkTagStripper {
    /// Are we currently inside a `<think>` block?
    inside_think: bool,
    /// Buffer for partial tag detection at chunk boundaries.
    buffer: String,
}

impl ThinkTagStripper {
    fn new() -> Self {
        Self {
            inside_think: false,
            buffer: String::new(),
        }
    }

    /// Process a chunk of text. Returns the text that should be emitted.
    fn process(&mut self, chunk: &str) -> String {
        self.buffer.push_str(chunk);
        let mut output = String::new();

        loop {
            if self.inside_think {
                // Look for </think>
                if let Some(end_pos) = self.buffer.find("</think>") {
                    // Discard everything up to and including </think>
                    self.buffer = self.buffer[end_pos + "</think>".len()..].to_string();
                    self.inside_think = false;
                } else if self.buffer.contains("</") && !self.buffer.contains("</think>") {
                    // Partial "</thi..." — keep buffering
                    break;
                } else {
                    // No closing tag yet, could be partial — keep buffered
                    // But if buffer is getting large and no partial match, discard
                    if self.buffer.len() > 200 && !self.buffer.ends_with('<') && !self.buffer.ends_with("</") {
                        self.buffer.clear();
                    }
                    break;
                }
            } else {
                // Look for <think>
                if let Some(start_pos) = self.buffer.find("<think>") {
                    // Emit everything before <think>
                    output.push_str(&self.buffer[..start_pos]);
                    self.buffer = self.buffer[start_pos + "<think>".len()..].to_string();
                    self.inside_think = true;
                } else if self.buffer.ends_with('<')
                    || self.buffer.ends_with("<t")
                    || self.buffer.ends_with("<th")
                    || self.buffer.ends_with("<thi")
                    || self.buffer.ends_with("<thin")
                    || self.buffer.ends_with("<think")
                {
                    // Possible partial <think> tag at the end — emit everything
                    // up to the '<' and keep the rest buffered
                    if let Some(lt_pos) = self.buffer.rfind('<') {
                        output.push_str(&self.buffer[..lt_pos]);
                        self.buffer = self.buffer[lt_pos..].to_string();
                    }
                    break;
                } else {
                    // No tag in sight — emit everything
                    output.push_str(&self.buffer);
                    self.buffer.clear();
                    break;
                }
            }
        }

        output
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Strip `<think>...</think>` blocks that some models (e.g. DeepSeek) emit
/// as chain-of-thought reasoning. We only want the final response.
fn strip_think_tags(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut remaining = text;

    while let Some(start) = remaining.find("<think>") {
        // Keep everything before <think>
        result.push_str(&remaining[..start]);
        // Find closing tag
        if let Some(end) = remaining[start..].find("</think>") {
            remaining = &remaining[start + end + "</think>".len()..];
        } else {
            // Unclosed <think> — drop everything after it
            remaining = "";
            break;
        }
    }
    result.push_str(remaining);

    result.trim().to_string()
}

// ---------------------------------------------------------------------------
// AiClient
// ---------------------------------------------------------------------------

/// Async Venice AI client.  Cheap to clone (the inner `reqwest::Client`
/// uses an `Arc` internally, and the E2EE session is behind `Arc<RwLock>`).
#[derive(Clone)]
pub struct AiClient {
    api_key: String,
    http_client: reqwest::Client,
    /// E2EE session — established lazily on first use, shared across clones.
    e2ee_session: Arc<RwLock<Option<E2eeSession>>>,
    /// Whether E2EE is enabled. When true, all user-facing chat uses E2EE models.
    e2ee_enabled: bool,
}

impl AiClient {
    /// Create a new client with the given Venice API key. E2EE is enabled by default.
    pub fn new(api_key: String) -> Self {
        let http_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(90))
            .build()
            .expect("failed to build reqwest client");

        Self {
            api_key,
            http_client,
            e2ee_session: Arc::new(RwLock::new(None)),
            e2ee_enabled: true,
        }
    }

    /// Ensure the E2EE session is established for the given model.
    /// Returns Ok(true) if E2EE is ready, Ok(false) if disabled/unavailable.
    async fn ensure_e2ee(&self, model: &str) -> std::result::Result<bool, AiError> {
        if !self.e2ee_enabled {
            return Ok(false);
        }

        // Only E2EE for user-facing models (Regular and Deep), not Quick/Vision
        if model == ModelTier::Quick.model_id() || model == ModelTier::Vision.model_id() {
            return Ok(false);
        }

        // Check if session already exists
        {
            let guard = self.e2ee_session.read().await;
            if guard.is_some() {
                return Ok(true);
            }
        }

        // Map to actual Venice E2EE model name
        let e2ee_model = if model == ModelTier::Regular.model_id() {
            ModelTier::Regular.e2ee_model_id()
        } else if model == ModelTier::Deep.model_id() {
            ModelTier::Deep.e2ee_model_id()
        } else {
            None
        };

        let e2ee_model = match e2ee_model {
            Some(m) => m.to_string(),
            None => return Ok(false),
        };

        log::info!("Establishing E2EE session for {e2ee_model}...");

        match crate::e2ee_net::establish(
            &self.http_client,
            &self.api_key,
            VENICE_BASE_URL,
            &e2ee_model,
        )
        .await
        {
            Ok(session) => {
                let mut guard = self.e2ee_session.write().await;
                *guard = Some(session);
                log::info!("E2EE session established successfully");
                Ok(true)
            }
            Err(e) => {
                log::warn!("E2EE setup failed, falling back to standard: {e}");
                Ok(false)
            }
        }
    }

    /// Encrypt all messages for E2EE. Venice requires every message content
    /// to be hex-encoded when E2EE headers are present.
    fn encrypt_messages(
        session: &E2eeSession,
        messages: &[ChatMessage],
    ) -> std::result::Result<Vec<ChatMessage>, AiError> {
        messages
            .iter()
            .map(|msg| {
                let encrypted = session
                    .encrypt(&msg.content)
                    .map_err(|e| AiError::E2ee(e.to_string()))?;
                Ok(ChatMessage {
                    role: msg.role.clone(),
                    content: encrypted,
                })
            })
            .collect()
    }

    /// Send a chat completion request for a specific [`ModelTier`].
    /// Retries up to 2 times on connection errors.
    /// When E2EE is active, uses streaming internally (E2EE requires it).
    pub async fn chat(
        &self,
        messages: Vec<ChatMessage>,
        tier: ModelTier,
    ) -> Result<String> {
        let model = tier.model_id();
        let use_e2ee = self.ensure_e2ee(model).await?;

        if use_e2ee {
            // E2EE requires streaming — collect silently
            return self.chat_stream(messages, tier, |_| {}).await;
        }

        let request_body = ChatRequest {
            model: model.to_string(),
            messages,
            temperature: tier.temperature(),
            max_tokens: tier.max_tokens(),
        };

        let url = format!("{VENICE_BASE_URL}/chat/completions");
        let mut last_err = None;

        for attempt in 0..3 {
            if attempt > 0 {
                log::warn!("Venice API retry attempt {attempt}");
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }

            let response = match self
                .http_client
                .post(&url)
                .header("Authorization", format!("Bearer {}", self.api_key))
                .json(&request_body)
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    last_err = Some(AiError::Network(e.to_string()));
                    continue; // retry on connection error
                }
            };

            let status = response.status();
            if !status.is_success() {
                let body = response.text().await.unwrap_or_default();
                return Err(AiError::ApiError {
                    status: status.as_u16(),
                    body,
                });
            }

            let chat_response: ChatResponse = response
                .json()
                .await
                .map_err(|e| AiError::Network(e.to_string()))?;

            let raw = chat_response
                .choices
                .into_iter()
                .next()
                .and_then(|c| c.message.content)
                .filter(|s| !s.is_empty())
                .ok_or(AiError::EmptyResponse)?;

            return Ok(strip_think_tags(&raw));
        }

        Err(last_err.unwrap_or(AiError::EmptyResponse))
    }

    /// Send a streaming chat completion request. Calls `on_token` for each
    /// token received from the SSE stream. Returns the full accumulated text.
    ///
    /// When E2EE is active:
    ///   - Messages are encrypted before sending
    ///   - Model name is prefixed with `e2ee-`
    ///   - Required E2EE headers are attached
    ///   - Response chunks are decrypted before calling `on_token`
    pub async fn chat_stream<F>(
        &self,
        messages: Vec<ChatMessage>,
        tier: ModelTier,
        mut on_token: F,
    ) -> Result<String>
    where
        F: FnMut(&str),
    {
        let model = tier.model_id();
        let use_e2ee = self.ensure_e2ee(model).await?;

        // Prepare model name and messages
        let (actual_model, actual_messages) = if use_e2ee {
            let guard = self.e2ee_session.read().await;
            let session = guard.as_ref().unwrap(); // safe: ensure_e2ee returned true
            let encrypted = Self::encrypt_messages(session, &messages)?;
            let e2ee_name = tier.e2ee_model_id().unwrap_or(model).to_string();
            (e2ee_name, encrypted)
        } else {
            (model.to_string(), messages)
        };

        let request_body = StreamChatRequest {
            model: actual_model.clone(),
            messages: actual_messages,
            temperature: tier.temperature(),
            max_tokens: tier.max_tokens(),
            stream: true,
        };

        let url = format!("{VENICE_BASE_URL}/chat/completions");

        if use_e2ee {
            // Debug: log first encrypted message content (first 80 chars)
            if let Some(msg) = request_body.messages.first() {
                let preview = &msg.content[..msg.content.len().min(80)];
                log::info!(
                    "Venice stream request: model={} messages={} e2ee=true first_content_preview={}...",
                    request_body.model, request_body.messages.len(), preview,
                );
            }
        } else {
            log::info!(
                "Venice stream request: model={} messages={} e2ee=false",
                request_body.model, request_body.messages.len(),
            );
        }

        // Build request with E2EE headers if needed
        let mut req = self
            .http_client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key));

        if use_e2ee {
            let guard = self.e2ee_session.read().await;
            let session = guard.as_ref().unwrap();
            req = req
                .header("X-Venice-TEE-Client-Pub-Key", &session.client_pub_hex)
                .header("X-Venice-TEE-Model-Pub-Key", &session.model_pub_hex)
                .header("X-Venice-TEE-Signing-Algo", "ecdsa");
        }

        let response = req
            .json(&request_body)
            .send()
            .await
            .map_err(|e| {
                log::error!("Venice stream send failed: {e:?}");
                AiError::Network(e.to_string())
            })?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            log::error!("Venice API error ({status}): {body}");
            return Err(AiError::ApiError {
                status: status.as_u16(),
                body,
            });
        }

        let mut full_text = String::new();
        let mut stripper = ThinkTagStripper::new();
        let mut stream = response.bytes_stream();
        let mut line_buffer = String::new();

        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result.map_err(|e| AiError::Network(e.to_string()))?;
            let chunk_str = String::from_utf8_lossy(&chunk);
            line_buffer.push_str(&chunk_str);

            // Process complete lines from the buffer
            while let Some(newline_pos) = line_buffer.find('\n') {
                let line = line_buffer[..newline_pos].trim().to_string();
                line_buffer = line_buffer[newline_pos + 1..].to_string();

                if line.is_empty() {
                    continue;
                }

                if line == "data: [DONE]" {
                    break;
                }

                if let Some(json_str) = line.strip_prefix("data: ") {
                    if let Ok(chunk) = serde_json::from_str::<StreamChatChunk>(json_str) {
                        for choice in &chunk.choices {
                            if let Some(content) = &choice.delta.content {
                                // E2EE: content arrives as hex-encoded ciphertext
                                let decrypted = if use_e2ee {
                                    let trimmed = content.trim();
                                    if trimmed.is_empty() {
                                        continue;
                                    }
                                    let guard = self.e2ee_session.read().await;
                                    let session = guard.as_ref().unwrap();
                                    match session.decrypt(trimmed) {
                                        Ok(plain) => plain,
                                        Err(e) => {
                                            // Some chunks may be partial hex or metadata — skip
                                            log::trace!("E2EE chunk decrypt skip: {e}");
                                            continue;
                                        }
                                    }
                                } else {
                                    content.clone()
                                };

                                let filtered = stripper.process(&decrypted);
                                if !filtered.is_empty() {
                                    full_text.push_str(&filtered);
                                    on_token(&filtered);
                                }
                            }
                        }
                    }
                }
            }
        }

        if full_text.trim().is_empty() {
            return Err(AiError::EmptyResponse);
        }

        Ok(full_text)
    }

    /// Convenience streaming method: automatically route the tier, build
    /// messages, and stream tokens via `on_token` callback.
    pub async fn chat_stream_auto<F>(
        &self,
        user_message: &str,
        system_prompt: &str,
        history: Vec<ChatMessage>,
        on_token: F,
    ) -> Result<String>
    where
        F: FnMut(&str),
    {
        let tier = ModelRouter::route(user_message);

        let mut messages = Vec::with_capacity(history.len() + 2);
        messages.push(ChatMessage::system(system_prompt));
        messages.extend(history);
        messages.push(ChatMessage::user(user_message));

        self.chat_stream(messages, tier, on_token).await
    }

    /// Convenience method: automatically route the tier based on the user
    /// message content, prepend the system prompt, append conversation
    /// history, and call [`chat`](Self::chat).
    pub async fn chat_auto(
        &self,
        user_message: &str,
        system_prompt: &str,
        history: Vec<ChatMessage>,
    ) -> Result<String> {
        let tier = ModelRouter::route(user_message);

        let mut messages = Vec::with_capacity(history.len() + 2);

        // System prompt always goes first.
        messages.push(ChatMessage::system(system_prompt));

        // Then any conversation history.
        messages.extend(history);

        // Finally the new user message.
        messages.push(ChatMessage::user(user_message));

        self.chat(messages, tier).await
    }

    /// Describe an image using the vision model.
    /// Returns a text description that can be fed into the conversation model.
    /// `image_base64` should be the raw base64-encoded image data (no data URI prefix).
    /// `mime_type` should be "image/png", "image/jpeg", etc.
    pub async fn describe_image(
        &self,
        image_base64: &str,
        mime_type: &str,
        context: Option<&str>,
    ) -> Result<String> {
        let data_url = format!("data:{};base64,{}", mime_type, image_base64);

        let prompt = context.unwrap_or(
            "Describe this image in detail. What do you see? \
             Include colors, objects, people, emotions, setting, and any text visible. \
             Be specific and concise — 2-4 sentences."
        );

        let request_body = VisionRequest {
            model: ModelTier::Vision.model_id().to_string(),
            messages: vec![VisionMessage {
                role: "user".to_string(),
                content: vec![
                    VisionContent::Text { text: prompt.to_string() },
                    VisionContent::ImageUrl {
                        image_url: ImageUrlPayload { url: data_url },
                    },
                ],
            }],
            temperature: ModelTier::Vision.temperature(),
            max_tokens: ModelTier::Vision.max_tokens(),
        };

        let url = format!("{VENICE_BASE_URL}/chat/completions");
        let mut last_err = None;

        for attempt in 0..3 {
            if attempt > 0 {
                log::warn!("Vision API retry attempt {attempt}");
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }

            let response = match self
                .http_client
                .post(&url)
                .header("Authorization", format!("Bearer {}", self.api_key))
                .json(&request_body)
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    last_err = Some(AiError::Network(e.to_string()));
                    continue;
                }
            };

            let status = response.status();
            if !status.is_success() {
                let body = response.text().await.unwrap_or_default();
                return Err(AiError::ApiError {
                    status: status.as_u16(),
                    body,
                });
            }

            let chat_response: ChatResponse = response
                .json()
                .await
                .map_err(|e| AiError::Network(e.to_string()))?;

            let raw = chat_response
                .choices
                .into_iter()
                .next()
                .and_then(|c| c.message.content)
                .filter(|s| !s.is_empty())
                .ok_or(AiError::EmptyResponse)?;

            return Ok(strip_think_tags(&raw));
        }

        Err(last_err.unwrap_or(AiError::EmptyResponse))
    }
}

// ---------------------------------------------------------------------------
// InferenceSender — the platform-agnostic chat surface (core), backed here by
// the `reqwest` Venice client. Thin delegation to the inherent methods (called
// via fully qualified `AiClient::…` to avoid resolving back into the trait).
// ---------------------------------------------------------------------------

#[async_trait::async_trait]
impl InferenceSender for AiClient {
    async fn chat(
        &self,
        messages: Vec<ChatMessage>,
        tier: ModelTier,
    ) -> std::result::Result<String, AiError> {
        AiClient::chat(self, messages, tier).await
    }

    async fn chat_stream(
        &self,
        messages: Vec<ChatMessage>,
        tier: ModelTier,
        on_token: &mut (dyn FnMut(String) + Send),
    ) -> std::result::Result<String, AiError> {
        // The inherent method streams borrowed `&str` tokens; hand each one to
        // the owned-`String` trait callback.
        let mut cb = |s: &str| on_token(s.to_string());
        AiClient::chat_stream(self, messages, tier, &mut cb).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    // -- Serialization round-trip ------------------------------------------

    #[test]
    fn chat_request_serializes() {
        let req = ChatRequest {
            model: "test-model".to_string(),
            messages: vec![ChatMessage::user("hi")],
            temperature: 0.5,
            max_tokens: 100,
        };

        let json = serde_json::to_value(&req).unwrap();
        assert_eq!(json["model"], "test-model");
        assert_eq!(json["temperature"], 0.5);
        assert_eq!(json["max_tokens"], 100);
        assert_eq!(json["messages"][0]["role"], "user");
        assert_eq!(json["messages"][0]["content"], "hi");
    }

    #[test]
    fn chat_response_deserializes() {
        let json = r#"{
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": "Hello human!"
                }
            }]
        }"#;

        let resp: ChatResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.choices.len(), 1);
        assert_eq!(
            resp.choices[0].message.content.as_deref(),
            Some("Hello human!"),
        );
    }

    // -- strip_think_tags -------------------------------------------------

    #[test]
    fn strip_think_basic() {
        let input = "<think>\nOkay let me think about this...\n</think>\nHello human!";
        assert_eq!(strip_think_tags(input), "Hello human!");
    }

    #[test]
    fn strip_think_no_tags() {
        assert_eq!(strip_think_tags("Just a normal response"), "Just a normal response");
    }

    #[test]
    fn strip_think_multiple() {
        let input = "<think>first</think>Hello <think>second</think>world";
        assert_eq!(strip_think_tags(input), "Hello world");
    }

    #[test]
    fn strip_think_unclosed() {
        let input = "<think>this never closes";
        assert_eq!(strip_think_tags(input), "");
    }

    #[test]
    fn strip_think_empty_after() {
        let input = "<think>only thinking, no response</think>";
        assert_eq!(strip_think_tags(input), "");
    }
}
