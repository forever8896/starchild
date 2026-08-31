/**
 * e2ee.ts — Venice end-to-end encryption for the browser (web trial + BYOK).
 *
 * A faithful port of the desktop `core/src/e2ee.rs` wire format, validated to
 * interoperate with the live Venice TDX enclave:
 *
 *   1. Fetch + verify the TEE attestation → the model's secp256k1 public key.
 *   2. Per message: fresh ephemeral secp256k1 key → ECDH → HKDF-SHA256
 *      (info "ecdsa_encryption") → AES-256-GCM.
 *   3. Wire: hex( ephemeral_pub(65) ++ nonce(12) ++ ciphertext+tag ).
 *
 * Responses arrive encrypted the same way (the enclave's ephemeral pub in the
 * first 65 bytes) and are decrypted with our session key. Plaintext only ever
 * exists in this browser and inside the attested enclave — never at the proxy.
 *
 * Crypto: @noble/curves (secp256k1 ECDH — WebCrypto has no secp256k1),
 * @noble/hashes (HKDF-SHA256), @noble/ciphers (AES-256-GCM). All sync.
 */

import { secp256k1 } from '@noble/curves/secp256k1'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha256'
import { keccak_256 } from '@noble/hashes/sha3'
import { gcm } from '@noble/ciphers/aes'

/** The single Venice E2EE model the trial is pinned to. GLM-4.7's confidential
 *  enclave is kept warm (reliably ~2.5s to first token); GLM-5.2's is currently
 *  under-provisioned (10–40s, highly variable), so the trial uses 4.7 for speed.
 *  Both speak the v1 secp256k1 attestation this client implements. */
export const E2EE_MODEL = 'e2ee-glm-4-7-p'

/** Pinned enclave identity — the attestation must attest THIS model on THIS hardware. */
const PIN_UPSTREAM_MODEL = 'z-ai/glm-4.7'
const PIN_TEE_HARDWARE = 'intel-tdx'

/** HKDF info string — must match Venice's server-side derivation. */
const HKDF_INFO = new TextEncoder().encode('ecdsa_encryption')

// ── hex helpers (browser-safe; no Buffer) ────────────────────────────────────
const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))
function toHex(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i++) s += HEX[b[i]]
  return s
}
function fromHex(s: string): Uint8Array {
  const out = new Uint8Array(s.length >> 1)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16)
  return out
}
function randBytes(n: number): Uint8Array {
  const a = new Uint8Array(n)
  crypto.getRandomValues(a)
  return a
}

// ── Session ──────────────────────────────────────────────────────────────────

export class E2eeSession {
  /** Our persistent session public key (uncompressed, hex) — sent so the enclave can reply. */
  readonly clientPubHex: string
  /** The enclave's attested public key (hex) — sent back in a header for routing. */
  readonly modelPubHex: string
  /** When this session's attestation goes stale (epoch ms); re-establish past it. */
  readonly staleAt: number

  #clientPriv: Uint8Array
  #modelPub: Uint8Array

