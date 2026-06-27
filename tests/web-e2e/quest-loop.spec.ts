/**
 * quest-loop.spec.ts — the FULL gamified loop, end-to-end on the real web shell.
 *
 * This is the heart of the experience the onboarding spec doesn't reach: a
 * Starchild offers a quest → you accept → it lands on your Vision Tree → you do
 * it and bring proof → it completes with an XP celebration. It runs against the
 * REAL `web/` shell on :5174 (`web/src/main.tsx` → shared components via the
 * `src/platform/web.ts` seam, backed by the WASM `core/` + IndexedDB), so the
 * actual product code paths execute — not stubs.
 *
 * ── Determinism: mock Venice at the NETWORK seam (PRD §8) ────────────────────
 * The only outbound call the product makes is the E2EE inference call. On web
 * with no BYOK key set, every inference goes through the trial proxy
 * (`web/src/venice-proxy.ts` → POST `/api/proxy`). We `page.route()` that ONE
 * endpoint and replay a canned, chunked OpenAI/Venice-style SSE stream, so
 * `streamChat()` yields tokens exactly as a live call would — same streaming
 * code path, deterministic content, zero real network. Nothing is stubbed in
 * React or the core; we only swap the network boundary.
 *
 * The proxy is hit for THREE distinct purposes in one loop, so the mock routes
 * by request shape (all observable in the POSTed `messages`):
 *   1. main conversation  — system is the assembled persona prompt; we reply
 *      with a quest OFFER (contains a core offer marker) or, in the proof phase,
 *      a celebration. We branch on the latest USER message.
 *   2. quest extraction   — system === `quest::QUEST_EXTRACTION_SYSTEM`
 *      ("Extract quest details …"); we reply with a valid quest JSON the core
 *      parses + normalizes into the accepted quest.
 *   3. knowing extraction — system is the 7-dimension "insight extractor" prompt;
 *      we reply with an empty array (no facts) — it's fire-and-forget and
 *      swallowed, but we still answer so the stream never errors.
 *
 * ── Quest-offer markers (shared core: `quest::QUEST_OFFER_MARKERS`) ──────────
 *   "quest for you" · "i have a quest" · "here's something to try"
 * The offer reply below contains "i have a quest for you" so `core.isQuestOffer`
 * fires and the web platform emits `quest-offered` → the accept/decline UI shows.
 *
 * ── Assertions are resilient to copy ────────────────────────────────────────
 * We key off stable structural signals (role-named buttons, the "Active Quest"
 * label, the "Your Journey" tree heading, an `/\+\s*\d+\s*XP/` celebration) and
 * the quest title WE injected — never on incidental persona wording.
 */

import { test, expect, type Page, type Route } from '@playwright/test'

// ── The quest we inject at the extraction seam ───────────────────────────────
// Short title (< 18 chars) so the Vision Tree renders it un-truncated as a node
// label; `body` category so it lights the body branch.
const QUEST = {
  title: 'Walk at dawn',
  description: 'Step outside at first light and breathe slowly for ten minutes.',
  category: 'body',
  quest_type: 'daily',
  xp_reward: 20,
} as const

// Canned assistant replies (lowercase markers match the core's case-insensitive
// detection). The OFFER carries a quest marker; the proof replies deliberately
// do NOT (completion is gated by the platform's proof handshake, not by wording).
const OFFER_REPLY =
  "i have a quest for you, if you're ready: step outside at dawn and breathe for ten minutes."
const PROOF_ASK_REPLY =
  'oh — you actually did it? tell me, how did it feel out there in the quiet?'
const PROOF_CELEBRATE_REPLY =
  "you did it. i can feel the shift in you — that's real. beautiful work ✦"

// User inputs the test types (chosen so the mock can route deterministically).
const OFFER_MESSAGE = "i'm ready to grow toward who i want to become"
const PROOF_STORY = 'it is complete — i stepped out at dawn and it was still and calm'

