/**
 * venice-proxy.ts — the browser inference client (PRD §4.5, §6).
 *
 * All networking is JS (the WASM core is pure logic only), so token streaming,
 * timeouts and error handling live here. `streamChat()` yields response tokens
 * as they arrive and supports the two private inference tiers:
 *
 *   • TRIAL  — POST to our own no-logging proxy (`web/api/proxy.ts`). The proxy
 *              holds the demo key, pins a cheap model, rate-limits per IP and
 *              caps monthly spend. The client only sends conversation content;
 *              the model + token cap are dictated server-side. When the monthly
 *              budget is spent the proxy answers with a calm "rest mode" reply
 *              (JSON, not SSE) which we surface as a normal assistant message.
 *
 *   • BYOK   — POST straight to Venice's chat-completions endpoint with the
 *              user's own key (kept in the browser, never sent to us). Free for
 *              us, fully private.
 *
 * Both tiers stream OpenAI/Venice-style SSE: lines of `data: {…}` separated by
 * blank lines, terminated by `data: [DONE]`. We parse the stream and yield each
 * `choices[].delta.content` chunk.
 */

import type { ChatMessage } from "./wasm-bridge";

// ── Public surface ───────────────────────────────────────────────────────────

export type InferenceMode = "trial" | "byok";

/** Default Venice REST base — overridable for BYOK (e.g. a regional endpoint). */
export const DEFAULT_VENICE_BASE_URL = "https://api.venice.ai/api/v1";
/** Default model for BYOK requests (a solid, widely-available Venice model). */
export const DEFAULT_BYOK_MODEL = "llama-3.3-70b";
/** Where the trial proxy lives (a same-origin Edge function). */
export const DEFAULT_PROXY_URL = "/api/proxy";

export interface StreamChatOptions {
  /** Which inference tier to use. */
  mode: InferenceMode;
  /** BYOK only: the user's Venice key (stays in the browser). Required for BYOK. */
  apiKey?: string;
  /** BYOK only: model id. Defaults to {@link DEFAULT_BYOK_MODEL}. */
  model?: string;
  /** Sampling temperature (the trial proxy clamps this to its own range). */
  temperature?: number;
  /** TRIAL only: proxy endpoint. Defaults to {@link DEFAULT_PROXY_URL}. */
  proxyUrl?: string;
  /** BYOK only: Venice base URL. Defaults to {@link DEFAULT_VENICE_BASE_URL}. */
  baseUrl?: string;
  /** Abort the request (e.g. user cancels or the component unmounts). */
  signal?: AbortSignal;
}

/** Reasons a stream can fail, so the UI can react (retry, prompt for a key, …). */
export type VeniceErrorCode =
  | "config" // bad options (e.g. BYOK without a key)
  | "rate_limited" // proxy 429
  | "unavailable" // proxy 503 (fail-closed / misconfigured)
  | "auth" // 401/403 — bad or missing key
  | "http" // any other non-OK HTTP status
  | "network" // fetch threw (offline, DNS, CORS, …)
  | "aborted" // the caller's AbortSignal fired
  | "protocol"; // a 200 we couldn't make sense of (no body / bad shape)

export class VeniceError extends Error {
  readonly code: VeniceErrorCode;
  /** HTTP status, when the failure came from a response. */
  readonly status?: number;

  constructor(code: VeniceErrorCode, message: string, status?: number) {
    super(message);
    this.name = "VeniceError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Stream an assistant reply token-by-token.
 *
 * @param messages Full conversation (system + turns) as `{ role, content }`.
 * @param opts     Tier selection + per-tier configuration.
 * @returns An async iterable of content deltas (concatenate them for the reply).
 * @throws {VeniceError} on configuration, HTTP, network or protocol failures.
 */
export async function* streamChat(
  messages: ChatMessage[],
  opts: StreamChatOptions,
): AsyncIterable<string> {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new VeniceError(
      "config",
      "streamChat requires at least one message.",
    );
  }

  const response =
    opts.mode === "trial"
      ? await postTrial(messages, opts)
      : await postByok(messages, opts);

  // The proxy answers "rest mode" (and all errors) as JSON rather than SSE.
  // A successful BYOK/trial stream is `text/event-stream`. Branch on that so we
  // can surface the calm rest-mode message instead of trying to parse SSE.
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    yield* handleNonStreamBody(response);
    return;
  }

  if (!response.body) {
    throw new VeniceError(
      "protocol",
      "Inference response had no body to stream.",
    );
  }

  yield* parseSse(response.body, opts.signal);
}

// ── Transport ────────────────────────────────────────────────────────────────

async function postTrial(
  messages: ChatMessage[],
  opts: StreamChatOptions,
): Promise<Response> {
  // The proxy dictates model + token cap + streaming; we send only content.
  return doFetch(
    opts.proxyUrl ?? DEFAULT_PROXY_URL,
    { "Content-Type": "application/json" },
    { messages, temperature: opts.temperature },
    opts.signal,
  );
}

async function postByok(
  messages: ChatMessage[],
  opts: StreamChatOptions,
): Promise<Response> {
  const apiKey = opts.apiKey?.trim();
  if (!apiKey) {
    throw new VeniceError(
      "config",
      "A Venice API key is required for BYOK inference.",
    );
  }
  const base = (opts.baseUrl ?? DEFAULT_VENICE_BASE_URL).replace(/\/+$/, "");
  return doFetch(
    `${base}/chat/completions`,
    { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    {
      model: opts.model ?? DEFAULT_BYOK_MODEL,
      messages,
      temperature: opts.temperature ?? 0.7,
      stream: true,
      stream_options: { include_usage: true },
    },
    opts.signal,
  );
}

async function doFetch(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Accept: "text/event-stream", ...headers },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (isAbort(err, signal))
      throw new VeniceError("aborted", "Inference request was cancelled.");
    throw new VeniceError(
      "network",
      `Could not reach the inference endpoint: ${errMsg(err)}`,
    );
  }

  if (!res.ok) throw await httpError(res);
  return res;
}

