//! The `InferenceSender` trait — the platform-agnostic chat-completion surface.
//!
//! It mirrors the desktop Venice client (`AiClient`) chat/stream methods but
//! carries no networking, so each shell wires its own transport: the desktop
//! implements it with `reqwest` (plus the E2EE handshake), and the web will
//! implement it over `fetch` in JS. The pure pieces it speaks in
//! ([`ChatMessage`], [`ModelTier`], [`AiError`]) already live in [`crate::ai`].

use async_trait::async_trait;

use crate::ai::{AiError, ChatMessage, ModelTier};

/// Sends chat-completion requests to the backing model.
///
/// `on_token` is invoked with each streamed token. It is `Send` so the returned
/// future stays `Send` across platforms that spawn it on a multi-threaded
/// runtime, and it takes an owned `String` so the object-safe trait surface
/// stays free of the higher-ranked-lifetime friction a borrowed `&str` would
/// introduce through `async_trait`'s boxing.
#[async_trait]
pub trait InferenceSender: Send + Sync {
    /// Send a (non-streaming) chat completion for a specific [`ModelTier`] and
    /// return the full response text.
    async fn chat(&self, messages: Vec<ChatMessage>, tier: ModelTier)
        -> Result<String, AiError>;

    /// Send a streaming chat completion, calling `on_token` for each token as
    /// it arrives, and return the full accumulated text.
    async fn chat_stream(
        &self,
        messages: Vec<ChatMessage>,
        tier: ModelTier,
        on_token: &mut (dyn FnMut(String) + Send),
    ) -> Result<String, AiError>;
}
