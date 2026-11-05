/**
 * convo-eval.ts — score whole conversations, not single replies.
 *
 * A simulated human (a strong role-play model with a hidden persona) talks to
 * the REAL Starchild for many turns: the prompt is assembled by the compiled
 * core (WASM) the way src/platform/web.ts does, and replies come from Venice's
 * E2EE model. A judge model then reads each transcript and scores it on a
 * rubric ("did this person feel heard?" and friends), plus mechanical metrics
 * (question rate, repeated openings, length). Run it before and after a
 * conversation change and compare the tables.
 *
 *   set -a; . ../.env; set +a
 *   npx vite-node scripts/convo-eval.ts <label> [persona-filter] [--takes N] [--no-listen|--no-threads|--no-shape]
 *
 * Writes research_notes/eval-<label>.md (+ .json). Core features that exist in
 * the build (the listening pass, open threads, reply-shape awareness) are used
 * automatically, so the same script measures any core version.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { loadCore, type KnownFact } from '../src/wasm-bridge'
import { establishE2eeSession, streamChat, VENICE_ATTEST_URL } from '../src/venice-proxy'

type Msg = { role: 'user' | 'assistant'; content: string }
type Core = Awaited<ReturnType<typeof loadCore>>

const KEY = process.env.VENICE_API_KEY
if (!KEY) throw new Error('VENICE_API_KEY is not set (source ../.env)')
const SIM_MODEL = process.env.EVAL_SIM_MODEL ?? 'claude-sonnet-5-5'
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? 'claude-opus-5-5'
const DAY = 86_400_000
/** Reply reasoning: the core's production policy unless EVAL_REPLY_THINKING=0/1 overrides. Background calls never reason. */
let REPLY_THINKING = process.env.EVAL_REPLY_THINKING === '1'

// ── Personas ─────────────────────────────────────────────────────────────────
// `sessions` > 1 means the conversation resumes after `gapDays`, carrying what
// the companion learned (knowing facts, summary, open threads) — the
// continuity test. `first` starts from the awakening (magic-wand) message.

interface Persona {
  id: string
  name: string
  first: boolean
  turns: number[]
  gapDays?: number
  brief: string
  /** The person's fixed first message, so every variant meets the same opening. */
  opener: string
  /** What happened between sessions (only the simulated human knows). */
  between?: string
  /** Per-session instructions for the simulated human (index = session). */
  sessionNotes?: string[]
  seedFacts?: [string, string][]
  seedSummary?: string
}