// ── SSE helper: replay text as a chunked OpenAI/Venice data: stream ──────────
function sseStream(text: string): string {
  const chunks = text.match(/\S+\s*/g) ?? [text] // word-ish chunks, spaces kept
  const body = chunks
    .map(
      (c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`,
    )
    .join('')
  return `${body}data: [DONE]\n\n`
}

async function fulfillSse(route: Route, text: string): Promise<void> {
  await route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    body: sseStream(text),
  })
}

/**
 * Install the deterministic inference mock on the trial proxy endpoint. Routes
 * by the POSTed `messages` so one handler serves conversation, quest extraction
 * and knowing extraction — exactly the seam a live trial call would use.
 */
async function mockInference(page: Page): Promise<void> {
  await page.route('**/api/proxy**', async (route) => {
    let messages: Array<{ role: string; content: string }> = []
    try {
      messages = route.request().postDataJSON()?.messages ?? []
    } catch {
      messages = []
    }
    const system = messages.find((m) => m.role === 'system')?.content ?? ''
    const lastUser =
      [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''

    // (2) Quest extraction → the structured quest the core parses on ACCEPT.
    if (system.includes('Extract quest details')) {
      await fulfillSse(route, JSON.stringify(QUEST))
      return
    }
    // (3) Knowing extraction → no facts (fire-and-forget; swallowed).
    if (system.includes('insight extractor')) {
      await fulfillSse(route, '[]')
      return
    }
    // (1) Main conversation — branch on the latest user turn.
    //   • proof turn 1: ChatWindow sends `i did the quest: "…"` → ask for the story
    //   • proof turn 2: the user's story ("it is complete …") → celebrate
    //   • otherwise: offer a quest
    if (/i did the quest/i.test(lastUser)) {
      await fulfillSse(route, PROOF_ASK_REPLY)
      return
    }
    if (/it is complete/i.test(lastUser)) {
      await fulfillSse(route, PROOF_CELEBRATE_REPLY)
      return
    }
    await fulfillSse(route, OFFER_REPLY)
  })
}

/**
 * Fail the test on any uncaught page error or the duplicate-React hook signature
 * (mirrors onboarding.spec): the loop must run with the shell rendering for real.
 */
function guardAgainstRenderErrors(page: Page): { assertClean: () => void } {
  const pageErrors: string[] = []
  const reactErrors: string[] = []

  page.on('pageerror', (err) => pageErrors.push(`${err.name}: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (
      /invalid hook call/i.test(text) ||
      /hooks can only be called inside/i.test(text) ||
      /must be used within a platformprovider/i.test(text) ||
      /minified react error #(321|310|300)\b/i.test(text)
    ) {
      reactErrors.push(text)
    }
  })

  return {
    assertClean() {
      expect(
        pageErrors,
        `Uncaught page error(s) — the web shell crashed at runtime:\n${pageErrors.join('\n')}`,
      ).toEqual([])
      expect(
        reactErrors,
        `React hook/render error(s) — likely a duplicate React copy:\n${reactErrors.join('\n')}`,
      ).toEqual([])
    },
  }
}

/** Complete first-run onboarding → land in the live chat (no network needed). */
async function completeOnboarding(page: Page): Promise<void> {
  await page
    .getByPlaceholder('what should your starchild call you?')
    .fill('Quest Traveler')
  const begin = page.getByRole('button', { name: /begin the journey/i })
  await expect(begin).toBeEnabled()
  await begin.click()
  // Chat mounted: the composer + the LOCAL awakening line (no Venice call). Wait
  // for the awakening copy too — it proves `generateFirstMessage` finished
  // (which seeds the creature row) before we freeze it below.
  await expect(page.getByPlaceholder('talk to your starchild...')).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText(/i'm your starchild/i)).toBeVisible({
    timeout: 15_000,
  })
}

/**
 * Freeze the creature's decay clock to keep the run deterministic.
 *
 * The shared core ticks hunger by REAL elapsed wall-clock time on every send
 * (`game::apply_hunger_decay_at`), which yields fractional stats. The core's
 * prompt-input `StarchildState` carries those stats as integers (`u32`), so a
 * deterministic E2E must pin the creature rather than let live decay vary it.
 * We write the `state` row directly in IndexedDB (DB `starchild`, store `state`,
 * keyPath `id`) with whole-number stats and a FUTURE `last_decay_at`; since the
 * decay calc clamps negative elapsed to zero, the very next tick is a no-op and
 * the stats stay whole. Each tick resets `last_decay_at` to "now", so we re-pin
 * immediately before every inference-triggering action in the loop.
 *
 * (Note for maintainers: this also sidesteps a latent web bug — `sendMessage`
 * forwards the raw fractional ticked stats into `build_prompt`, whose `u32`
 * fields reject a non-integral float. Pinning the creature keeps the stats
 * whole. The real fix belongs in `web.ts`/core, out of scope for this test.)
 */
