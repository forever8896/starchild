//! Text-to-speech support.
//!
//! Two backends:
//! 1. **VeniceTts** (primary) — cloud TTS via Venice AI's Kokoro model.
//!    Private, no data retention. Requires a Venice API key.
//! 2. **TtsEngine** (fallback) — local TTS via sherpa-onnx (Piper VITS).
//!    Fully offline, no network calls.

use std::path::PathBuf;
use std::process::Command;

// ---------------------------------------------------------------------------
// Venice AI cloud TTS
// ---------------------------------------------------------------------------

/// Available Venice TTS voices (tts-kokoro model).
///
/// - `af_heart`   — warm female, Starchild's default voice
/// - `af_nova`    — female
/// - `af_bella`   — female
/// - `af_sky`     — female
/// - `am_adam`    — male
/// - `am_echo`    — male
/// - `am_michael` — male
/// - `bf_emma`    — British female
/// - `bm_george`  — British male
pub const DEFAULT_VENICE_VOICE: &str = "am_echo";

const VENICE_TTS_URL: &str = "https://api.venice.ai/api/v1/audio/speech";

/// Cloud TTS via Venice AI (Kokoro model). Private — Venice retains no data.
pub struct VeniceTts {
    api_key: String,
    voice: String,
    output_dir: PathBuf,
    client: reqwest::Client,
}

impl VeniceTts {
    /// Create a new Venice TTS client.
    /// - `api_key`: Venice API bearer token
    /// - `voice`: one of the Kokoro voice IDs (e.g. "af_heart")
    /// - `output_dir`: directory to write generated mp3 files
    pub fn new(api_key: String, voice: String, output_dir: PathBuf) -> Self {
        std::fs::create_dir_all(&output_dir).ok();
        Self {
            api_key,
            voice,
            output_dir,
            client: reqwest::Client::new(),
        }
    }

    /// Returns true if a non-empty API key is configured.
    pub fn is_available(&self) -> bool {
        !self.api_key.is_empty()
    }

    /// Update the API key (e.g. when the user changes it in settings).
    pub fn set_api_key(&mut self, key: String) {
        self.api_key = key;
    }

    /// Change the active voice.
    pub fn set_voice(&mut self, voice: String) {
        self.voice = voice;
    }

    /// Synthesize `text` to an mp3 file via Venice AI.
    /// Returns the path to the written file.
    pub async fn speak(&self, text: &str) -> Result<PathBuf, String> {
        if self.api_key.is_empty() {
            return Err("Venice API key not configured".to_string());
        }

        let clean = strip_markdown(text);
        if clean.is_empty() {
            return Err("Nothing to speak after cleaning text".to_string());
        }

        let body = serde_json::json!({
            "input": clean,
            "model": "tts-kokoro",
            "voice": self.voice,
            "response_format": "mp3",
            "speed": 1.0
        });

        let response = self
            .client
            .post(VENICE_TTS_URL)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Venice TTS request failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "(could not read body)".to_string());
            return Err(format!("Venice TTS API error ({status}): {body}"));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read Venice TTS response: {e}"))?;

        if bytes.is_empty() {
            return Err("Venice TTS returned empty audio".to_string());
        }

        let filename = format!("venice-tts-{}.mp3", uuid::Uuid::new_v4());
        let output_path = self.output_dir.join(&filename);

        std::fs::write(&output_path, &bytes)
            .map_err(|e| format!("Failed to write TTS audio file: {e}"))?;

        Ok(output_path)
    }

    /// Return a cheaply-cloneable snapshot of the config needed to make a
    /// single TTS request. This allows callers to release a Mutex before
    /// entering an async context.
    pub fn request_handle(&self) -> Option<VeniceTtsHandle> {
        if self.api_key.is_empty() {
            return None;
        }
        Some(VeniceTtsHandle {
            api_key: self.api_key.clone(),
            voice: self.voice.clone(),
            output_dir: self.output_dir.clone(),
            client: self.client.clone(),
        })
    }

    /// Clean up old mp3 files, keeping only the most recent `keep` files.
    pub fn cleanup(&self, keep: usize) {
        let Ok(entries) = std::fs::read_dir(&self.output_dir) else {
            return;
        };

        let mut files: Vec<PathBuf> = entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|ext| ext == "mp3"))
            .collect();

        if files.len() <= keep {
            return;
        }

        // Sort by modified time (oldest first)
        files.sort_by(|a, b| {
            let a_time = a.metadata().and_then(|m| m.modified()).ok();
            let b_time = b.metadata().and_then(|m| m.modified()).ok();
            a_time.cmp(&b_time)
        });

        for file in &files[..files.len() - keep] {
            let _ = std::fs::remove_file(file);
        }
    }
}