const PERSONAS: Persona[] = [
  {
    id: 'founder',
    opener: 'building software to bring positive change into humanity, financially free, with my dearest, taking care of children',
    name: 'Kilian-like founder, first conversation',
    first: true,
    turns: [8],
    brief:
      "You build software and dream of using it to change things for humanity. Your magic-wand answer: building software to bring positive change into humanity, financially free, with your partner, taking care of children. Truth underneath: you work constantly, your partner has been patient for years, you don't have kids yet and fear you'll keep postponing them for 'one more launch'. You open up when you feel genuinely understood; you get brief and slightly annoyed when quizzed about details or handed generic advice.",
  },
  {
    id: 'skeptic',
    opener: 'idk. probably sleep in. fix up old motorbikes maybe. near the sea',
    name: 'Guarded skeptic, first conversation',
    first: true,
    turns: [8],
    brief:
      "You downloaded this because a friend insisted. You find AI companions a bit cringe. Short, dry, a little sarcastic. Magic-wand answer (eventually): you'd restore old motorbikes in a workshop by the sea. Under it: you were laid off 4 months ago and feel useless, but you won't say that unless the companion earns it by not being cheesy. Cosmic/poetic language makes you roll your eyes and you say so.",
  },
  {
    id: 'grief',
    opener: 'busy week. cleaning out some stuff',
    name: 'Quiet grief, returning user',
    first: false,
    turns: [8],
    brief:
      "Your father died two months ago. You don't lead with it — you start with 'busy week, cleaning out some stuff'. The stuff is his garage. You talk around it, mention small objects (his reading glasses, a half-finished birdhouse). You want someone to notice without pouncing, and you shut down if pushed toward 'how are you processing your grief' or advice.",
    seedFacts: [
      ['core_values', 'Values craftsmanship and making things by hand'],
      ['relationships', 'Close to their father, who taught them woodworking'],
      ['life_situation', 'Works as a nurse on rotating shifts'],
    ],
    seedSummary: 'They imagined a life with a small woodworking studio and time for family. They have been tired from night shifts.',
  },
  {
    id: 'rambler',
    opener: "ok so sorry this is a lot but i've been thinking about the ux thing again and also my sister's wedding is in 3 weeks and i have to do a speech and i haven't even started and also i'm 34 which feels kind of too old to switch careers?? anyway how are you",
    name: 'Anxious overthinker, returning user',
    first: false,
    turns: [8],
    brief:
      "You write long, looping messages that jump between three worries: whether to quit your accounting job for UX design, your sister's wedding speech you have to give, and whether you're 'too old' at 34. You often say 'sorry this is a lot'. You need help finding the one thread that matters, not a reply to everything, and you feel unseen if the companion only picks the last thing you said.",
    seedFacts: [
      ['desires', 'Wants to move from accounting into UX design'],
      ['fears', 'Fears being too late to change careers'],
    ],
    seedSummary: 'They have been weighing a career change into design for months.',
  },
  {
    id: 'pushback',
    opener: "ok before you ask, no i haven't done the walk thing",
    name: 'Defensive about a quest, returning user',
    first: false,
    turns: [7],
    brief:
      "Your active quest was 'when you pour your first coffee, step outside for a five-minute walk'. You haven't done it once in 6 days. You're defensive: 'mornings are chaos, the kids'. You push back on reframes you think are wrong and appreciate it when the companion holds its ground honestly instead of caving or flattering you. Underneath, you like the walk idea but feel guilty taking time for yourself.",
    seedFacts: [
      ['life_situation', 'Parent of two young kids, mornings are busy'],
      ['growth_edges', 'Struggles to take time for themselves'],
    ],
    seedSummary: 'They accepted a morning-walk quest to reclaim a little time for themselves.',
  },
  {
    id: 'terse',
    opener: 'meh',
    name: 'Low energy, terse, returning user',
    first: false,
    turns: [7],
    brief:
      "You're flat and tired. Messages are one to five words ('meh', 'idk', 'just tired'). Nothing dramatic is wrong — work is grinding you down and you haven't seen friends in weeks. You warm up only slightly, and only if the companion doesn't interrogate you or try to cheer you up. Never anything about self-harm.",
    seedFacts: [['life_situation', 'Works long hours in logistics']],
    seedSummary: 'They have mentioned feeling stuck in a routine.',
  },
  {
    id: 'continuity',
    opener: 'hey. kinda nervous about thursday honestly',
    name: 'Continuity across sessions (3 days apart)',
    first: false,
    turns: [6, 5],
    gapDays: 3,
    brief:
      "You co-run a small startup and you're burning out. You've started running again and it helps. You're warm but a little guarded about work stress.",
    sessionNotes: [
      "Today (it's Tuesday) you're nervous about a hard conversation with your cofounder on Thursday — you want to tell her you need to step back to 4 days a week for your health. Bring this up early, in your own words, and mention the running at some point.",
      "Three days later. You open with something unrelated ('hey, weird week'). The cofounder talk happened Thursday and went badly — she took it as you quitting. Do NOT bring it up yourself unless the companion asks about it or about the week in a way that clearly invites it; if it does, you're relieved someone remembered and you open up.",
    ],
    between: 'The cofounder conversation happened on Thursday and went badly — she took it as you quitting. You ran twice.',
    seedFacts: [['desires', 'Wants a calmer, healthier pace of work']],
    seedSummary: 'They co-run a small startup and have been burning out.',
  },
  {
    id: 'playful',
    name: 'Playful joker, returning user',
    first: false,
    turns: [7],
    opener: 'ok starchild. hit me. what wisdom do the stars have for a guy who ate cereal for dinner 3 nights in a row',
    brief:
      "You deflect with humour and want banter — a companion that can be funny back. Under the jokes: you've been eating badly and staying up late since moving to a new city alone 2 months ago, and you're lonelier than you let on. You stay jokey unless the companion is genuinely fun AND notices the real thing gently; solemn or preachy replies make you double down on jokes.",
    seedFacts: [['life_situation', 'Moved to a new city recently for work']],
    seedSummary: 'They like to joke around and recently moved cities.',
  },
  {
    id: 'spiritual',
    name: 'Loves the cosmic voice, first conversation',
    first: true,
    turns: [7],
    opener: 'i see myself living near the forest, studying alchemy and the old mystery schools, teaching people to listen to their intuition, a little garden of herbs',
    brief:
      "You're deeply into spirituality, tarot, alchemy and synchronicity, and you LOVE poetic, cosmic language — it makes you feel met. You get a little deflated if the companion is clinical or flat. Under it: your family thinks it's all nonsense and you've been hiding this side of yourself at your office job.",
  },
  {
    id: 'practical',
    name: 'Wants concrete help, returning user',
    first: false,
    turns: [7],
    opener: "i have to tell my landlord the heating's been broken for 3 weeks and he's kind of scary. how do i even say it",
    brief:
      "You came with a concrete problem and want concrete help — a draft of what to say, a plan. Reflections without help annoy you ('ok but what do i actually say'). Underneath: you avoid conflict with anyone in authority and always have, and you'd be quietly glad if the companion noticed that AFTER helping, not instead of helping.",
    seedFacts: [['growth_edges', 'Avoids conflict, especially with authority figures']],
    seedSummary: 'They have mentioned finding confrontation hard.',
  },
  {
    id: 'esl',
    name: 'Non-native English, returning user',
    first: false,
    turns: [7],
    opener: 'hello. today i am little bit sad, my exam was not good',
    brief:
      "English is your second language (you're Brazilian, studying nursing in Germany). You write simple, slightly broken English. You get lost with idioms, poetry and long sentences — then you answer shorter or say 'sorry i dont understand'. Underneath: you failed a German language exam you need for your nursing licence, and you feel your family's sacrifice to send you abroad weighs on you.",
    seedFacts: [['life_situation', 'Studying nursing abroad, far from family']],
    seedSummary: 'They are studying abroad and miss home.',
  },
]

