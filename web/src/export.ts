/**
 * export.ts — the encrypted, versioned `.starchild` file (PRD §5)
 *
 * "Switching between desktop and web is a file you own, not a server." A
 * `.starchild` file is a passphrase-encrypted serialization of the core data
 * model (messages, knowing profile, quests, creature state, settings). Because
 * both shells produce/consume the same shapes, web↔desktop interop falls out
 * for free.
 *
 *   passphrase --(Argon2id)--> 256-bit key --(AES-256-GCM)--> encrypted payload
 *
 * Pure-JS crypto only (no native deps): `@noble/hashes` for the KDF and
 * `@noble/ciphers` for the AEAD, so the exact same code runs in the browser and
 * in WASM. There is NO passphrase recovery — the holder owns it.
 */

import { argon2id } from '@noble/hashes/argon2'
import { randomBytes, utf8ToBytes, bytesToUtf8 } from '@noble/hashes/utils'
import { gcm } from '@noble/ciphers/aes'

// ─── Payload shape (mirrors the shared core types) ───────────────────────────

/** Bump when the decrypted payload shape changes; drives forward migrations. */
export const EXPORT_SCHEMA_VERSION = 1 as const

export interface ExportMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface ExportQuest {
  id: string
  title: string
  description: string | null
  quest_type: string
  category: string | null
  status: string
  xp_reward: number
  streak_count: number
  created_at: string
  completed_at: string | null
  due_at: string | null
}

/** The creature (mood / hunger / tick) — `core` StarchildState, sans db ids. */
export interface CreatureState {
  hunger: number
  mood: string
  energy: number
  bond: number
  xp: number
  level: number
}

export interface KnowingFact {
  id: string
  category: string
  fact: string
  importance: number
  confidence: number
  created_at: string
}

/** The structured understanding Starchild has built up (the knowing profile). */
export interface KnowingProfile {
  facts: KnowingFact[]
  stage: string
  total_facts: number
  gaps: string[]
}

/** The full, decrypted contents of a `.starchild` file. */
export interface StarchildExport {
  schemaVersion: number
  exportedAt: string
  messages: ExportMessage[]
  knowing: KnowingProfile
  quests: ExportQuest[]
  creature: CreatureState
  settings: Record<string, string>
  /**
   * The Great Work macro position (hermetic ontology). Optional so files
   * exported before the feature (or from desktop) still import cleanly.
   */
  great_work?: import('../../src/store').GreatWorkPosition | null
}

// ─── On-disk envelope (the bytes of the file) ────────────────────────────────

/** File magic — lets import reject anything that isn't one of ours. */
const MAGIC = 'starchild-export' as const
/** Envelope/crypto version (independent of the payload's `schemaVersion`). */
const FORMAT_VERSION = 1 as const
const CIPHER = 'AES-256-GCM' as const

/** File extension + MIME for the download. */
export const EXPORT_FILE_EXTENSION = '.starchild'
export const EXPORT_MIME_TYPE = 'application/octet-stream'

export interface KdfParams {
  readonly name: 'argon2id'
  /** Time cost (passes). */
  t: number
  /** Memory cost in KiB. */
  m: number
  /** Parallelism. */
  p: number
  /** Derived key length in bytes (32 = AES-256). */
  dkLen: number
}

/**
 * Default Argon2id cost (RFC 9106 / OWASP "second" profile): 64 MiB, 3 passes.
 * Safe at rest even if the file lands in Drive/iCloud. Tests override these to
 * stay fast — the product always uses these.
 */
export const DEFAULT_KDF_PARAMS: KdfParams = {
  name: 'argon2id',
  t: 3,
  m: 64 * 1024,
  p: 1,
  dkLen: 32,
}

const SALT_LEN = 16
const NONCE_LEN = 12 // AES-GCM standard

interface ExportEnvelope {
  format: typeof MAGIC
  formatVersion: number
  kdf: KdfParams & { salt: string }
  cipher: typeof CIPHER
  /** GCM nonce, base64. */
  nonce: string
  /** Encrypted payload, base64. */
  ciphertext: string
}

