// Smoke test for the WASM bridge (PRD §4.6): load the wasm-pack output of the
// shared core and exercise a few PURE functions across the JS<->Rust boundary.
//
// Runs in Node (vitest), so we read the `.wasm` bytes off disk and hand them to
// `loadCore()` rather than relying on browser URL fetch. The point is only to
// prove the pipeline works: the module instantiates and pure logic runs.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { loadCore, type ChatMessage } from './wasm-bridge.js'

const wasmPath = fileURLToPath(new URL('./wasm/starchild_core_bg.wasm', import.meta.url))

async function core() {
  const bytes = await readFile(wasmPath)
  // Pass a fresh ArrayBuffer view of the bytes as the init input.
  return loadCore(new Uint8Array(bytes))
}

describe('wasm-bridge pure engine', () => {
  it('detects the opening phase on a single user message', async () => {
    const c = await core()
    const messages: ChatMessage[] = [{ role: 'user', content: 'hi, i want to paint again' }]
    const phase = c.detectPhase(messages)
    // A short first message should land in the early arc, not a late phase.
    expect(['arrive', 'dig']).toContain(phase)
  })

  it('routes an emotional message to the deep tier', async () => {
    const c = await core()
    const route = c.routeModel('i feel completely lost about the meaning of my life')
    expect(route.tier).toBe('deep')
    expect(route.model_id).toBe('deepseek-v3.2')
  })

  it('builds a non-empty system prompt and post-processes a response', async () => {
    const c = await core()
    const prompt = c.buildPrompt({ phase: 'arrive', recent_messages: [] })
    expect(prompt.length).toBeGreaterThan(100)
    expect(prompt.toLowerCase()).toContain('starchild')

    const cleaned = c.postprocess('hello\n\nthere 😀', 'arrive')
    expect(cleaned).toBe('hello there')
  })

  it('ticks game state with an injected clock (hunger decays)', async () => {
    const c = await core()
    const start = c.newGameState(0) // epoch
    expect(start.hunger).toBe(50)
    // Advance ~10 hours -> measurable hunger decay (~2/hr).
    const later = c.tickGameState(start, 10 * 60 * 60 * 1000)
    expect(later.hunger).toBeLessThan(start.hunger)
    expect(later.hunger).toBeGreaterThan(0)
  })

  it('reports a core version', async () => {
    const c = await core()
    expect(c.version()).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('ranks memories by keyword overlap + recency across the boundary', async () => {
    const c = await core()
    const items = [
      { content: 'they love rust and systems programming', created_at_ms: 1000 },
      { content: 'they have two cats', created_at_ms: 2000 },
      { content: 'rust is their favorite language lately', created_at_ms: 3000 },
    ]
    const out = c.rankMemories('tell me about rust', items, 5)
    // Only the two rust memories match; the cats memory is filtered out.
    expect(out.length).toBe(2)
    expect(out.every((m) => m.includes('rust'))).toBe(true)
    // Equal overlap → the more recent rust memory ranks first.
    expect(out[0]).toContain('favorite language')
    // Irrelevant query surfaces nothing (FTS5-like).
    expect(c.rankMemories('quantum physics', items, 5)).toEqual([])
  })

  it('round-trips the knowing extraction → fragment pipeline', async () => {
    const c = await core()
    expect(c.knowingExtractionSystem().toLowerCase()).toContain('starchild')
    const input = c.buildKnowingExtractionInput('i fear failure', 'tell me more')
    expect(input).toContain('i fear failure')

    const facts = c.parseKnowingFacts(
      '[{"fact":"they fear failure","category":"fears","importance":0.9,"confidence":0.8}]',
    )
    expect(facts.length).toBe(1)
    expect(facts[0].category).toBe('fears')

    const fragment = c.buildKnowingFragment([
      { id: '1', category: 'fears', fact: 'they fear failure', importance: 0.9, confidence: 0.8, created_at: 't' },
    ])
    expect(fragment).toContain('fears and shadows')
    expect(fragment).toContain('they fear failure')

    // Zero facts still yields the gaps + "still new" guidance the prompt appends.
    const empty = c.buildKnowingFragment([])
    expect(empty).toContain('AREAS STILL UNEXPLORED')
  })
})