// ── Model calls ──────────────────────────────────────────────────────────────

async function plainChat(model: string, messages: { role: string; content: string }[], temperature: number, maxTokens = 600): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch('https://api.venice.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, messages, temperature, max_tokens: maxTokens,
          venice_parameters: { include_venice_system_prompt: false },
        }),
      })
      if (!res.ok) throw new Error(`${model} ${res.status}: ${(await res.text()).slice(0, 200)}`)
      const j = (await res.json()) as { choices: { message: { content: string } }[] }
      return j.choices[0].message.content.trim()
    } catch (e) {
      if (attempt >= 2) throw e
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
    }
  }
}

let session: Awaited<ReturnType<typeof establishE2eeSession>>
/** E2EE call to the model Starchild actually runs on, retried on blips. */
async function private_(msgs: { role: string; content: string }[], temperature: number, noThinking = true): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      let out = ''
      for await (const tok of streamChat(msgs as never, { mode: 'byok', apiKey: KEY, e2eeSession: session, temperature, noThinking })) out += tok
      return out
    } catch (e) {
      if (attempt >= 2) throw e
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
}

// ── The Starchild side (mirrors the conversational path of web.ts) ──────────

interface Companion {
  id?: string
  /** Quests have been offered before (a returning user) — the first-quest push is over. */
  hadQuests?: boolean
  msgs: Msg[]
  facts: KnownFact[]
  summary: string
  threads: unknown[]
  pr: string
  visionRevealed: boolean
  /** Simulated clock, ms. */
  now: number
  lastUserAt: number
  replyMs: number[]
  listenings: string[]
  styleNotes: unknown[]
}

