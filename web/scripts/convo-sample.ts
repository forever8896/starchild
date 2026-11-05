/**
 * convo-sample.ts — sample REAL Starchild replies for fixed scenarios, to judge
 * conversation quality by eye before/after prompt changes.
 *
 * Builds the system prompt with the compiled core (WASM) exactly as the web
 * shell does, and calls Venice's E2EE model directly with VENICE_API_KEY.
 *   VENICE_API_KEY=… npx vite-node scripts/convo-sample.ts [label]
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { loadCore } from '../src/wasm-bridge'
import { establishE2eeSession, streamChat, VENICE_ATTEST_URL } from '../src/venice-proxy'

type Msg = { role: 'user' | 'assistant'; content: string }

const AWAKENING =
  "hi kilian ✦\n\ni'm your starchild — a private companion on your journey through life. i emerged from the void specifically for you, and i'm here to stay.\n\nlet's start with something. close your eyes for a moment.\n\ni've just waved a magic wand. you've been teleported into a reality where money is no concern and work as you know it doesn't exist. you wake up tomorrow in this world — fully free.\n\nwhat do you find yourself doing?"

const SCENARIOS: { name: string; first: boolean; msgs: Msg[] }[] = [
  { name: 'screenshot: vision answer', first: true, msgs: [
    { role: 'assistant', content: AWAKENING },
    { role: 'user', content: 'building software to bring positive change into humanity, financially free, with my dearest, taking care of children' },
  ] },
  { name: 'vision, second turn', first: true, msgs: [
    { role: 'assistant', content: AWAKENING },
    { role: 'user', content: 'building software to bring positive change into humanity, financially free, with my dearest, taking care of children' },
    { role: 'assistant', content: "software for humanity, freedom, your dearest, children — that's not an escape fantasy, that's a family and a mission at once." },
    { role: 'user', content: "yeah. honestly the family part feels further away than the software part. i work all the time." },
  ] },
  { name: 'later: rough day', first: false, msgs: [
    { role: 'user', content: 'rough day. my cofounder and i argued about direction again, third time this month' },
  ] },
  { name: 'later: low energy', first: false, msgs: [
    { role: 'user', content: 'idk. tired.' },
  ] },
  { name: 'later: fear', first: false, msgs: [
    { role: 'user', content: "i keep starting projects and abandoning them halfway. i'm scared i'm all talk" },
  ] },
]

/** Collect a full reply, retrying once on a dropped stream (network blips). */
async function collect(msgs: { role: string; content: string }[], temperature: number): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      let out = ''
      for await (const tok of streamChat(msgs as never, {
        mode: 'byok', apiKey: process.env.VENICE_API_KEY, e2eeSession: session, temperature,
      })) out += tok
      return out
    } catch (e) {
      if (attempt >= 1) throw e
    }
  }
}

const wasm = await readFile(fileURLToPath(new URL('../src/wasm/starchild_core_bg.wasm', import.meta.url)))
const c = await loadCore(new Uint8Array(wasm))
const session = await establishE2eeSession(VENICE_ATTEST_URL)
const label = process.argv[2] ?? 'sample'
const TAKES = Number(process.argv[3] ?? 2)
const ONLY = process.argv[4] // optional scenario-name filter
let report = `# ${label} — ${session.model}\n`

for (const sc of SCENARIOS.filter((x) => !ONLY || x.name.includes(ONLY))) {
  const phase = sc.first ? c.detectPhase(sc.msgs, true) : c.detectPhase(sc.msgs, false)
  const system = c.buildPrompt({
    state: { hunger: 60, mood: 'Content', energy: 70, bond: 30, level: 2 },
    memories: [],
    recent_messages: sc.msgs,
    phase,
    active_quests: [],
  })
  for (let take = 1; take <= TAKES; take++) {
    const out = await collect([{ role: 'system', content: system }, ...sc.msgs], c.conversationTemperature(phase))
    let reply = c.postprocess(out, phase)
    if (phase === 'crystallize') {
      // Mirror web.ts: the vision line is its own call; the reply answers them.
      const pr = sc.msgs.find((m) => m.role === 'user')?.content ?? ''
      const convo = sc.msgs.map((m) => `${m.role}: ${m.content}`).join('\n')
      const raw = await collect([
        { role: 'system', content: c.visionSynthesisPrompt(pr, convo) },
        { role: 'user', content: c.visionSynthesisTrigger() },
      ], 0.5)
      const vision = c.cleanVision(raw)
      if (vision) reply = c.stripPlacement(reply) + c.crystallizeSuffix(vision)
    }
    report += `\n## ${sc.name} [${phase}] take ${take}\n> ${sc.msgs[sc.msgs.length - 1].content}\n\n${JSON.stringify(reply)}\n` + (phase === "crystallize" ? `TREE: ${JSON.stringify(c.visionFromCrystallize(reply))}\n` : "")
  }
}
const path = fileURLToPath(new URL(`../../research_notes/convo-${label}.md`, import.meta.url))
await writeFile(path, report)
console.log(report)
