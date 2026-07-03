/**
 * venice-proxy.test.ts — the streaming client's highest-risk paths.
 *
 * Covers what the deep audit found untested:
 *   • SSE parsing: token yield, chunk-boundary reassembly, [DONE] termination
 *   • non-stream bodies: rest-mode JSON surfaced as a normal reply
 *   • typed errors: 429 → rate_limited, 503 → unavailable
 *   • the E2EE trial path END TO END at unit level: outbound content is
 *     ciphertext the proxy can't read, inbound encrypted deltas decrypt, and an
 *     all-undecryptable stream THROWS (never a silent blank reply)
 *   • attestation verification (via `establishE2eeSession`): accepts a genuine
 *     attestation, rejects key-swap / model-swap / failed-DCAP tampering
 *
 * A mock enclave with REAL wire crypto (same secp256k1-ECDH → HKDF-SHA256 →
 * AES-256-GCM format as e2ee.ts) plays Venice's role; `fetch` is stubbed.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { secp256k1 } from '@noble/curves/secp256k1'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha256'
import { keccak_256 } from '@noble/hashes/sha3'
import { gcm } from '@noble/ciphers/aes'
import { streamChat, establishE2eeSession, E2eeSession } from './venice-proxy'
import type { ChatMessage } from './wasm-bridge'

// ── tiny helpers ──────────────────────────────────────────────────────────────

const toHex = (b: Uint8Array): string => Buffer.from(b).toString('hex')
const fromHex = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'hex'))
const HKDF_INFO = new TextEncoder().encode('ecdsa_encryption')

const MSGS: ChatMessage[] = [{ role: 'user', content: 'hello there, little star' }]

function sseResponse(chunks: string[]): Response {
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch))
      c.close()
    },
  })
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  })
}

const delta = (content: string): string =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`

async function collect(iter: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = []
  for await (const t of iter) out.push(t)
  return out
}

afterEach(() => vi.unstubAllGlobals())

// ── mock enclave (real wire crypto) ──────────────────────────────────────────

const enclavePriv = secp256k1.utils.randomPrivateKey()
const enclavePubHex = toHex(secp256k1.getPublicKey(enclavePriv, false))
const enclaveAddress = '0x' + toHex(keccak_256(fromHex(enclavePubHex).slice(1)).slice(-20))

const aesKey = (shared: Uint8Array): Uint8Array => hkdf(sha256, shared.slice(1, 33), undefined, HKDF_INFO, 32)

function enclaveEncrypt(clientPubHex: string, text: string): string {
  const ephPriv = secp256k1.utils.randomPrivateKey()
  const ephPub = secp256k1.getPublicKey(ephPriv, false)
  const key = aesKey(secp256k1.getSharedSecret(ephPriv, fromHex(clientPubHex), true))
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const ct = gcm(key, nonce).encrypt(new TextEncoder().encode(text))
  const wire = new Uint8Array(65 + 12 + ct.length)
  wire.set(ephPub, 0); wire.set(nonce, 65); wire.set(ct, 77)
  return toHex(wire)
}

function enclaveDecrypt(wireHex: string): string {
  const raw = fromHex(wireHex)
  const key = aesKey(secp256k1.getSharedSecret(enclavePriv, raw.slice(0, 65), true))
  return new TextDecoder().decode(gcm(key, raw.slice(65, 77)).decrypt(raw.slice(77)))
}

function attestation(overrides: Record<string, unknown> = {}, nonce = ''): Record<string, unknown> {
  return {
    signing_public_key: enclavePubHex,
    verified: true,
    nonce,
    model: 'e2ee-glm-4-7-p',
    stale_after: Math.floor(Date.now() / 1000) + 3600,
    tee_hardware: 'intel-tdx',
    upstream_model: 'z-ai/glm-4.7',
    signing_address: enclaveAddress,
    server_verification: {
      tdx: {
        valid: true, signatureValid: true, certificateChainValid: true,
        rootCaPinned: true, attestationKeyMatch: true,
        crlCheck: { checked: true, revoked: false },
      },
      nvidia: { valid: true, signatureVerified: true },
      nonceBinding: { bound: true },
      signingAddressBinding: { reportDataAddress: enclaveAddress },
    },
    ...overrides,
  }
}

/** Stub fetch to serve the attestation (echoing the requested nonce) for any URL. */
function stubAttestFetch(overrides: Record<string, unknown> = {}): void {
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    const nonce = new URL(String(url), 'http://x').searchParams.get('nonce') ?? ''
    return new Response(JSON.stringify(attestation(overrides, nonce)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }))
}

// ── SSE parsing (plaintext trial) ─────────────────────────────────────────────