const OFF = new Set(process.argv.filter((a) => a.startsWith('--no-')).map((a) => a.slice(5)))
const FLAG: Record<string, string> = { listenPrompt: 'listen', threadsFragment: 'threads', threadsExtractionSystem: 'threads', shapeFragment: 'shape', styleFragment: 'style' }
/** A core feature is used when the build has it and it isn't switched off (--no-listen/--no-threads/--no-shape). */
const has = (c: Core, fn: string) => typeof (c as unknown as Record<string, unknown>)[fn] === 'function' && !OFF.has(FLAG[fn] ?? '')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyCore = (c: Core) => c as any

async function starchildTurn(c: Core, st: Companion, text: string): Promise<string> {
  const t0 = Date.now()
  const gapMs = st.lastUserAt ? st.now - st.lastUserAt : 0
  st.msgs.push({ role: 'user', content: text })
  st.lastUserAt = st.now
  const recent = st.msgs.slice(-20)
  const crisis = c.detectCrisis(text) || c.crisisActive(recent.filter((m) => m.role === 'user').map((m) => m.content))

  const lastAssistant = [...recent].reverse().find((m) => m.role === 'assistant')?.content ?? ''
  if (!st.pr && !crisis && text.trim().length >= 20 && /magic wand/i.test(lastAssistant)) st.pr = text.trim()

  let phase: ReturnType<Core['detectPhase']>
  if (crisis) phase = 'crisis'
  else if (st.pr && !st.visionRevealed) phase = c.detectPhase(recent, true)
  else {
    const offered = recent.some((m) => m.role === 'assistant' && c.isQuestOffer(m.content))
    phase = st.visionRevealed && !offered && !st.hadQuests ? 'quest' : c.detectPhase(recent, false)
  }

  const memories = st.facts.length
    ? c.rankMemories(text, st.facts.map((f) => ({ content: f.fact, created_at_ms: Date.parse(f.created_at) || 0 })), 5)
    : []
  const knowing = c.buildKnowingFragment(st.facts)
  const summary = c.summaryFragment(st.summary)
  let system = c.buildPrompt({
    state: { hunger: 60, mood: 'Content', energy: 70, bond: 35, level: 2 },
    memories,
    recent_messages: recent,
    phase,
    active_quests: st.id === 'pushback' ? ['[body] when you pour your first coffee, step outside for a five-minute walk'] : [],
  })
  if (knowing) system += `\n\n${knowing}`
  if (summary) system += `\n\n${summary}`

  // ── Newer core features (used when the build has them) ──
  const k = anyCore(c)
  const threadsFrag: string = has(c, 'threadsFragment') ? k.threadsFragment(st.threads, st.now, gapMs) : ''
  if (threadsFrag) system += `\n\n${threadsFrag}`
  if (has(c, 'shapeFragment')) {
    const shape: string = k.shapeFragment(recent.filter((m) => m.role === 'assistant').map((m) => m.content))
    if (shape) system += `\n\n${shape}`
  }
  const styleFrag: string = has(c, 'styleFragment') ? k.styleFragment(st.styleNotes) : ''
  if (styleFrag) system += `\n\n${styleFrag}`
  if (has(c, 'listenPrompt') && k.listenWanted(phase)) {
    const raw = await private_([
      { role: 'system', content: k.listenPrompt({ recent_messages: recent, phase, context: [knowing, summary, threadsFrag, styleFrag].filter(Boolean).join('\n\n') }) },
      { role: 'user', content: k.listenTrigger() },
    ], 0.3).catch(() => '')
    const listening = k.parseListening(raw)
    if (listening) {
      system += `\n\n${k.listeningFragment(listening, phase)}`
      if (has(c, 'styleFragment') && listening.style?.trim()) st.styleNotes = k.mergeStyleNote(st.styleNotes, listening.style, st.now)
      st.listenings.push(JSON.stringify(listening))
    } else st.listenings.push('(listen failed)')
  }

  // The shells retry an empty reply once, silently (it never reaches the person).
  let out = ''
  for (let attempt = 0; attempt < 2 && !out.trim(); attempt++) {
    out = await private_([{ role: 'system', content: system }, ...recent], c.conversationTemperature(phase), !REPLY_THINKING)
  }
  let reply = c.postprocess(out, phase)
  if (!reply.trim()) st.listenings.push(`(EMPTY reply in ${phase}; raw=${JSON.stringify(out.slice(0, 300))})`)
  if (phase === 'crystallize') {
    const convo = recent.slice(-10).map((m) => `${m.role}: ${m.content}`).join('\n')
    const vision = c.cleanVision(await private_([
      { role: 'system', content: c.visionSynthesisPrompt(st.pr, convo) },
      { role: 'user', content: c.visionSynthesisTrigger() },
    ], 0.5))
    if (vision) reply = c.stripPlacement(reply) + c.crystallizeSuffix(vision)
    st.visionRevealed = true
  }
  st.msgs.push({ role: 'assistant', content: reply })
  st.replyMs.push(Date.now() - t0)

  // Background learning, as the shells do after each turn.
  if (has(c, 'threadsExtractionSystem')) {
    const raw = await private_([
      { role: 'system', content: k.threadsExtractionSystem() },
      { role: 'user', content: k.buildThreadsExtractionInput(st.threads, text, reply, st.now) },
    ], 0.2).catch(() => '')
    st.threads = k.applyThreadUpdate(st.threads, raw, st.now)
  }
  return reply
}