/// A Send-safe handle extracted from [`VeniceTts`] that can be used across
/// `.await` points without holding a `std::sync::Mutex` guard.
pub struct VeniceTtsHandle {
    api_key: String,
    voice: String,
    output_dir: PathBuf,
    client: reqwest::Client,
}

impl VeniceTtsHandle {
    /// Synthesize `text` to an mp3 file. Same logic as [`VeniceTts::speak`].
    pub async fn speak(&self, text: &str) -> Result<PathBuf, String> {
        let clean = strip_markdown(text);
        if clean.is_empty() {
            return Err("Nothing to speak after cleaning text".to_string());
        }

        let body = serde_json::json!({
            "input": clean,
            "model": "tts-kokoro",
            "voice": self.voice,
            "response_format": "mp3",
            "speed": 1.0
        });

        let response = self
            .client
            .post(VENICE_TTS_URL)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Venice TTS request failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let err_body = response
                .text()
                .await
                .unwrap_or_else(|_| "(could not read body)".to_string());
            return Err(format!("Venice TTS API error ({status}): {err_body}"));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read Venice TTS response: {e}"))?;

        if bytes.is_empty() {
            return Err("Venice TTS returned empty audio".to_string());
        }

        let filename = format!("venice-tts-{}.mp3", uuid::Uuid::new_v4());
        let output_path = self.output_dir.join(&filename);

        std::fs::write(&output_path, &bytes)
            .map_err(|e| format!("Failed to write TTS audio file: {e}"))?;

        Ok(output_path)
    }

    /// Transcribe audio bytes to text via Venice AI's Whisper API.
    pub async fn transcribe(&self, audio_bytes: &[u8], filename: &str) -> Result<String, String> {
        let part = reqwest::multipart::Part::bytes(audio_bytes.to_vec())
            .file_name(filename.to_string())
            .mime_str("application/octet-stream")
            .map_err(|e| format!("Failed to create multipart part: {e}"))?;

        let form = reqwest::multipart::Form::new()
            .part("file", part)
            .text("model", "openai/whisper-large-v3");

        let response = self
            .client
            .post("https://api.venice.ai/api/v1/audio/transcriptions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("Venice STT request failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let err_body = response
                .text()
                .await
                .unwrap_or_else(|_| "(could not read body)".to_string());
            return Err(format!("Venice STT API error ({status}): {err_body}"));
        }

        let json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse STT response: {e}"))?;

        json.get("text")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "STT response missing 'text' field".to_string())
    }

    /// Clean up old mp3 files, keeping only the most recent `keep` files.
    pub fn cleanup(&self, keep: usize) {
        let Ok(entries) = std::fs::read_dir(&self.output_dir) else {
            return;
        };

        let mut files: Vec<PathBuf> = entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|ext| ext == "mp3"))
            .collect();

        if files.len() <= keep {
            return;
        }

        files.sort_by(|a, b| {
            let a_time = a.metadata().and_then(|m| m.modified()).ok();
            let b_time = b.metadata().and_then(|m| m.modified()).ok();
            a_time.cmp(&b_time)
        });

        for file in &files[..files.len() - keep] {
            let _ = std::fs::remove_file(file);
        }
    }
}

/// Strip markdown formatting and decorative unicode from text before speaking.
fn strip_markdown(text: &str) -> String {
    let mut s = text.to_string();

    // Remove markdown headings
    s = s
        .lines()
        .map(|line| {
            let trimmed = line.trim_start();
            if trimmed.starts_with('#') {
                trimmed.trim_start_matches('#').trim()
            } else {
                line
            }
        })
        .collect::<Vec<_>>()
        .join("\n");

    // Remove markdown emphasis / code markers
    for pat in &["***", "**", "__", "~~", "``", "`", "*", "_"] {
        s = s.replace(pat, "");
    }

    // Remove decorative unicode symbols
    for ch in &['✦', '◈', '☽', '✨', '💫', '🌟', '⭐', '🔮', '🌙'] {
        s = s.replace(*ch, "");
    }

    // Collapse whitespace
    let s = s
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    s.trim().to_string()
}

// ---------------------------------------------------------------------------
// Local sherpa-onnx TTS (offline fallback)
// ---------------------------------------------------------------------------

