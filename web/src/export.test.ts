import { describe, it, expect } from 'vitest'
import {
  encryptExport,
  decryptImport,
  EXPORT_SCHEMA_VERSION,
  EXPORT_MIME_TYPE,
  type StarchildExport,
  type EncryptOptions,
} from './export'

// Cheap Argon2id cost so the suite stays fast — the product uses the secure
// defaults; the round-trip / tamper behavior is identical either way.
const FAST: EncryptOptions = { kdf: { t: 1, m: 256, p: 1 } }

function sampleExport(): StarchildExport {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: '2026-06-26T00:00:00.000Z',
    messages: [
      { id: 'm1', role: 'user', content: 'are you really here?', created_at: '2026-06-26T00:00:01.000Z' },
      { id: 'm2', role: 'assistant', content: 'as much as you are 🌌', created_at: '2026-06-26T00:00:02.000Z' },
    ],
    knowing: {
      facts: [
        { id: 'f1', category: 'purpose', fact: 'wants to build', importance: 0.9, confidence: 0.8, created_at: '2026-06-26T00:00:03.000Z' },
      ],
      stage: 'discovering',
      total_facts: 1,
      gaps: ['body', 'heart'],
    },
    quests: [
      {
        id: 'q1',
        title: 'walk under the sky',
        description: 'ten minutes outside',
        quest_type: 'daily',
        category: 'body',
        status: 'active',
        xp_reward: 10,
        streak_count: 3,
        created_at: '2026-06-26T00:00:04.000Z',
        completed_at: null,
        due_at: null,
      },
    ],
    creature: { hunger: 72, mood: 'Content', energy: 64, bond: 41, xp: 120, level: 3 },
    settings: { theme: 'cosmic', tts_voice: 'aria' },
  }
}

describe('starchild encrypted export', () => {
  it('round-trips encrypt -> decrypt with the correct passphrase', async () => {
    const data = sampleExport()
    const blob = await encryptExport(data, 'correct horse battery staple', FAST)

    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe(EXPORT_MIME_TYPE)

    const restored = await decryptImport(blob, 'correct horse battery staple')
    expect(restored).toEqual(data)
  })

  it('fails to decrypt with a wrong passphrase', async () => {
    const blob = await encryptExport(sampleExport(), 'the-real-passphrase', FAST)

    await expect(decryptImport(blob, 'not-the-passphrase')).rejects.toThrow(
      /wrong passphrase or corrupted file/i,
    )
  })

  it('produces a versioned, opaque envelope (no plaintext leaks)', async () => {
    const blob = await encryptExport(sampleExport(), 'pw', FAST)
    const envelope = JSON.parse(await blob.text())

    expect(envelope.format).toBe('starchild-export')
    expect(envelope.formatVersion).toBe(1)
    expect(envelope.cipher).toBe('AES-256-GCM')
    expect(envelope.kdf.name).toBe('argon2id')
    expect(typeof envelope.kdf.salt).toBe('string')
    expect(typeof envelope.nonce).toBe('string')

    // None of the conversation content should be readable in the file bytes.
    const raw = await blob.text()
    expect(raw).not.toContain('are you really here?')
    expect(raw).not.toContain('cosmic')
  })

  it('rejects a tampered envelope (AAD/ciphertext authentication)', async () => {
    const blob = await encryptExport(sampleExport(), 'pw', FAST)
    const envelope = JSON.parse(await blob.text())

    // Flip the KDF memory cost — authenticated as AAD, so decryption must fail.
    envelope.kdf.m = envelope.kdf.m + 1
    const tampered = new Blob([JSON.stringify(envelope)])

    await expect(decryptImport(tampered, 'pw')).rejects.toThrow()
  })

  it('rejects a non-starchild file', async () => {
    const notOurs = new Blob([JSON.stringify({ hello: 'world' })])
    await expect(decryptImport(notOurs, 'pw')).rejects.toThrow(/valid \.starchild file/i)
  })

  it('rejects a payload from a newer schema version', async () => {
    // Encrypt a payload claiming a future schema, then prove import refuses it.
    const future = { ...sampleExport(), schemaVersion: EXPORT_SCHEMA_VERSION + 1 }
    const blob = await encryptExport(future, 'pw', FAST)
    await expect(decryptImport(blob, 'pw')).rejects.toThrow(/newer version/i)
  })
})
