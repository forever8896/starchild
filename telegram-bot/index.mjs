#!/usr/bin/env node
/**
 * Starchild Telegram Bot Sidecar
 *
 * Communicates with the Tauri backend via stdin/stdout JSON lines.
 *
 * Protocol:
 *   Bot → Host:  {"type":"incoming","chat_id":123,"username":"john","text":"hello"}
 *   Bot → Host:  {"type":"status","connected":true}
 *   Bot → Host:  {"type":"error","error":"description"}
 *   Host → Bot:  {"type":"reply","chat_id":123,"text":"response text"}
 *   Host → Bot:  {"type":"reply","chat_id":123,"text":"response text","tts":true}  (force voice note)
 */

import { Bot, InputFile } from "grammy";
import { createInterface } from "node:readline";

const CHUNK_LIMIT = 4000;

// ── Get bot token from env ───────────────────────────────────────────────────

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  send({ type: "error", error: "TELEGRAM_BOT_TOKEN not set" });
  process.exit(1);
}

const VENICE_API_KEY = process.env.VENICE_API_KEY;

// ── TTS state per chat ──────────────────────────────────────────────────────

// chatId → { enabled: boolean, voice: string }
const ttsState = new Map();

const AVAILABLE_VOICES = [
  { id: "af_heart", desc: "Heart (warm female) - default" },
  { id: "af_nova", desc: "Nova (female)" },
  { id: "af_bella", desc: "Bella (female)" },
  { id: "af_sky", desc: "Sky (female)" },
  { id: "am_adam", desc: "Adam (male)" },
  { id: "am_echo", desc: "Echo (male)" },
  { id: "am_michael", desc: "Michael (male)" },
  { id: "bf_emma", desc: "Emma (British female)" },
  { id: "bm_george", desc: "George (British male)" },
];

const DEFAULT_VOICE = "am_echo";

function getTtsConfig(chatId) {
  return ttsState.get(chatId) || { enabled: false, voice: DEFAULT_VOICE };
}

// ── Venice STT (Whisper transcription) ──────────────────────────────────────

async function transcribeAudio(audioBuffer, filename = "voice.mp3") {
  if (!VENICE_API_KEY) {
    send({ type: "error", error: "VENICE_API_KEY not set, STT unavailable" });
    return null;
  }

  try {
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
    formData.append("file", blob, filename);
    formData.append("model", "openai/whisper-large-v3");
    formData.append("language", "en");

    const res = await fetch("https://api.venice.ai/api/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VENICE_API_KEY}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      send({ type: "error", error: `STT API ${res.status}: ${body.slice(0, 200)}` });
      return null;
    }

    const json = await res.json();
    return json.text || null;
  } catch (err) {
    send({ type: "error", error: `STT fetch failed: ${err.message}` });
    return null;
  }
}

// ── Venice TTS ──────────────────────────────────────────────────────────────