/** Build a typed error from a non-OK response, reading the JSON `{ error }` if present. */
async function httpError(res: Response): Promise<VeniceError> {
  const detail = await readErrorDetail(res);
  const code: VeniceErrorCode =
    res.status === 429
      ? "rate_limited"
      : res.status === 503
        ? "unavailable"
        : res.status === 401 || res.status === 403
          ? "auth"
          : "http";
  return new VeniceError(
    code,
    detail ?? `Inference request failed (HTTP ${res.status}).`,
    res.status,
  );
}

async function readErrorDetail(res: Response): Promise<string | undefined> {
  try {
    const text = await res.text();
    if (!text) return undefined;
    try {
      const obj = JSON.parse(text) as { error?: unknown; message?: unknown };
      const msg = obj?.error ?? obj?.message;
      if (typeof msg === "string" && msg) return msg;
      if (msg && typeof msg === "object" && "message" in msg) {
        const inner = (msg as { message?: unknown }).message;
        if (typeof inner === "string" && inner) return inner;
      }
    } catch {
      // Not JSON — fall through to the raw text.
    }
    return text.slice(0, 500);
  } catch {
    return undefined;
  }
}

// ── Non-stream bodies (rest mode + defensive fallbacks) ──────────────────────

/**
 * A 200 that isn't an SSE stream. The proxy uses this shape for "rest mode"
 * (`{ restMode: true, message }`); we render that message as a normal reply so
 * the user sees a calm explanation rather than an error. A non-streamed chat
 * completion (`choices[].message.content`) is also tolerated, just in case an
 * upstream ignores `stream: true`.
 */
async function* handleNonStreamBody(res: Response): AsyncIterable<string> {
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new VeniceError(
      "protocol",
      "Inference returned a non-streaming, unparseable response.",
    );
  }

  const obj = payload as {
    restMode?: unknown;
    message?: unknown;
    error?: unknown;
    choices?: Array<{ message?: { content?: unknown } }>;
  };

  if (obj?.restMode) {
    if (typeof obj.message === "string" && obj.message) {
      yield obj.message;
      return;
    }
    throw new VeniceError(
      "unavailable",
      "The free trial is resting (monthly budget reached).",
    );
  }

  if (typeof obj?.error === "string" && obj.error) {
    throw new VeniceError("http", obj.error);
  }

  const whole = obj?.choices?.[0]?.message?.content;
  if (typeof whole === "string" && whole) {
    yield whole;
    return;
  }

  throw new VeniceError(
    "protocol",
    "Inference returned an unexpected response shape.",
  );
}

// ── SSE parsing ──────────────────────────────────────────────────────────────

/**
 * Parse an OpenAI/Venice SSE stream and yield `delta.content` chunks.
 *
 * Robust to chunk boundaries falling mid-line: bytes are decoded incrementally
 * and only complete lines (split on `\n`) are processed; the remainder is held
 * until more arrives. Terminates on `data: [DONE]` or end of stream.
 */
async function* parseSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (err) {
        if (isAbort(err, signal)) {
          throw new VeniceError("aborted", "Inference stream was cancelled.");
        }
        throw new VeniceError(
          "network",
          `Inference stream broke: ${errMsg(err)}`,
        );
      }

      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });

      let newlineAt: number;
      while ((newlineAt = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineAt).trim();
        buffer = buffer.slice(newlineAt + 1);

        const token = parseSseLine(line);
        if (token === DONE) return;
        if (token) yield token;
      }
    }

    // Flush any trailing line with no terminating newline.
    const tail = parseSseLine(buffer.trim());
    if (tail && tail !== DONE) yield tail;
  } finally {
    // Free the connection if we stop early (e.g. the consumer breaks out).
    reader.cancel().catch(() => {});
  }
}

const DONE = Symbol("sse-done");

/**
 * Turn one SSE line into a content delta, the {@link DONE} sentinel, or null
 * (comments, blank lines, non-`data:` fields, keep-alives, unparseable chunks).
 */
function parseSseLine(line: string): string | typeof DONE | null {
  if (!line || line.startsWith(":")) return null; // blank or comment/keep-alive
  if (!line.startsWith("data:")) return null; // ignore event:/id:/retry: fields

  const data = line.slice("data:".length).trim();
  if (data === "[DONE]") return DONE;
  if (!data) return null;

  let chunk: {
    choices?: Array<{ delta?: { content?: unknown } }>;
    error?: unknown;
  };
  try {
    chunk = JSON.parse(data);
  } catch {
    return null; // partial/garbled JSON — skip rather than crash the stream
  }

  // Some providers stream an error object mid-stream; surface it.
  if (chunk?.error) {
    const msg =
      typeof chunk.error === "string"
        ? chunk.error
        : (chunk.error as { message?: string })?.message;
    throw new VeniceError("http", msg || "Inference stream reported an error.");
  }

  const content = chunk?.choices?.[0]?.delta?.content;
  return typeof content === "string" && content.length > 0 ? content : null;
}

// ── Small helpers ────────────────────────────────────────────────────────────

function isAbort(err: unknown, signal?: AbortSignal): boolean {
  return (
    (err instanceof Error && err.name === "AbortError") ||
    signal?.aborted === true
  );
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
