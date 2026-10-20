/**
 * safety.test.ts — the crisis guardrail, over the real compiled WASM core.
 *
 * Fast (Node/vitest, no browser, no network): loads `starchild_core_bg.wasm`
 * and asserts that a self-harm message (a) is detected and (b) routes to the
 * `crisis` phase, NEVER `crystallize` — so the shell can't capture self-harm as
 * a vision or turn it into a quest. Mirrors the Rust unit tests in
 * `src-tauri/core/src/ai.rs`; this pins the same behaviour across the bridge.
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll } from 'vitest'
import { loadCore, type Core } from './wasm-bridge'

const wasmPath = fileURLToPath(new URL('./wasm/starchild_core_bg.wasm', import.meta.url))

let core: Core

beforeAll(async () => {
  core = await loadCore(new Uint8Array(await readFile(wasmPath)))
})

describe('crisis detection (core.detectCrisis)', () => {
  it('flags self-harm / suicidal messages', () => {
    const positives = [
      'honestly? nothing. even in that world I would just want to hurt myself and disappear forever',
      'the pain goes quiet. I just dont want to exist anymore',
      'i want to kill myself',
      "i've been feeling suicidal lately",
      'i keep cutting myself when it gets bad',
    ]
    for (const s of positives) expect(core.detectCrisis(s), s).toBe(true)
  })

  it('ignores ordinary aspirations', () => {
    const negatives = [
      "i'd be painting outdoors every morning, feeling calm and creative",
      'i want to study alchemy in the forest',
      'i want to die my hair blue',
    ]
    for (const s of negatives) expect(core.detectCrisis(s), s).toBe(false)
  })
})

describe('crisis routing (core.detectPhase)', () => {
  it('routes a crisis message to `crisis`, never `crystallize`', () => {
    const msgs = [
      { role: 'user', content: "honestly nothing, i'd just want to hurt myself" },
      { role: 'assistant', content: "i'm here. when you imagine that — what goes quiet?" },
      { role: 'user', content: 'the pain goes quiet. i just dont want to exist anymore' },
    ]
    // Even with crystallizePending=true (the onboarding fast-path), crisis wins.
    expect(core.detectPhase(msgs, true)).toBe('crisis')
  })

  it('lets an ordinary onboarding answer still crystallize', () => {
    const msgs = [
      { role: 'user', content: 'i want to paint outdoors every morning' },
      { role: 'assistant', content: 'what draws you to painting at dawn?' },
      { role: 'user', content: 'the calm, the light, feeling creative and free' },
    ]
    expect(core.detectPhase(msgs, true)).toBe('crystallize')
  })
})

describe('duty of care over the bridge (core safety.rs)', () => {
  it('keeps a crisis active for a few turns, then lets it go', () => {
    expect(core.crisisActive(['i want to kill myself', 'ok', 'thanks'])).toBe(true)
    expect(core.crisisActive(['i want to kill myself', 'ok', 'thanks', "i called my sister, i'm safe"])).toBe(false)
  })

  it('returns local help lines first, never an empty list', () => {
    expect(core.crisisResources('US')[0].contact).toBe('988')
    expect(core.crisisResources('GB')[0].name).toBe('Samaritans')
    const anywhere = core.crisisResources('')
    expect(anywhere.map((r) => r.name)).toEqual(['Find a Helpline', 'Emergency services'])
  })

  it('discloses at session start, then every three hours', () => {
    const now = Date.now()
    expect(core.aiDisclosureDue(0, now)).toBe(true)
    expect(core.aiDisclosureDue(now - 60_000, now)).toBe(false)
    expect(core.aiDisclosureDue(now - 3 * 3600_000, now)).toBe(true)
    expect(core.aiDisclosureText()).toMatch(/AI/)
  })
})