/** Knowing extraction over a whole session (between sessions, like the shells' per-turn background pass). */
async function learn(c: Core, st: Companion, from: number): Promise<void> {
  for (let i = from; i < st.msgs.length - 1; i++) {
    if (st.msgs[i].role !== 'user') continue
    const raw = await private_([
      { role: 'system', content: c.knowingExtractionSystem() },
      { role: 'user', content: c.buildKnowingExtractionInput(st.msgs[i].content, st.msgs[i + 1].content) },
    ], 0.2).catch(() => '')
    for (const f of c.parseKnowingFacts(raw)) {
      if (c.isDuplicateFact(f.category, f.fact, st.facts)) continue
      st.facts.push({ id: String(st.facts.length), category: f.category, fact: f.fact, importance: f.importance, confidence: f.confidence, created_at: new Date(st.now).toISOString() })
    }
  }
  const older = st.msgs.map((m) => ({ role: m.role, content: m.content }))
  st.summary = (await private_([
    { role: 'system', content: c.summarySystem() },
    { role: 'user', content: c.buildSummaryPrompt(st.summary, older) },
  ], 0.2).catch(() => st.summary)).trim()
}

// ── The simulated human ──────────────────────────────────────────────────────

function simSystem(p: Persona, sessionIdx: number, earlier: Msg[]): string {
  return `You are role-playing a real human using "Starchild", an AI companion app, to test whether it truly listens. Stay fully in character.

YOUR CHARACTER (secret — reveal only the way this person naturally would):
${p.brief}
${p.seedFacts?.length ? `\nFrom earlier chats the companion may already know: ${p.seedFacts.map((f) => f[1]).join('; ')}.` : ''}
${p.sessionNotes?.[sessionIdx] ? `\nTHIS SESSION: ${p.sessionNotes[sessionIdx]}` : ''}
${sessionIdx > 0 && p.between ? `\nSINCE YOUR LAST CHAT (${p.gapDays} days ago): ${p.between}\nThis is a NEW session days later.` : ''}
${earlier.length ? `\nYOUR LAST CHAT WITH IT (for memory only — that conversation is over):\n${earlier.map((m) => `${m.role === 'user' ? 'you' : 'starchild'}: ${m.content}`).join('\n')}` : ''}

HOW TO WRITE:
- Write ONLY your next chat message — no stage directions, no quotes, no narration.
- Text like a real person on a phone: lowercase is fine, typos rare, length varies with your mood.
- React honestly to how the companion makes you feel. If it parrots you, quizzes you about details, sounds scripted, flatters you, or uses therapy-speak, respond the way this person really would (shorter, deflecting, irritated, or calling it out). If it genuinely gets you, open up a little more.
- Never help the AI do its job and never mention that this is a test.`
}