/// Local offline TTS via sherpa-onnx (Piper VITS models).
pub struct TtsEngine {
    runtime_dir: PathBuf,
    model_dir: PathBuf,
    output_dir: PathBuf,
}

impl TtsEngine {
    /// Create a new TTS engine.
    /// - `runtime_dir`: directory containing sherpa-onnx runtime (bin/, lib/)
    /// - `model_dir`: directory containing the Piper VITS model (.onnx, tokens.txt, espeak-ng-data/)
    /// - `output_dir`: where to write WAV files (e.g., app cache dir)
    pub fn new(runtime_dir: PathBuf, model_dir: PathBuf, output_dir: PathBuf) -> Self {
        std::fs::create_dir_all(&output_dir).ok();
        Self {
            runtime_dir,
            model_dir,
            output_dir,
        }
    }

    /// Check if the TTS engine is available (binary + model exist).
    pub fn is_available(&self) -> bool {
        self.binary_path().exists() && self.model_file().is_some()
    }

    /// Synthesize text to a WAV file. Returns the path to the WAV file.
    pub fn speak(&self, text: &str) -> Result<PathBuf, String> {
        let binary = self.binary_path();
        if !binary.exists() {
            return Err(format!("TTS binary not found: {}", binary.display()));
        }

        let model_file = self
            .model_file()
            .ok_or_else(|| "No .onnx model file found".to_string())?;

        let tokens_file = self.model_dir.join("tokens.txt");
        if !tokens_file.exists() {
            return Err("tokens.txt not found in model directory".to_string());
        }

        let data_dir = self.model_dir.join("espeak-ng-data");
        if !data_dir.exists() {
            return Err("espeak-ng-data not found in model directory".to_string());
        }

        // Generate a unique output filename
        let filename = format!("tts-{}.wav", uuid::Uuid::new_v4());
        let output_path = self.output_dir.join(&filename);

        // Build the command
        let mut cmd = Command::new(&binary);
        cmd.arg(format!("--vits-model={}", model_file.display()))
            .arg(format!("--vits-tokens={}", tokens_file.display()))
            .arg(format!("--vits-data-dir={}", data_dir.display()))
            .arg(format!("--output-filename={}", output_path.display()))
            .arg(text);

        // Set library path for shared libs
        let lib_dir = self.runtime_dir.join("lib");
        #[cfg(target_os = "linux")]
        {
            let current = std::env::var("LD_LIBRARY_PATH").unwrap_or_default();
            cmd.env(
                "LD_LIBRARY_PATH",
                format!("{}:{}", lib_dir.display(), current),
            );
        }
        #[cfg(target_os = "macos")]
        {
            let current = std::env::var("DYLD_LIBRARY_PATH").unwrap_or_default();
            cmd.env(
                "DYLD_LIBRARY_PATH",
                format!("{}:{}", lib_dir.display(), current),
            );
        }

        let output = cmd.output().map_err(|e| format!("Failed to run TTS: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("TTS failed: {stderr}"));
        }

        if !output_path.exists() {
            return Err("TTS completed but output file not found".to_string());
        }

        Ok(output_path)
    }

    fn binary_path(&self) -> PathBuf {
        let name = if cfg!(target_os = "windows") {
            "sherpa-onnx-offline-tts.exe"
        } else {
            "sherpa-onnx-offline-tts"
        };
        self.runtime_dir.join("bin").join(name)
    }

    fn model_file(&self) -> Option<PathBuf> {
        let entries = std::fs::read_dir(&self.model_dir).ok()?;
        let onnx_files: Vec<PathBuf> = entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|ext| ext == "onnx"))
            .collect();

        if onnx_files.len() == 1 {
            Some(onnx_files.into_iter().next().unwrap())
        } else {
            None
        }
    }

    /// Clean up old WAV files (keep only the last N).
    pub fn cleanup(&self, keep: usize) {
        let Ok(entries) = std::fs::read_dir(&self.output_dir) else {
            return;
        };

        let mut files: Vec<PathBuf> = entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|ext| ext == "wav"))
            .collect();

        if files.len() <= keep {
            return;
        }

        // Sort by modified time (oldest first)
        files.sort_by(|a, b| {
            let a_time = a.metadata().and_then(|m| m.modified()).ok();
            let b_time = b.metadata().and_then(|m| m.modified()).ok();
            a_time.cmp(&b_time)
        });

        // Remove oldest files
        for file in &files[..files.len() - keep] {
            let _ = std::fs::remove_file(file);
        }
    }
}