describe('streamChat — SSE parsing', () => {
  it('yields deltas in order and stops at [DONE]', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      sseResponse([delta('hello '), delta('little '), delta('star'), 'data: [DONE]\n\n']),
    ))
    expect(await collect(streamChat(MSGS, { mode: 'trial' }))).toEqual(['hello ', 'little ', 'star'])
  })

  it('reassembles a data: line split across chunk boundaries', async () => {
    const line = delta('one whole token')
    const mid = Math.floor(line.length / 2)
    vi.stubGlobal('fetch', vi.fn(async () =>
      sseResponse([line.slice(0, mid), line.slice(mid) + delta('then more') + 'data: [DONE]\n\n']),
    ))
    expect(await collect(streamChat(MSGS, { mode: 'trial' }))).toEqual(['one whole token', 'then more'])
  })

  it('surfaces the rest-mode JSON body as a single calm reply', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ restMode: true, message: 'Starchild is resting.' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ))
    expect(await collect(streamChat(MSGS, { mode: 'trial' }))).toEqual(['Starchild is resting.'])
  })

  it('maps 429 to a typed rate_limited error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })))
    await expect(collect(streamChat(MSGS, { mode: 'trial' }))).rejects.toMatchObject({ code: 'rate_limited' })
  })

  it('maps 503 to a typed unavailable error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
    await expect(collect(streamChat(MSGS, { mode: 'trial' }))).rejects.toMatchObject({ code: 'unavailable' })
  })
})

// ── E2EE trial path ───────────────────────────────────────────────────────────

describe('streamChat — E2EE trial', () => {
  const session = new E2eeSession(enclavePubHex, Date.now() + 3600_000)

  it('sends ONLY ciphertext outbound (the proxy cannot read the words)', async () => {
    let posted: { e2ee?: boolean; clientPubHex?: string; messages?: ChatMessage[] } = {}
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
      posted = JSON.parse(String(init?.body))
      return sseResponse(['data: [DONE]\n\n'])
    }))
    await collect(streamChat(MSGS, { mode: 'trial', e2eeSession: session }))

    expect(posted.e2ee).toBe(true)
    expect(posted.clientPubHex).toBe(session.clientPubHex)
    const wire = posted.messages![0].content
    expect(wire).not.toContain('hello')          // not plaintext
    expect(wire).toMatch(/^[0-9a-f]+$/)          // hex ciphertext
    expect(enclaveDecrypt(wire)).toBe(MSGS[0].content) // the enclave CAN read it
  })

  it('decrypts enclave-encrypted deltas back to plaintext', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      sseResponse([
        delta(enclaveEncrypt(session.clientPubHex, 'as much ')),
        delta(enclaveEncrypt(session.clientPubHex, 'as you are')),
        'data: [DONE]\n\n',
      ]),
    ))
    expect(await collect(streamChat(MSGS, { mode: 'trial', e2eeSession: session })))
      .toEqual(['as much ', 'as you are'])
  })

  it('THROWS when a stream delivers content but nothing decrypts (no silent blank reply)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      sseResponse([delta('deadbeef'.repeat(30)), delta('cafebabe'.repeat(30)), 'data: [DONE]\n\n']),
    ))
    await expect(collect(streamChat(MSGS, { mode: 'trial', e2eeSession: session })))
      .rejects.toMatchObject({ code: 'protocol' })
  })
})

// ── Attestation verification (establishE2eeSession) ──────────────────────────

describe('establishE2eeSession — attestation verification', () => {
  const URL_ = 'http://mock.test/api/attest'

  it('accepts a genuine attestation and derives a working session', async () => {
    stubAttestFetch()
    const s = await establishE2eeSession(URL_)
    // round-trip: what the session encrypts, the enclave can decrypt
    expect(enclaveDecrypt(s.encrypt('secret words'))).toBe('secret words')
    expect(s.staleAt).toBeGreaterThan(Date.now())
  })

  it('rejects a swapped signing key (key↔report_data binding is checked locally)', async () => {
    const rogue = toHex(secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey(), false))
    stubAttestFetch({ signing_public_key: rogue }) // reportDataAddress still binds the REAL key
    await expect(establishE2eeSession(URL_)).rejects.toThrow(/not bound to report_data/)
  })

  it('rejects an upstream model swap', async () => {
    stubAttestFetch({ upstream_model: 'some-cheaper-model' })
    await expect(establishE2eeSession(URL_)).rejects.toThrow(/unexpected upstream model/)
  })

  it('rejects a failed DCAP verification', async () => {
    stubAttestFetch({
      server_verification: {
        ...(attestation().server_verification as Record<string, unknown>),
        tdx: {
          valid: true, signatureValid: false, certificateChainValid: true,
          rootCaPinned: true, attestationKeyMatch: true,
          crlCheck: { checked: true, revoked: false },
        },
      },
    })
    await expect(establishE2eeSession(URL_)).rejects.toThrow(/did not fully verify/)
  })
})