function stripMarkdown(text) {
  return text
    .replace(/#{1,6}\s?/g, "")       // headings
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1") // bold/italic
    .replace(/_([^_]+)_/g, "$1")      // _italic_
    .replace(/`{1,3}[^`]*`{1,3}/g, "") // inline/block code
    .replace(/~~([^~]+)~~/g, "$1")    // strikethrough
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/^[>\-*+] /gm, "")      // blockquotes, list markers
    .replace(/\n{3,}/g, "\n\n")       // collapse excess newlines
    .trim();
}

async function textToSpeech(text, voice = DEFAULT_VOICE) {
  if (!VENICE_API_KEY) {
    send({ type: "error", error: "VENICE_API_KEY not set, TTS unavailable" });
    return null;
  }

  const clean = stripMarkdown(text);
  if (clean.length < 10) return null;   // too short
  if (clean.length > 3000) return null; // too long for TTS

  try {
    const res = await fetch("https://api.venice.ai/api/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${VENICE_API_KEY}`,
      },
      body: JSON.stringify({
        input: clean,
        model: "tts-kokoro",
        voice,
        response_format: "opus",
        speed: 1,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      send({ type: "error", error: `TTS API ${res.status}: ${body.slice(0, 200)}` });
      return null;
    }

    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch (err) {
    send({ type: "error", error: `TTS fetch failed: ${err.message}` });
    return null;
  }
}

async function sendVoiceIfEnabled(chatId, text, forceTts) {
  const cfg = getTtsConfig(chatId);
  if (!cfg.enabled && !forceTts) return;

  const audio = await textToSpeech(text, cfg.voice);
  if (audio) {
    try {
      await bot.api.sendVoice(chatId, new InputFile(audio, "voice.ogg"));
    } catch (err) {
      send({ type: "error", error: `sendVoice failed: ${err.message}` });
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function chunkText(text, limit) {
  if (text.length <= limit) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }
    // Try to break at last newline before limit
    let breakAt = remaining.lastIndexOf("\n", limit);
    if (breakAt < limit * 0.3) {
      // No good newline break, try space
      breakAt = remaining.lastIndexOf(" ", limit);
    }
    if (breakAt < limit * 0.3) {
      // No good break point, hard cut
      breakAt = limit;
    }
    chunks.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
  }
  return chunks;
}

// ── Set up grammy bot ────────────────────────────────────────────────────────

const bot = new Bot(token);

// Track pending replies: chat_id → queue of resolve functions (FIFO)
const pendingReplies = new Map();

// ── /tts command ─────────────────────────────────────────────────────────────

bot.command("tts", async (ctx) => {
  const chatId = ctx.chat.id;
  const args = (ctx.match || "").trim().toLowerCase();
  const cfg = getTtsConfig(chatId);

  if (!args || args === "status") {
    await ctx.reply(
      `Voice replies: ${cfg.enabled ? "ON" : "OFF"}\nVoice: ${cfg.voice}\n\nUsage:\n/tts on — enable\n/tts off — disable\n/tts voice <id> — change voice\n/voice — list voices`
    );
    return;
  }

  if (args === "on") {
    ttsState.set(chatId, { ...cfg, enabled: true });
    await ctx.reply(`Voice replies enabled (voice: ${cfg.voice})`);
    return;
  }

  if (args === "off") {
    ttsState.set(chatId, { ...cfg, enabled: false });
    await ctx.reply("Voice replies disabled.");
    return;
  }

  if (args.startsWith("voice")) {
    const voiceId = args.replace(/^voice\s*/, "").trim();
    if (!voiceId) {
      await ctx.reply("Usage: /tts voice <voice_id>\nSee /voice for available voices.");
      return;
    }
    const known = AVAILABLE_VOICES.find((v) => v.id === voiceId);
    if (!known) {
      await ctx.reply(
        `Unknown voice "${voiceId}". Use /voice to see the list.`
      );
      return;
    }
    ttsState.set(chatId, { ...cfg, voice: voiceId });
    await ctx.reply(`Voice changed to ${known.id} (${known.desc})`);
    return;
  }

  await ctx.reply("Unknown option. Use /tts on, /tts off, or /tts voice <id>.");
});

// ── /voice command ───────────────────────────────────────────────────────────

bot.command("voice", async (ctx) => {
  const cfg = getTtsConfig(ctx.chat.id);
  const lines = AVAILABLE_VOICES.map(
    (v) => `${v.id === cfg.voice ? "▸ " : "  "}${v.id} — ${v.desc}`
  );
  await ctx.reply(
    `Available voices:\n\n${lines.join("\n")}\n\nChange with: /tts voice <id>`
  );
});

// ── Incoming text messages ───────────────────────────────────────────────────

bot.on("message:text", async (ctx) => {
  const chatId = ctx.chat.id;
  const username = ctx.from?.username || ctx.from?.first_name || "unknown";
  const text = ctx.message.text;

  // Send to host for AI processing
  send({ type: "incoming", chat_id: chatId, username, text });

  // Wait for reply from host (timeout after 120s)
  try {
    const reply = await new Promise((resolve, reject) => {
      // Queue-based: multiple messages from same chat get queued in order
      if (!pendingReplies.has(chatId)) {
        pendingReplies.set(chatId, []);
      }
      const timer = setTimeout(() => {
        // Remove this specific entry from the queue
        const queue = pendingReplies.get(chatId);
        if (queue) {
          const idx = queue.findIndex((e) => e.resolve === resolve);
          if (idx !== -1) queue.splice(idx, 1);
          if (queue.length === 0) pendingReplies.delete(chatId);
        }
        reject(new Error("timeout"));
      }, 120_000);
      pendingReplies.get(chatId).push({ resolve, timer });
    });

    // Chunk and send
    const chunks = chunkText(reply, CHUNK_LIMIT);
    for (const chunk of chunks) {
      await ctx.reply(chunk);
    }

    // Send voice note if TTS is enabled for this chat
    await sendVoiceIfEnabled(chatId, reply, false);
  } catch (err) {
    if (err.message === "timeout") {
      await ctx.reply("Sorry, I took too long to think. Try again?");
    } else {
      send({ type: "error", error: `Reply failed: ${err.message}` });
    }
  }
});

// ── Handle photo messages ────────────────────────────────────────────────────

bot.on("message:photo", async (ctx) => {
  const chatId = ctx.chat.id;
  const username = ctx.from?.username || ctx.from?.first_name || "unknown";
  const caption = ctx.message.caption || "";

  // Get the largest photo size
  const photos = ctx.message.photo;
  const largest = photos[photos.length - 1];

  try {
    // Download the file from Telegram
    const file = await bot.api.getFile(largest.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

    // Fetch the image and convert to base64
    const response = await fetch(fileUrl);
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    // Determine mime type from file path
    const ext = file.file_path?.split(".").pop()?.toLowerCase() || "jpg";
    const mimeType = ext === "png" ? "image/png" : "image/jpeg";

    // Send to host with image data
    send({
      type: "incoming_image",
      chat_id: chatId,
      username,
      caption,
      image_base64: base64,
      mime_type: mimeType,
    });

    // Wait for reply (same queue system as text)
    const reply = await new Promise((resolve, reject) => {
      if (!pendingReplies.has(chatId)) {
        pendingReplies.set(chatId, []);
      }
      const timer = setTimeout(() => {
        const queue = pendingReplies.get(chatId);
        if (queue) {
          const idx = queue.findIndex((e) => e.resolve === resolve);
          if (idx !== -1) queue.splice(idx, 1);
          if (queue.length === 0) pendingReplies.delete(chatId);
        }
        reject(new Error("timeout"));
      }, 120_000);
      pendingReplies.get(chatId).push({ resolve, timer });
    });

    const chunks = chunkText(reply, CHUNK_LIMIT);
    for (const chunk of chunks) {
      await ctx.reply(chunk);
    }

    // Send voice note if TTS is enabled for this chat
    await sendVoiceIfEnabled(chatId, reply, false);
  } catch (err) {
    if (err.message === "timeout") {
      await ctx.reply("Sorry, I took too long to think about your image. Try again?");
    } else {
      send({ type: "error", error: `Image handling failed: ${err.message}` });
      await ctx.reply("I couldn't process that image right now. Try sending it again?");
    }
  }
});

// ── Incoming voice messages ──────────────────────────────────────────────

bot.on("message:voice", async (ctx) => {
  const chatId = ctx.chat.id;
  const username = ctx.from?.username || ctx.from?.first_name || "unknown";
  const voice = ctx.message.voice;

  try {
    // Download the voice file from Telegram
    const file = await bot.api.getFile(voice.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const response = await fetch(fileUrl);
    const buffer = Buffer.from(await response.arrayBuffer());

    // Transcribe with Venice Whisper API
    const transcribedText = await transcribeAudio(buffer, "voice.mp3");
    if (!transcribedText) {
      await ctx.reply("Sorry, I couldn't understand that voice message. Try again?");
      return;
    }

    // Send transcribed text to host just like a text message
    send({ type: "incoming", chat_id: chatId, username, text: transcribedText });

    // Wait for reply from host (same queue system)
    const reply = await new Promise((resolve, reject) => {
      if (!pendingReplies.has(chatId)) {
        pendingReplies.set(chatId, []);
      }
      const timer = setTimeout(() => {
        const queue = pendingReplies.get(chatId);
        if (queue) {
          const idx = queue.findIndex((e) => e.resolve === resolve);
          if (idx !== -1) queue.splice(idx, 1);
          if (queue.length === 0) pendingReplies.delete(chatId);
        }
        reject(new Error("timeout"));
      }, 120_000);
      pendingReplies.get(chatId).push({ resolve, timer });
    });

    // Send text reply
    const chunks = chunkText(reply, CHUNK_LIMIT);
    for (const chunk of chunks) {
      await ctx.reply(chunk);
    }

    // Send voice reply if TTS is enabled
    await sendVoiceIfEnabled(chatId, reply, false);
  } catch (err) {
    if (err.message === "timeout") {
      await ctx.reply("Sorry, I took too long to think. Try again?");
    } else {
      send({ type: "error", error: `Voice handling failed: ${err.message}` });
      await ctx.reply("I couldn't process that voice message right now. Try again?");
    }
  }
});

// ── Incoming video note messages (round videos) ─────────────────────────

bot.on("message:video_note", async (ctx) => {
  const chatId = ctx.chat.id;
  const username = ctx.from?.username || ctx.from?.first_name || "unknown";
  const videoNote = ctx.message.video_note;

  try {
    // Download the video note file from Telegram
    const file = await bot.api.getFile(videoNote.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const response = await fetch(fileUrl);
    const buffer = Buffer.from(await response.arrayBuffer());

    // Transcribe audio from the video note
    const transcribedText = await transcribeAudio(buffer, "video_note.mp4");
    if (!transcribedText) {
      await ctx.reply("Sorry, I couldn't understand the audio in that video. Try again?");
      return;
    }

    // Send transcribed text to host just like a text message
    send({ type: "incoming", chat_id: chatId, username, text: transcribedText });

    // Wait for reply from host (same queue system)
    const reply = await new Promise((resolve, reject) => {
      if (!pendingReplies.has(chatId)) {
        pendingReplies.set(chatId, []);
      }
      const timer = setTimeout(() => {
        const queue = pendingReplies.get(chatId);
        if (queue) {
          const idx = queue.findIndex((e) => e.resolve === resolve);
          if (idx !== -1) queue.splice(idx, 1);
          if (queue.length === 0) pendingReplies.delete(chatId);
        }
        reject(new Error("timeout"));
      }, 120_000);
      pendingReplies.get(chatId).push({ resolve, timer });
    });

    // Send text reply
    const chunks = chunkText(reply, CHUNK_LIMIT);
    for (const chunk of chunks) {
      await ctx.reply(chunk);
    }

    // Send voice reply if TTS is enabled
    await sendVoiceIfEnabled(chatId, reply, false);
  } catch (err) {
    if (err.message === "timeout") {
      await ctx.reply("Sorry, I took too long to think. Try again?");
    } else {
      send({ type: "error", error: `Video note handling failed: ${err.message}` });
      await ctx.reply("I couldn't process that video message right now. Try again?");
    }
  }
});

// ── Read host replies from stdin ─────────────────────────────────────────────

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.type === "reply" && msg.chat_id != null) {
      const queue = pendingReplies.get(msg.chat_id);
      if (queue && queue.length > 0) {
        // Resolve the oldest pending message (FIFO)
        const entry = queue.shift();
        clearTimeout(entry.timer);
        entry.resolve(msg.text || "");
        if (queue.length === 0) pendingReplies.delete(msg.chat_id);
      }

      // Host can explicitly request TTS via the protocol
      if (msg.tts && msg.text) {
        sendVoiceIfEnabled(msg.chat_id, msg.text, true);
      }
    }
  } catch (err) {
    send({ type: "error", error: `Parse error: ${err.message}` });
  }
});

// ── Handle graceful shutdown ─────────────────────────────────────────────────

process.on("SIGTERM", () => {
  bot.stop();
  process.exit(0);
});
process.on("SIGINT", () => {
  bot.stop();
  process.exit(0);
});

// ── Start polling ────────────────────────────────────────────────────────────

try {
  // Verify the token by calling getMe
  const me = await bot.api.getMe();
  send({ type: "status", connected: true, bot_username: me.username });
  bot.start();
} catch (err) {
  send({ type: "error", error: `Failed to start bot: ${err.message}` });
  process.exit(1);
}