async function freezeCreatureDecay(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('starchild')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const db = open.result
        try {
          const tx = db.transaction('state', 'readwrite')
          tx.objectStore('state').put({
            id: 1,
            // FRACTIONAL on purpose: live decay yields f64 stats, but core's
            // build_prompt state is u32 — web.ts must round before the WASM
            // boundary or every real send throws a serde error. Pinning fractional
            // values (with a future last_decay_at so they don't drift) makes this
            // test GUARD that rounding; a regression would re-break conversation.
            hunger: 60.4,
            mood: 'Content',
            energy: 70.7,
            bond: 50.3,
            xp: 0,
            level: 1,
            last_decay_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
          })
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        } catch (err) {
          reject(err)
        }
      }
    })
  })
}

test.describe('web shell — full quest loop', () => {
  test('offer → accept → vision tree → proof → complete (mocked inference)', async ({
    page,
  }) => {
    const guard = guardAgainstRenderErrors(page)
    await mockInference(page)

    // ── Onboarding ───────────────────────────────────────────────────────────
    await page.goto('/')
    await completeOnboarding(page)

    const composer = page.getByPlaceholder('talk to your starchild...')

    // ── 1. Send a message → mocked reply OFFERS a quest ──────────────────────
    // Pin the creature right before each send so the ticked stats stay whole.
    await freezeCreatureDecay(page)
    await composer.fill(OFFER_MESSAGE)
    await composer.press('Enter')

    // The offer reply streams in (carries the core's quest-offer marker).
    await expect(page.getByText(/quest for you|i have a quest/i)).toBeVisible({
      timeout: 15_000,
    })

    // ── 2. The accept/decline UI appears ─────────────────────────────────────
    const acceptBtn = page.getByRole('button', { name: /accept quest/i })
    await expect(acceptBtn).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByRole('button', { name: /decline/i }),
    ).toBeVisible()

    // ── 3. Accept → extraction (mocked JSON) → land on the Vision Tree ────────
    await acceptBtn.click()

    // The shared SkillTree (Vision Tree) renders and POPULATES with our quest:
    // its heading proves the tree mounted; the injected title (or branch count)
    // proves the accepted quest landed on it.
    await expect(page.getByText(/your journey/i)).toBeVisible({ timeout: 15_000 })
    await expect(
      page
        .getByText(new RegExp(QUEST.title, 'i'))
        .or(page.getByText(/\b1 quest\b/i))
        .first(),
    ).toBeVisible({ timeout: 15_000 })

    // ── 4. Back to chat → the Active Quest card shows the accepted quest ──────
    await page.getByRole('button', { name: /back to chat/i }).click()
    await expect(composer).toBeVisible({ timeout: 15_000 })

    const activeCard = page.getByText(/active quest/i)
    await expect(activeCard).toBeVisible({ timeout: 15_000 })

    // ── 5. Expand the card → "i did it" → proof handshake (turn 1) ────────────
    await activeCard.click()
    const didItBtn = page.getByRole('button', { name: /i did it/i })
    await expect(didItBtn).toBeVisible({ timeout: 15_000 })
    await freezeCreatureDecay(page) // re-pin before this send
    await didItBtn.click()

    // Turn 1 arms the proof and the Starchild asks for the story (no completion).
    await expect(page.getByText(/how did it feel/i)).toBeVisible({
      timeout: 15_000,
    })

    // ── 6. Send the proof story (turn 2) → quest COMPLETES with celebration ──
    await expect(composer).toBeEnabled({ timeout: 15_000 })
    await freezeCreatureDecay(page) // re-pin before this send
    await composer.fill(PROOF_STORY)
    await composer.press('Enter')

    // Completion signal: the XP celebration burst (+20 XP). The core awards the
    // quest's xp_reward (20) and the web platform emits `quest-completed`, which
    // ChatWindow renders as the XP gain — proof the loop closed.
    await expect(page.getByText(/\+\s*20\s*xp/i)).toBeVisible({ timeout: 15_000 })

    guard.assertClean()
  })
})
