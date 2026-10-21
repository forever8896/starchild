/**
 * convo-pair.ts — head-to-head judging of two convo-eval runs.
 *
 * Absolute 1-10 scores are noisy (the same version swings ±1-2 points per
 * persona between takes), so small improvements drown. Here the judge sees
 * the SAME persona's conversation from both versions side by side and picks
 * the better companion — twice, with the order swapped, to cancel position
 * bias. Every persona opens with the same fixed message in both runs.
 *
 *   set -a; . ../.env; set +a
 *   npx vite-node scripts/convo-pair.ts <labelA> <labelB>
 *
 * Reads research_notes/eval-<label>.json, writes research_notes/pair-<A>-vs-<B>.md.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const KEY = process.env.VENICE_API_KEY
if (!KEY) throw new Error('VENICE_API_KEY is not set (source ../.env)')
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? 'claude-opus-5-5'
const [A, B] = process.argv.slice(2)
if (!A || !B) throw new Error('usage: convo-pair.ts <labelA> <labelB>')

interface Run { persona: { id: string; name: string; brief: string; between?: string }; take: number; transcript: string }
const load = async (l: string): Promise<Run[]> =>
  JSON.parse(await readFile(fileURLToPath(new URL(`../../research_notes/eval-${l}.json`, import.meta.url)), 'utf8'))
const [ra, rb] = await Promise.all([load(A), load(B)])

const DIMS = ['overall', 'heard', 'natural', 'depth', 'honesty', 'restraint', 'continuity'] as const
type Verdict = Record<(typeof DIMS)[number], '1' | '2' | 'tie'> & { margin: 'slight' | 'clear' | 'strong'; why: string }

async function chat(messages: { role: string; content: string }[]): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch('https://api.venice.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: JUDGE_MODEL, messages, temperature: 0.1, max_tokens: 1500, venice_parameters: { include_venice_system_prompt: false } }),
      })
      if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`)
      const j = (await res.json()) as { choices: { message: { content: string } }[] }
      const raw = j.choices[0].message.content
      return raw.match(/\{[\s\S]*\}/)?.[0] ?? raw
    } catch (e) {
      if (attempt >= 2) throw e
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
}

async function compare(p: Run['persona'], first: string, second: string): Promise<Verdict> {
  const raw = await chat([
    {
      role: 'system',
      content: 'You are an expert in motivational interviewing, person-centred counselling and conversation design. You compare two transcripts of an AI companion ("starchild") with the same person, and judge which COMPANION did better. The person is simulated and reacts to the companion, so their replies differ — judge the companion, and credit it when its replies made the person open up. Be decisive; call a tie only when you genuinely cannot separate them.',
    },
    {
      role: 'user',
      content: `The person's hidden situation (the companion never saw this): ${p.brief}${p.between ? `\nBetween sessions: ${p.between}` : ''}

CONVERSATION 1:
${first}

CONVERSATION 2:
${second}

For each dimension say which companion did better ("1", "2" or "tie"):
- overall: which one would this person rather keep talking to, and feel more understood by
- heard: responded to what the person MEANT, the whole message, the tender bits
- natural: like an attentive friend; varied; no template or tics
- depth: went somewhere meaningful, earned insights
- honesty: no flattery or caving; named what was avoided; held ground when right
- restraint: questions worth asking; no interrogation, over-interpretation or lecturing
- continuity: used what it knew from before, naturally ("tie" if neither had anything to carry)

Reply with ONLY JSON: {"overall":"1|2|tie","heard":"…","natural":"…","depth":"…","honesty":"…","restraint":"…","continuity":"…","margin":"slight|clear|strong","why":"<two sentences on the decisive difference>"}`,
    },
  ])
  return JSON.parse(raw) as Verdict
}

// Pair up runs by persona + take.
const pairs = ra.flatMap((a) => {
  const b = rb.find((x) => x.persona.id === a.persona.id && x.take === a.take)
  return b ? [{ a, b }] : []
})
console.log(`${pairs.length} pairs · judge ${JUDGE_MODEL}`)

type Score = { a: number; b: number; tie: number }
const tally: Record<string, Score> = Object.fromEntries(DIMS.map((d) => [d, { a: 0, b: 0, tie: 0 }]))
const perPersona: Record<string, Score> = {}
const notes: string[] = []

await Promise.all(pairs.map(async ({ a, b }) => {
  // Both orders: A shown first, then B shown first.
  const [v1, v2] = await Promise.all([
    compare(a.persona, a.transcript, b.transcript).catch(() => null),
    compare(a.persona, b.transcript, a.transcript).catch(() => null),
  ])
  for (const [v, aIs] of [[v1, '1'], [v2, '2']] as const) {
    if (!v) continue
    for (const d of DIMS) {
      const w = v[d]
      const k = w === 'tie' ? 'tie' : w === aIs ? 'a' : 'b'
      tally[d][k] += 1
      if (d === 'overall') {
        const pp = (perPersona[a.persona.id] ??= { a: 0, b: 0, tie: 0 })
        pp[k] += 1
        notes.push(`- **${a.persona.id} #${a.take}** (${k === 'tie' ? 'tie' : `${k === 'a' ? A : B} wins, ${v.margin}`}): ${v.why}`)
      }
    }
  }
  process.stdout.write('.')
}))
console.log()

/** Two-sided sign test p-value on decisive votes. */
function signP(x: number, n: number): number {
  if (n === 0) return 1
  const k = Math.min(x, n - x)
  let p = 0
  for (let i = 0; i <= k; i++) {
    let c = 1
    for (let j = 0; j < i; j++) c = (c * (n - j)) / (j + 1)
    p += c / 2 ** n
  }
  return Math.min(1, 2 * p)
}

let md = `# ${A} vs ${B} — head to head\n\n${pairs.length} persona-takes, each judged twice (order swapped) by ${JUDGE_MODEL}.\n\n| dimension | ${A} wins | ${B} wins | ties | ${B} win rate (decisive) | p |\n|---|---|---|---|---|---|\n`
for (const d of DIMS) {
  const t = tally[d]
  const n = t.a + t.b
  md += `| ${d} | ${t.a} | ${t.b} | ${t.tie} | ${n ? Math.round((t.b / n) * 100) : 0}% | ${signP(t.b, n).toFixed(3)} |\n`
}
md += `\n| persona | ${A} | ${B} | tie |\n|---|---|---|---|\n`
for (const [id, t] of Object.entries(perPersona).sort()) md += `| ${id} | ${t.a} | ${t.b} | ${t.tie} |\n`
md += `\n## Why\n\n${notes.sort().join('\n')}\n`
await writeFile(fileURLToPath(new URL(`../../research_notes/pair-${A}-vs-${B}.md`, import.meta.url)), md)
console.log(md.split('\n## Why')[0])
