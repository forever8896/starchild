/**
 * listening.test.ts — the listening pass, reply-habit awareness and open
 * threads, over the real compiled WASM core.
 *
 * The Rust unit tests in `src-tauri/core/src/{listen,shape,threads}.rs` pin
 * the logic; this pins the JS boundary the web shell relies on — that a read
 * and a thread list survive the round trip as plain JSON (timestamps as
 * numbers, never BigInt, so they can be stored in a setting), and that the
 * fragments render.
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll } from 'vitest'
import { loadCore, type Core } from './wasm-bridge'

const wasmPath = fileURLToPath(new URL('./wasm/starchild_core_bg.wasm', import.meta.url))
const DAY = 86_400_000
const NOW = Date.parse('2026-10-20T19:00:00Z')

let core: Core

beforeAll(async () => {
  core = await loadCore(new Uint8Array(await readFile(wasmPath)))
})

describe('listening pass', () => {
  it('builds the listener prompt from the conversation and context', () => {
    const p = core.listenPrompt({
      recent_messages: [{ role: 'user', content: 'rough day, cofounder argument again' }],
      phase: 'explore',
      context: 'They co-run a startup.',
    })
    expect(p).toContain('them: rough day, cofounder argument again')
    expect(p).toContain('They co-run a startup.')
    expect(core.listenTrigger()).toMatch(/JSON/)
  })

  it('parses a read and renders it as the final prompt layer', () => {
    const l = core.parseListening(
      'sure:\n{"heard":"third argument this month","meaning":"they feel unheard by their cofounder","feeling":"worn down","unsaid":"","need":"witness","move":"reflect","question":false,"avoid":"jumping to advice","length":"short","quest_ok":true}',
    )
    expect(l?.need).toBe('witness')
    const f = core.listeningFragment(l!, 'explore')
    expect(f).toContain('they feel unheard by their cofounder')
    expect(f).toContain('question: NONE')
    expect(core.parseListening('no json at all')).toBeNull()
  })

  it('skips crisis and crystallize', () => {
    expect(core.listenWanted('crisis')).toBe(false)
    expect(core.listenWanted('crystallize')).toBe(false)
    expect(core.listenWanted('arrive')).toBe(true)
  })
})

describe('reply habits', () => {
  it('names a question streak, stays quiet when varied', () => {
    expect(core.shapeFragment(['what now?', 'and then?', 'why that?'])).toContain('ended with a question')
    expect(core.shapeFragment(['that sounds heavy.', 'what helped?', 'i see it. ☽'])).toBe('')
  })
})

describe('open threads', () => {
  it('round-trips as plain JSON and flags a ripe thread on return', () => {
    const threads = core.applyThreadUpdate(
      [],
      '{"new":[{"kind":"event","summary":"hard talk with cofounder about a 4-day week","due_in_days":2}],"resolved":[],"touched":[]}',
      NOW,
    )
    expect(threads).toHaveLength(1)
    expect(typeof threads[0].created_ms).toBe('number')
    expect(threads[0].due_ms).toBe(NOW + 2 * DAY)
    // Stored as a setting and read back.
    const stored = JSON.parse(JSON.stringify(threads))
    const later = NOW + 3 * DAY
    const f = core.threadsFragment(stored, later, 3 * DAY)
    expect(f).toContain('hard talk with cofounder')
    expect(f).toContain('has likely happened')
    expect(f).toContain('coming back after 3 days')
    expect(core.buildThreadsExtractionInput(stored, 'hey', 'hi', later)).toContain('t1 [event')
    expect(core.threadsFragment([], later, DAY)).toBe('')
  })
})
