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
 */

import { Bot } from "grammy";
import { createInterface } from "node:readline";

const CHUNK_LIMIT = 4000;

// ── Get bot token from env ───────────────────────────────────────────────────

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  send({ type: "error", error: "TELEGRAM_BOT_TOKEN not set" });
  process.exit(1);
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
  } catch (err) {
    if (err.message === "timeout") {
      await ctx.reply("Sorry, I took too long to think about your image. Try again?");
    } else {
      send({ type: "error", error: `Image handling failed: ${err.message}` });
      await ctx.reply("I couldn't process that image right now. Try sending it again?");
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