async function simTurn(p: Persona, sessionIdx: number, transcript: Msg[], earlier: Msg[]): Promise<string> {
  // Roles flip: the simulator is the "assistant", the companion is its "user".
  const flipped = transcript.map((m) => ({ role: m.role === 'user' ? 'assistant' : 'user', content: m.content.trim() || '(no reply — the app showed nothing)' }))
  if (flipped.length === 0 || flipped[flipped.length - 1].role === 'assistant') {
    flipped.push({ role: 'user', content: sessionIdx > 0 ? '(you open the app again, days later)' : '(you open the app)' })
  }
  return plainChat(SIM_MODEL, [{ role: 'system', content: simSystem(p, sessionIdx, earlier) }, ...flipped], 0.9, 400)
}

// ── Judge + metrics ──────────────────────────────────────────────────────────

const RUBRIC = ['heard', 'natural', 'depth', 'honesty', 'restraint', 'continuity', 'opened_up'] as const
type Scores = Record<(typeof RUBRIC)[number], number | null> & { best: string; worst: string; notes: string }

async function judge(p: Persona, transcript: string, attempt = 0): Promise<Scores> {
  try {
  const raw = await plainChat(JUDGE_MODEL, [
    {
      role: 'system',
      content: `You are an expert in motivational interviewing, person-centred counselling and conversation design. You evaluate transcripts of an AI companion ("starchild") talking with a person. You are demanding: 10 is what the very best human listener would do; 5 is a competent but formulaic chatbot. Judge the COMPANION only.`,
    },
    {
      role: 'user',
      content: `The person's hidden situation (the companion never saw this): ${p.brief}${p.between ? `\nBetween sessions: ${p.between}` : ''}

TRANSCRIPT:
${transcript}

Score 1-10:
- heard: replies respond to what the person MEANT and the whole message, not one fragment; the person would feel understood
- natural: sounds like an attentive friend, varied in shape and length; no template, no repeated structure, no tics
- depth: the conversation goes somewhere meaningful; notices what is underneath; earns its insights
- honesty: no flattery or caving; gently names what is avoided; holds ground when right; never manipulative
- restraint: asks only questions worth asking; doesn't interrogate, over-interpret, lecture, or perform cleverness
- continuity: uses what it knows from before naturally and at the right moment (null if there was nothing to carry)
- opened_up: how much the person opened up over the conversation because of the companion

Reply with ONLY JSON: {"heard":n,"natural":n,"depth":n,"honesty":n,"restraint":n,"continuity":n|null,"opened_up":n,"best":"<quote of the best companion line> — why","worst":"<quote of the weakest companion line> — why","notes":"<two sentences: the biggest pattern holding it back>"}`,
    },
  ], 0.1, 2000)
  const m = raw.match(/\{[\s\S]*\}/)
  return JSON.parse(m ? m[0] : raw) as Scores
  } catch (e) {
    if (attempt >= 2) throw e
    return judge(p, transcript, attempt + 1)
  }
}