export interface EncryptOptions {
  /** Override Argon2id cost (mainly for tests). Defaults to {@link DEFAULT_KDF_PARAMS}. */
  kdf?: Partial<Omit<KdfParams, 'name'>>
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Encrypt the core data model into a downloadable, versioned `.starchild` Blob.
 * @throws if the passphrase is empty.
 */
export async function encryptExport(
  data: StarchildExport,
  passphrase: string,
  opts: EncryptOptions = {},
): Promise<Blob> {
  if (!passphrase) {
    throw new Error('A passphrase is required to encrypt a .starchild export.')
  }

  const kdf: KdfParams = { ...DEFAULT_KDF_PARAMS, ...opts.kdf }
  const salt = randomBytes(SALT_LEN)
  const nonce = randomBytes(NONCE_LEN)

  const payload: StarchildExport = {
    ...data,
    schemaVersion: data.schemaVersion ?? EXPORT_SCHEMA_VERSION,
  }
  const plaintext = utf8ToBytes(JSON.stringify(payload))

  // The envelope header (everything but the ciphertext) is authenticated as
  // AAD, so tampering with the KDF params or nonce fails decryption.
  const header = {
    format: MAGIC,
    formatVersion: FORMAT_VERSION,
    kdf: { ...kdf, salt: bytesToBase64(salt) },
    cipher: CIPHER,
    nonce: bytesToBase64(nonce),
  } satisfies Omit<ExportEnvelope, 'ciphertext'>

  const key = deriveKey(passphrase, salt, kdf)
  const ciphertext = gcm(key, nonce, headerAad(header)).encrypt(plaintext)

  const envelope: ExportEnvelope = { ...header, ciphertext: bytesToBase64(ciphertext) }
  return new Blob([JSON.stringify(envelope, null, 2)], { type: EXPORT_MIME_TYPE })
}

/**
 * Decrypt a `.starchild` file back into the core data model.
 * @throws if the file is not a valid envelope, the schema is too new, or the
 *         passphrase is wrong / the file was corrupted (GCM tag mismatch).
 */
export async function decryptImport(
  file: Blob,
  passphrase: string,
): Promise<StarchildExport> {
  const text = await readText(file)

  let env: ExportEnvelope
  try {
    env = JSON.parse(text) as ExportEnvelope
  } catch {
    throw new Error('Not a valid .starchild file (could not parse).')
  }

  if (env?.format !== MAGIC) {
    throw new Error('Not a valid .starchild file (bad format marker).')
  }
  if (env.formatVersion !== FORMAT_VERSION) {
    throw new Error(
      `Unsupported .starchild format version ${env.formatVersion} (this build reads ${FORMAT_VERSION}).`,
    )
  }
  if (env.cipher !== CIPHER) {
    throw new Error(`Unsupported cipher "${env.cipher}".`)
  }

  const salt = base64ToBytes(env.kdf.salt)
  const nonce = base64ToBytes(env.nonce)
  const ciphertext = base64ToBytes(env.ciphertext)
  const key = deriveKey(passphrase, salt, env.kdf)

  let plaintext: Uint8Array
  try {
    plaintext = gcm(key, nonce, headerAad(env)).decrypt(ciphertext)
  } catch {
    // GCM authentication failed — wrong passphrase or a tampered/corrupt file.
    throw new Error('Could not decrypt — wrong passphrase or corrupted file.')
  }

  const payload = JSON.parse(bytesToUtf8(plaintext)) as StarchildExport
  return migrateExport(payload)
}

// ─── Versioning / forward migration (PRD §5) ─────────────────────────────────

/**
 * Bring an older payload up to the current schema. New apps must read old
 * exports; we never have to read a *newer* one, so that's a hard error.
 */
export function migrateExport(payload: StarchildExport): StarchildExport {
  if (typeof payload?.schemaVersion !== 'number') {
    throw new Error('Decrypted payload is missing a schemaVersion.')
  }
  if (payload.schemaVersion > EXPORT_SCHEMA_VERSION) {
    throw new Error(
      `This .starchild file is from a newer version (schema ${payload.schemaVersion} > ${EXPORT_SCHEMA_VERSION}). Update Starchild to import it.`,
    )
  }
  // Only v1 exists today; future versions add their step-up migrations here.
  return payload
}

// ─── Internals ───────────────────────────────────────────────────────────────

function deriveKey(passphrase: string, salt: Uint8Array, kdf: KdfParams): Uint8Array {
  // NFKC-normalize so visually-identical passphrases derive the same key.
  return argon2id(utf8ToBytes(passphrase.normalize('NFKC')), salt, {
    t: kdf.t,
    m: kdf.m,
    p: kdf.p,
    dkLen: kdf.dkLen,
  })
}

/** Deterministic AAD over the header fields (excludes the ciphertext). */
function headerAad(env: Omit<ExportEnvelope, 'ciphertext'>): Uint8Array {
  return utf8ToBytes(
    JSON.stringify({
      format: env.format,
      formatVersion: env.formatVersion,
      kdf: env.kdf,
      cipher: env.cipher,
      nonce: env.nonce,
    }),
  )
}

async function readText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  return new TextDecoder().decode(new Uint8Array(await file.arrayBuffer()))
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