  constructor(modelPubHex: string, staleAt: number) {
    // Normalize: a 128-char key without the uncompressed 04 prefix gets one.
    if (modelPubHex.length === 128 && !modelPubHex.startsWith('04')) modelPubHex = '04' + modelPubHex
    this.modelPubHex = modelPubHex
    this.#modelPub = fromHex(modelPubHex)
    this.#clientPriv = secp256k1.utils.randomPrivateKey()
    this.clientPubHex = toHex(secp256k1.getPublicKey(this.#clientPriv, false))
    this.staleAt = staleAt
  }

  // ECDH(x-coordinate) → HKDF-SHA256 → 32-byte AES key. The compressed shared
  // point is prefix(1)+x(32); the x-coordinate matches k256's raw_secret_bytes.
  #aesKey(sharedCompressed: Uint8Array): Uint8Array {
    const x = sharedCompressed.slice(1, 33)
    return hkdf(sha256, x, undefined, HKDF_INFO, 32)
  }

  /** Encrypt one plaintext message → hex wire string. */
  encrypt(plaintext: string): string {
    const ephPriv = secp256k1.utils.randomPrivateKey()
    const ephPub = secp256k1.getPublicKey(ephPriv, false) // 65 bytes
    const key = this.#aesKey(secp256k1.getSharedSecret(ephPriv, this.#modelPub, true))
    const nonce = randBytes(12)
    const ct = gcm(key, nonce).encrypt(new TextEncoder().encode(plaintext)) // ct ++ tag(16)
    const wire = new Uint8Array(65 + 12 + ct.length)
    wire.set(ephPub, 0)
    wire.set(nonce, 65)
    wire.set(ct, 77)
    return toHex(wire)
  }

  /** Decrypt one hex wire chunk from the enclave → plaintext. Throws on non-ciphertext. */
  decrypt(ciphertextHex: string): string {
    const raw = fromHex(ciphertextHex)
    if (raw.length < 65 + 12 + 1) throw new Error('e2ee: ciphertext too short')
    const serverPub = raw.slice(0, 65)
    const nonce = raw.slice(65, 77)
    const ct = raw.slice(77)
    const key = this.#aesKey(secp256k1.getSharedSecret(this.#clientPriv, serverPub, true))
    return new TextDecoder().decode(gcm(key, nonce).decrypt(ct))
  }
}

// ── Establishment (attestation via a relay URL) ──────────────────────────────

/** Shape we read from the attestation relay (a subset of Venice's response). */
interface Attestation {
  signing_public_key?: string
  signing_key?: string
  verified?: boolean
  nonce?: string
  stale_after?: number // epoch seconds
  freshness?: { stale_after?: number }
  tee_hardware?: string
  upstream_model?: string
  signing_address?: string
  server_verification?: ServerVerification
}

/** Venice's own DCAP verification result (Intel-root quote check performed server-side). */
interface ServerVerification {
  tdx?: {
    valid?: boolean
    signatureValid?: boolean
    certificateChainValid?: boolean
    rootCaPinned?: boolean
    attestationKeyMatch?: boolean
    crlCheck?: { checked?: boolean; revoked?: boolean }
  }
  nvidia?: { valid?: boolean; signatureVerified?: boolean }
  nonceBinding?: { bound?: boolean }
  signingAddressBinding?: { reportDataAddress?: string }
}

/** Ethereum-style address of an uncompressed secp256k1 key: keccak256(pub[1:])[-20:]. */
function keyAddress(pubHex: string): string {
  const pub = fromHex(pubHex.startsWith('04') ? pubHex : '04' + pubHex)
  return '0x' + toHex(keccak_256(pub.slice(1)).slice(-20))
}

/**
 * Verify the attestation before trusting the enclave key. This is defense-in-depth
 * for the web trial — read the trust model carefully:
 *
 *   LOCALLY VERIFIED (real crypto, can't be faked by the relay):
 *     • the key we'll encrypt to is the one bound into the quote's report_data
 *       (keccak256(signing_key) === reportDataAddress).
 *
 *   PINNED (a relay can't silently swap these without us noticing):
 *     • the attested upstream model is GLM-4.7 and the hardware is Intel TDX.
 *
 *   TRUSTED FROM VENICE (their server-side Intel-root DCAP result):
 *     • the TDX quote signature + PCK cert chain are valid, root CA pinned, not
 *       CRL-revoked; the NVIDIA GPU attestation is valid; the nonce is bound.
 *
 * What this does NOT yet do: re-verify the raw TDX quote signature against a
 * pinned Intel root IN THE BROWSER. That is the only thing that would stop a
 * fully forging relay — and on the web it has a ceiling anyway, since our origin
 * serves this very verifier. Full local DCAP (and it matters most on the desktop
 * fixed binary) is the labeled next step.
 */
function verifyAttestation(att: Attestation, expectedNonce: string): void {
  if (att.verified === false) throw new Error('e2ee: attestation not verified')
  if (att.nonce && att.nonce !== expectedNonce) throw new Error('e2ee: attestation nonce mismatch')

  if (att.tee_hardware && att.tee_hardware !== PIN_TEE_HARDWARE)
    throw new Error(`e2ee: unexpected TEE hardware ${att.tee_hardware}`)
  if (att.upstream_model && att.upstream_model !== PIN_UPSTREAM_MODEL)
    throw new Error(`e2ee: unexpected upstream model ${att.upstream_model}`)

  const sv = att.server_verification
  if (sv) {
    const t = sv.tdx
    if (!(t?.valid && t.signatureValid && t.certificateChainValid && t.rootCaPinned && t.attestationKeyMatch))
      throw new Error('e2ee: TDX attestation did not fully verify')
    if (!(t.crlCheck?.checked && t.crlCheck.revoked === false))
      throw new Error('e2ee: TDX certificate CRL check failed')
    if (!(sv.nvidia?.valid && sv.nvidia.signatureVerified))
      throw new Error('e2ee: GPU attestation did not verify')
    if (sv.nonceBinding && sv.nonceBinding.bound === false)
      throw new Error('e2ee: attestation nonce not bound into the quote')

    // Local crypto: the key we encrypt to must be the one bound in report_data.
    const bound = sv.signingAddressBinding?.reportDataAddress
    const modelPub = att.signing_public_key || att.signing_key
    if (bound && modelPub && keyAddress(modelPub).toLowerCase() !== bound.toLowerCase())
      throw new Error('e2ee: signing key not bound to report_data')
  }
}

/**
 * Establish a session by fetching the attestation from `attestUrl` (our proxy
 * relays it with the trial key injected, or Venice directly for BYOK). We verify
 * the nonce echo and the `verified` flag, then bind to the attested key.
 *
 * Verification (see {@link verifyAttestation}): the key↔report_data binding is
 * checked locally with real crypto; the model + hardware are pinned; Venice's
 * Intel-root DCAP result is required. Re-verifying the raw TDX quote in-browser
 * (the only thing that stops a fully forging relay) is the labeled next step.
 */
export async function establishE2eeSession(
  attestUrl: string,
  opts: { model?: string; signal?: AbortSignal } = {},
): Promise<E2eeSession> {
  const model = opts.model ?? E2EE_MODEL
  const nonce = toHex(randBytes(32))
  const url = `${attestUrl}?model=${encodeURIComponent(model)}&nonce=${nonce}`

  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: opts.signal })
  if (!res.ok) throw new Error(`e2ee: attestation failed (HTTP ${res.status})`)
  const att = (await res.json()) as Attestation

  verifyAttestation(att, nonce)

  const modelPubHex = att.signing_public_key || att.signing_key
  if (!modelPubHex) throw new Error('e2ee: attestation missing signing key')

  // Refresh a minute before Venice marks it stale (default ~50 min out).
  const staleAfterSec = att.stale_after ?? att.freshness?.stale_after
  const staleAt = staleAfterSec ? staleAfterSec * 1000 - 60_000 : Date.now() + 50 * 60_000
  return new E2eeSession(modelPubHex, staleAt)
}