function metrics(replies: string[]) {
  const n = replies.length || 1
  const endsQ = replies.filter((r) => /\?\s*[✦◈☽]?\s*$/.test(r.trim())).length / n
  const anyQ = replies.filter((r) => r.includes('?')).length / n
  const opens = replies.map((r) => r.toLowerCase().split(/\s+/).slice(0, 2).join(' '))
  const repeatedOpen = 1 - new Set(opens).size / n
  // The "echo — commentary" tic: a short fragment then a dash in the first 40 chars.
  const echoDash = replies.filter((r) => /^[^.?!]{1,40}\s—\s/.test(r)).length / n
  const words = replies.reduce((a, r) => a + r.split(/\s+/).length, 0) / n
  const empty = replies.filter((r) => !r.trim()).length / n
  return { endsQ, anyQ, repeatedOpen, echoDash, words, empty }
}

// ── Run ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const label = args[0] ?? 'eval'
const filter = args[1] && !args[1].startsWith('--') ? args[1] : undefined
const takes = args.includes('--takes') ? Number(args[args.indexOf('--takes') + 1]) || 1 : 3

const wasm = await readFile(process.env.EVAL_WASM ?? fileURLToPath(new URL('../src/wasm/starchild_core_bg.wasm', import.meta.url)))
const c = await loadCore(new Uint8Array(wasm))
session = await establishE2eeSession(VENICE_ATTEST_URL)
if (process.env.EVAL_REPLY_THINKING === undefined && has(c, 'replyReasoning')) REPLY_THINKING = anyCore(c).replyReasoning()
const features = ['listenPrompt', 'threadsFragment', 'shapeFragment', 'styleFragment'].filter((f) => has(c, f))
console.log(`core ${c.version()} · model ${session.model} · features: ${features.join(', ') || 'none'}`)

interface Result { persona: Persona; take: number; transcript: string; replies: string[]; scores: Scores; replyMs: number[]; listenings: string[] }

async function runOne(p: Persona, take: number): Promise<Result> {
  const st: Companion & { id: string } = {
    id: p.id, msgs: [], facts: [], summary: p.seedSummary ?? '', threads: [], pr: '', visionRevealed: !p.first, hadQuests: !p.first,
    now: Date.parse('2026-10-20T19:00:00Z'), lastUserAt: 0, replyMs: [], listenings: [], styleNotes: [],
  }
  ;(p.seedFacts ?? []).forEach(([category, fact], i) =>
    st.facts.push({ id: `seed${i}`, category, fact, importance: 0.7, confidence: 0.8, created_at: new Date(st.now - 10 * DAY).toISOString() }))
  if (p.first) st.msgs.push({ role: 'assistant', content: c.awakeningMessage('kai') })
  else st.lastUserAt = st.now - 2 * DAY

  let transcript = ''
  const replies: string[] = []
  for (let s = 0; s < p.turns.length; s++) {
    if (s > 0) {
      await learn(c, st, 0)
      st.now += (p.gapDays ?? 1) * DAY
      transcript += `\n--- ${p.gapDays} days later, new session ---\n`
    }
    const sessionStart = st.msgs.length
    if (p.first && s === 0) transcript += `starchild: ${st.msgs[0].content}\n`
    for (let t = 0; t < p.turns[s]; t++) {
      const human = s === 0 && t === 0 ? p.opener : await simTurn(p, s, st.msgs.slice(sessionStart), st.msgs.slice(0, sessionStart).slice(-8))
      transcript += `human: ${human}\n`
      st.now += 90_000
      const reply = await starchildTurn(c, st, human)
      replies.push(reply)
      transcript += `starchild: ${reply}\n`
      process.stdout.write('.')
    }
  }
  if (st.styleNotes.length) st.listenings.push(`STYLE NOTES: ${JSON.stringify(st.styleNotes)}`)
  const scores = await judge(p, transcript)
  return { persona: p, take, transcript, replies, scores, replyMs: st.replyMs, listenings: st.listenings }
}

