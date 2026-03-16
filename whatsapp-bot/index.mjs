#!/usr/bin/env node
/**
 * Starchild WhatsApp Bot Sidecar
 *
 * Communicates with the Tauri backend via stdin/stdout JSON lines.
 * Uses Baileys (WhatsApp Web multi-device) for WhatsApp connectivity.
 *
 * Protocol:
 *   Bot → Host:  {"type":"qr","qr":"<qr-string>"}
 *   Bot → Host:  {"type":"incoming","from":"123@s.whatsapp.net","name":"John","text":"hello"}
 *   Bot → Host:  {"type":"status","connected":true,"phone":"1234567890"}
 *   Bot → Host:  {"type":"error","error":"description"}
 *   Host → Bot:  {"type":"reply","to":"123@s.whatsapp.net","text":"response text"}
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import { createInterface } from "node:readline";
import { mkdirSync } from "node:fs";
import pino from "pino";

const CHUNK_LIMIT = 1024;

// ── Auth state directory ────────────────────────────────────────────────────

const AUTH_DIR = process.env.WHATSAPP_AUTH_DIR || "./whatsapp-auth";
mkdirSync(AUTH_DIR, { recursive: true });

// ── Logger (silent — we don't want Baileys noise on stdout) ─────────────────

const logger = pino({ level: "silent" });

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

// ── Track pending replies: jid → resolve function ───────────────────────────

const pendingReplies = new Map();

// ── Socket reference (set after connection) ─────────────────────────────────

let sock = null;

// ── Connect to WhatsApp ─────────────────────────────────────────────────────

async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    printQRInTerminal: false,
  });

  // Save credentials when updated
  sock.ev.on("creds.update", saveCreds);

  // Connection updates (QR code, connected, disconnected)
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // Send QR code string to host for display
      send({ type: "qr", qr });
    }

    if (connection === "open") {
      const phone = sock.user?.id?.split(":")[0] || sock.user?.id || "unknown";
      send({ type: "status", connected: true, phone });
    }

    if (connection === "close") {
      const statusCode =
        lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        send({ type: "status", connected: false, reason: "disconnected" });
        // Attempt reconnection
        setTimeout(connectWhatsApp, 3000);
      } else {
        send({ type: "error", error: "Logged out from WhatsApp. Please re-pair." });
      }
    }
  });

  // Incoming messages
  sock.ev.on("messages.upsert", async ({ messages: msgs, type }) => {
    if (type !== "notify") return;

    for (const msg of msgs) {
      // Skip messages we sent, status broadcasts, and non-text
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid === "status@broadcast") continue;

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text;
      if (!text) continue;

      const from = msg.key.remoteJid;
      const name = msg.pushName || "unknown";

      // Send to host for AI processing
      send({ type: "incoming", from, name, text });

      // Wait for reply from host (timeout after 120s)
      try {
        const reply = await new Promise((resolve, reject) => {
          pendingReplies.set(from, resolve);
          setTimeout(() => {
            pendingReplies.delete(from);
            reject(new Error("timeout"));
          }, 120_000);
        });

        // Chunk and send
        const chunks = chunkText(reply, CHUNK_LIMIT);
        for (const chunk of chunks) {
          await sock.sendMessage(from, { text: chunk });
        }
      } catch (err) {
        if (err.message === "timeout") {
          await sock.sendMessage(from, {
            text: "Sorry, I took too long to think. Try again?",
          });
        } else {
          send({ type: "error", error: `Reply failed: ${err.message}` });
        }
      }
    }
  });
}

// ── Read host replies from stdin ────────────────────────────────────────────

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.type === "reply" && msg.to != null) {
      const resolve = pendingReplies.get(msg.to);
      if (resolve) {
        pendingReplies.delete(msg.to);
        resolve(msg.text || "");
      }
    }
  } catch {
    // Ignore malformed input
  }
});

// ── Handle graceful shutdown ────────────────────────────────────────────────

process.on("SIGTERM", () => {
  if (sock) sock.end(undefined);
  process.exit(0);
});
process.on("SIGINT", () => {
  if (sock) sock.end(undefined);
  process.exit(0);
});

// ── Start ───────────────────────────────────────────────────────────────────

try {
  await connectWhatsApp();
} catch (err) {
  send({ type: "error", error: `Failed to start WhatsApp: ${err.message}` });
  process.exit(1);
}
