//! Local text-to-speech via sherpa-onnx (Piper VITS models).
//!
//! Generates WAV files from text using the offline sherpa-onnx binary.
//! Fully private — no cloud calls, everything runs locally.

use std::path::{Path, PathBuf};
use std::process::Command;

/// Resolve the TTS runtime and model directories relative to the app's
/// resource directory (or a configurable override).
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
