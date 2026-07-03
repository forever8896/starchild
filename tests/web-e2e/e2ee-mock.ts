/**
 * e2ee-mock.ts — a deterministic MOCK ENCLAVE for the web E2E suite.
 *
 * The trial tier is end-to-end encrypted and FAILS CLOSED: `sendMessage`
 * refuses to send anything until an attested E2EE session exists. So the specs
 * can't just stub `/api/proxy` with plaintext SSE anymore — the client would
 * (correctly) refuse to talk. Instead this module plays the enclave's role with
 * REAL crypto (the same secp256k1-ECDH → HKDF-SHA256 → AES-256-GCM wire format
 * as `web/src/e2ee.ts`), which means the suite now exercises the app's actual
 * encrypt → relay → decrypt path deterministically:
 *
 *   • `attestationBody(nonce)` — an attestation JSON that passes the client's
 *     `verifyAttestation` (nonce echo, pins, all-green DCAP result, and a
 *     genuinely matching keccak key↔report_data binding).
 *   • `enclaveDecrypt(wireHex)` — open a client-encrypted message.
 *   • `sseStreamEncrypted(text, clientPubHex)` — chunk + encrypt a reply the
 *     way the enclave streams it, for `route.fulfill`.
 *
 * Keys are generated fresh per test run; no fixtures to go stale.
 */

import { secp256k1 } from '@noble/curves/secp256k1'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha256'
import { keccak_256 } from '@noble/hashes/sha3'
import { gcm } from '@noble/ciphers/aes'
import { randomBytes, webcrypto } from 'node:crypto'

const HKDF_INFO = new TextEncoder().encode('ecdsa_encryption')

const toHex = (b: Uint8Array): string => Buffer.from(b).toString('hex')
const fromHex = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'hex'))

// ── The mock enclave's identity (fresh per import/run) ───────────────────────

const enclavePriv = secp256k1.utils.randomPrivateKey()
const enclavePubHex = toHex(secp256k1.getPublicKey(enclavePriv, false))

/** Ethereum-style address binding: keccak256(pub[1:])[-20:] — must match the
 *  client's `keyAddress` so the local report_data check passes for real. */
const enclaveAddress = '0x' + toHex(keccak_256(fromHex(enclavePubHex).slice(1)).slice(-20))

function aesKey(sharedCompressed: Uint8Array): Uint8Array {
  return hkdf(sha256, sharedCompressed.slice(1, 33), undefined, HKDF_INFO, 32)
}

// ── Attestation ───────────────────────────────────────────────────────────────

/** Attestation response body that passes `verifyAttestation` in `web/src/e2ee.ts`. */
export function attestationBody(nonce: string): Record<string, unknown> {
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
        valid: true,
        signatureValid: true,
        certificateChainValid: true,
        rootCaPinned: true,
        attestationKeyMatch: true,
        crlCheck: { checked: true, revoked: false },
      },
      nvidia: { valid: true, signatureVerified: true },
      nonceBinding: { bound: true },
      signingAddressBinding: { reportDataAddress: enclaveAddress },
    },
  }
}

// ── Wire crypto (mirrors web/src/e2ee.ts byte-for-byte) ──────────────────────

/** Decrypt one client→enclave message: wire = ephPub(65) ++ nonce(12) ++ ct. */
export function enclaveDecrypt(wireHex: string): string {
  const raw = fromHex(wireHex.trim())
  if (raw.length < 65 + 12 + 1) throw new Error('mock enclave: wire too short')
  const ephPub = raw.slice(0, 65)
  const nonce = raw.slice(65, 77)
  const ct = raw.slice(77)
  const key = aesKey(secp256k1.getSharedSecret(enclavePriv, ephPub, true))
  return new TextDecoder().decode(gcm(key, nonce).decrypt(ct))
}

/** Encrypt one enclave→client chunk (fresh ephemeral per chunk, as Venice does). */
export function enclaveEncrypt(clientPubHex: string, text: string): string {
  const clientPub = fromHex(clientPubHex)
  const ephPriv = secp256k1.utils.randomPrivateKey()
  const ephPub = secp256k1.getPublicKey(ephPriv, false)
  const key = aesKey(secp256k1.getSharedSecret(ephPriv, clientPub, true))
  const nonce = new Uint8Array(randomBytes(12))
  const ct = gcm(key, nonce).encrypt(new TextEncoder().encode(text))
  const wire = new Uint8Array(65 + 12 + ct.length)
  wire.set(ephPub, 0)
  wire.set(nonce, 65)
  wire.set(ct, 77)
  return toHex(wire)
}

// ── SSE builders ─────────────────────────────────────────────────────────────

/** Chunk text word-ish and emit each as an ENCRYPTED OpenAI/Venice SSE delta. */
export function sseStreamEncrypted(text: string, clientPubHex: string): string {
  const chunks = text.match(/\S+\s*/g) ?? [text]
  const body = chunks
    .map((c) =>
      `data: ${JSON.stringify({ choices: [{ delta: { content: enclaveEncrypt(clientPubHex, c) } }] })}\n\n`,
    )
    .join('')
  return `${body}data: [DONE]\n\n`
}

/** Plaintext SSE (kept for non-E2EE requests, e.g. `E2EE_TRIAL=false` runs). */
export function sseStreamPlain(text: string): string {
  const chunks = text.match(/\S+\s*/g) ?? [text]
  const body = chunks
    .map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`)
    .join('')
  return `${body}data: [DONE]\n\n`
}

/**
 * Decode a proxy request body: if it's an E2EE payload, decrypt every message
 * so spec logic can route on plaintext; hand back the client pubkey for the
 * encrypted reply. Plaintext bodies pass through unchanged.
 */
export function openProxyRequest(body: {
  e2ee?: boolean
  clientPubHex?: string
  messages?: Array<{ role: string; content: string }>
}): { messages: Array<{ role: string; content: string }>; clientPubHex: string | null } {
  const messages = body.messages ?? []
  if (body.e2ee !== true) return { messages, clientPubHex: null }
  return {
    messages: messages.map((m) => ({ role: m.role, content: enclaveDecrypt(m.content) })),
    clientPubHex: body.clientPubHex ?? null,
  }
}

// ── Intro skip ────────────────────────────────────────────────────────────────

/**
 * Pre-seed the "intro seen" flag so the genesis cinematic (a full-screen
 * tap-to-begin overlay, shown once per session) doesn't intercept pointer
 * events during specs. The intro itself gets its own dedicated spec.
 */
export async function skipIntro(page: {
  addInitScript: (fn: () => void) => Promise<void>
}): Promise<void> {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('starchild_intro_seen', '1')
    } catch {
      /* private mode — the intro will show; specs there would need the tap */
    }
  })
}

// Sanity: webcrypto presence (noble's randomness uses it in some paths).
void webcrypto