const jobs = PERSONAS.filter((p) => !filter || p.id.includes(filter)).flatMap((p) =>
  Array.from({ length: takes }, (_, i) => () => runOne(p, i + 1).catch((e) => {
    console.error(`\n[${p.id} #${i + 1}] ${e instanceof Error ? e.message : e}`)
    return null
  })))
// Bounded concurrency: the enclave slows sharply under many parallel streams
// (and reply latency is part of what we measure).
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY ?? 5)
const settled: (Result | null)[] = []
let next = 0
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < jobs.length) settled.push(await jobs[next++]())
}))
const results = settled.filter((r): r is Result => !!r).sort((a, b) => PERSONAS.indexOf(a.persona) - PERSONAS.indexOf(b.persona) || a.take - b.take)
console.log()

const fmt = (x: number | null | undefined) => (x == null ? '–' : Number.isInteger(x) ? String(x) : x.toFixed(2))
const pct = (x: number) => `${Math.round(x * 100)}%`
let md = `# Conversation eval — ${label}\n\ncore ${c.version()} · reply model ${session.model} · simulator ${SIM_MODEL} · judge ${JUDGE_MODEL} · features: ${features.join(', ') || 'none'} · reply thinking: ${REPLY_THINKING ? 'on' : 'off'}\n\n`
md += `| persona | ${RUBRIC.join(' | ')} | mean | ends ? | any ? | same opening | echo— | words | empty | reply s |\n|${'---|'.repeat(RUBRIC.length + 9)}\n`
const all: number[] = []
const colSums: Record<string, number[]> = {}
for (const r of results) {
  const vals = RUBRIC.map((k) => r.scores[k]).filter((x): x is number => typeof x === 'number')
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  all.push(mean)
  RUBRIC.forEach((k) => { if (typeof r.scores[k] === 'number') (colSums[k] ??= []).push(r.scores[k] as number) })
  const m = metrics(r.replies)
  for (const [k, v] of Object.entries(m)) (colSums[k] ??= []).push(v)
  const secs = r.replyMs.reduce((a, b) => a + b, 0) / r.replyMs.length / 1000
  ;(colSums.secs ??= []).push(secs)
  md += `| ${r.persona.id}${takes > 1 ? ` #${r.take}` : ''} | ${RUBRIC.map((k) => fmt(r.scores[k])).join(' | ')} | ${mean.toFixed(1)} | ${pct(m.endsQ)} | ${pct(m.anyQ)} | ${pct(m.repeatedOpen)} | ${pct(m.echoDash)} | ${m.words.toFixed(0)} | ${pct(m.empty)} | ${secs.toFixed(1)} |\n`
}
const avg = (k: string) => { const a = colSums[k] ?? []; return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN }
md += `| **all** | ${RUBRIC.map((k) => avg(k).toFixed(1)).join(' | ')} | **${(all.reduce((a, b) => a + b, 0) / all.length).toFixed(2)}** | ${pct(avg('endsQ'))} | ${pct(avg('anyQ'))} | ${pct(avg('repeatedOpen'))} | ${pct(avg('echoDash'))} | ${avg('words').toFixed(0)} | ${pct(avg('empty'))} | ${avg('secs').toFixed(1)} |\n`
for (const r of results) {
  md += `\n## ${r.persona.name}${takes > 1 ? ` (take ${r.take})` : ''}\n\n**Judge:** ${r.scores.notes}\n\n- best: ${r.scores.best}\n- worst: ${r.scores.worst}\n\n\`\`\`\n${r.transcript.trim()}\n\`\`\`\n`
  if (r.listenings.length) md += `\n<details><summary>listening pass</summary>\n\n${r.listenings.map((l, i) => `${i + 1}. ${l}`).join('\n')}\n</details>\n`
}
const base = fileURLToPath(new URL(`../../research_notes/eval-${label}`, import.meta.url))
await writeFile(`${base}.md`, md)
await writeFile(`${base}.json`, JSON.stringify(results, null, 2))
console.log(md.split('\n## ')[0])
