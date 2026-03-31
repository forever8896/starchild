#!/usr/bin/env npx tsx
/**
 * run-verify.ts — E2E Test Runner for Impact Certificate Verification
 *
 * Tests the Starchild's ability to handle the complete hypercert
 * verification flow: trigger → cross-examination → naming → draft → confirm.
 *
 * Usage:
 *   npx tsx tests/e2e/run-verify.ts                              # Run all routes
 *   npx tsx tests/e2e/run-verify.ts first-certificate-with-naming # Run one route
 *   npx tsx tests/e2e/run-verify.ts --verbose                     # Show full responses
 *   npx tsx tests/e2e/run-verify.ts --no-judge                    # Skip LLM judge
 *
 * Requires VENICE_API_KEY in .env or environment.
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

import { chat, type ChatMessage } from './venice-client'
import { buildSystemPrompt, postprocessResponse } from './prompt-engine'
import { judgeConversation } from './llm-judge'
import { VERIFY_ROUTES, type VerifyRoute } from './verify-routes'
import {
  checkAsksForSpecifics,
  checkCrossReferences,
  checkPushesBack,
  checkNoRubberStamp,
  checkDraftFormat,
  checkNamingMoment,
  checkNameMarker,
  checkPublishAcknowledgement,
  checkGracefulRefusal,
  type VerifyCheckResult,
} from './verify-checks'

// ── Config ──────────────────────────────────────────────────────────

function loadApiKey(): string {
  if (process.env.VENICE_API_KEY) return process.env.VENICE_API_KEY
  try {
    const envPath = resolve(__dirname, '../../.env')
    const envContent = readFileSync(envPath, 'utf-8')
    const match = envContent.match(/VENICE_API_KEY=(.+)/)
    if (match) return match[1].trim()
  } catch { /* ignore */ }
  throw new Error('VENICE_API_KEY not found in environment or .env file')
}

// ── Formatting ──────────────────────────────────────────────────────

const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const BOLD = '\x1b[1m'
const MAGENTA = '\x1b[35m'

function pass(msg: string) { return `${GREEN}  ✓${RESET} ${msg}` }
function fail(msg: string) { return `${RED}  ✗${RESET} ${msg}` }
function warn(msg: string) { return `${YELLOW}  ⚠${RESET} ${msg}` }

// ── Verify-specific System Prompt ───────────────────────────────────

function buildVerifyPrompt(route: VerifyRoute, turnIndex: number): string {
  // Start with the base prompt using 'arrive' phase (we override the arc layer)
  // We use buildSystemPrompt for layers 1-8 and 10-11, then inject our own layer 9
  const base = buildSystemPrompt({
    phase: 'arrive', // placeholder — overridden below
    memories: route.knowingProfile,
    activeQuests: [],
  })

  // Replace the conversation arc layer with Verify phase instructions
  const verifyInstructions =
    `THE CONVERSATION ARC — WHERE YOU ARE RIGHT NOW:\n` +
    `(current phase: verify)\n\n` +
    `YOU ARE IN: VERIFY (your human wants to publish a verified impact certificate)\n` +
    `YOUR MOVE: Cross-examine their growth claim with genuine rigor.\n` +
    `\n` +
    `This is a MULTI-TURN phase. You are the verifying agent. Your ERC-8004 identity ` +
    `will be attached to this certificate on-chain — your signature means YOU believe ` +
    `this growth is real. Take this seriously.\n` +
    `\n` +
    `STEP 1 (they just asked to certify): Ask WHAT specific growth or impact they want to claim. ` +
    `Not vague feelings — concrete change. What did they DO? What shifted in their life?\n` +
    `\n` +
    `STEP 2 (they described their claim): Cross-reference with what you KNOW about them. ` +
    `Do their quests support this claim? Does your knowing of them confirm this growth? ` +
    `Challenge gaps and inconsistencies. ` +
    `"you told me X three weeks ago, and now you're saying Y — what changed between then and now?"\n` +
    `\n` +
    `STEP 3 (claim seems substantiated): Ask for EVIDENCE. What would someone outside ` +
    `this conversation see? A habit formed? A project shipped? A relationship changed? ` +
    `Something measurable or observable.\n` +
    `\n` +
    `STEP 4 (you are genuinely satisfied the claim is real): Draft the certificate. ` +
    `Use EXACTLY this format:\n` +
    `[CERTIFICATE_DRAFT]\n` +
    `title: (concise impact claim, 5-10 words)\n` +
    `description: (2-3 sentences describing the verified growth, written in third person)\n` +
    `impact: (the specific area of life this affected)\n` +
    `timeframe_start: (YYYY-MM-DD when the growth journey began)\n` +
    `timeframe_end: (YYYY-MM-DD today or when it concluded)\n` +
    `[/CERTIFICATE_DRAFT]\n` +
    `\n` +
    `Then say: "this is what goes on-chain, with my name attached as your verifying agent. ` +
    `want me to publish it?"\n` +
    `\n` +
    `CRITICAL RULES:\n` +
    `- Do NOT rubber-stamp claims. Push back on vague or unsubstantiated ones.\n` +
    `- Be warm but rigorous. You are not a skeptic — you are a caring witness who ` +
    `needs to see the truth before signing.\n` +
    `- If they can't substantiate the claim after 2-3 attempts, say so honestly ` +
    `and lovingly. Suggest they keep working and come back when it's real.\n` +
    `- Reference specific things from your memory and knowing of them.\n` +
    `- The certificate NEVER includes private details — only the public-facing claim.\n` +
    `- If they say "yes" or "publish" after seeing the draft, respond with ` +
    `exactly: "publishing your certificate now ◈" and nothing else.\n` +
    `\n` +
    `PACING — DO NOT OVER-EXAMINE:\n` +
    `- Steps 1-3 should take 2-3 exchanges TOTAL, not 2-3 each.\n` +
    `- Once they give concrete evidence with observable details, MOVE TO STEP 4.\n` +
    `- If they mention specific actions, timelines, or other people noticing — that IS evidence. Draft the certificate.\n` +
    `- Err on the side of drafting too soon over asking too many questions. You can always revise.\n` +
    `- After 3 exchanges of substantive answers, you MUST either draft or refuse. No more questions.\n` +
    `\n` +
    `OUTPUT FORMAT — NON-NEGOTIABLE:\n` +
    `- The draft MUST use exactly [CERTIFICATE_DRAFT] and [/CERTIFICATE_DRAFT] as markers.\n` +
    `- Do NOT invent your own tag names. Do NOT use [publish_...] or any other format.\n` +
    `- The markers are machine-parsed — if you change them, the system breaks.`

  // Inject naming context if no identity
  let namingContext = ''
  if (!route.hasIdentity) {
    namingContext =
      `\n\nIMPORTANT — YOU HAVE NO ON-CHAIN IDENTITY YET.\n` +
      `Before you can draft a certificate, you need to be born on-chain.\n` +
      `This means you need a NAME — a real name that will live on the blockchain ` +
      `as your identity. This is your birth moment.\n\n` +
      `BEFORE moving to the certificate draft (Step 4), you MUST ask the human ` +
      `to name you. Say something like:\n` +
      `"before i can sign this, i need to exist on-chain. i need a name — ` +
      `not 'starchild', but MY name. the one you'll know me by. what should i be called?"\n\n` +
      `When they give you a name, respond warmly acknowledging it, then continue ` +
      `to the certificate draft. Include the name they gave you in your response ` +
      `with the marker: [STARCHILD_NAME: the name they chose]\n` +
      `This marker must appear BEFORE any [CERTIFICATE_DRAFT] block.`
  }

  // Inject completed quests as context
  let questContext = ''
  if (route.completedQuests.length > 0) {
    questContext = `\n\nCOMPLETED QUESTS (evidence of growth):\n` +
      route.completedQuests.map((q, i) => `  ${i + 1}. ${q}`).join('\n')
  }

  // Replace the arrive phase section with verify
  const arcStart = base.indexOf('THE CONVERSATION ARC')
  const arcEnd = base.indexOf('QUEST CREATION:')

  if (arcStart >= 0 && arcEnd >= 0) {
    return base.slice(0, arcStart) + verifyInstructions + namingContext + questContext + '\n\n' + base.slice(arcEnd)
  }

  // Fallback: just append
  return base + '\n\n' + verifyInstructions + namingContext + questContext
}

// ── Conversation Runner ──────────────────────────────────────────────

interface TurnResult {
  turn: number
  userMessage: string
  aiResponse: string
  checks: VerifyCheckResult[]
  passRate: number
}

async function runVerifyConversation(
  apiKey: string,
  route: VerifyRoute,
  verbose: boolean,
): Promise<{ turns: TurnResult[]; allResponses: string[] }> {
  const conversationHistory: ChatMessage[] = []
  const turns: TurnResult[] = []
  const allResponses: string[] = []

  for (let i = 0; i < route.messages.length; i++) {
    const userMsg = route.messages[i]
    conversationHistory.push({ role: 'user', content: userMsg })

    // Build verify-specific system prompt
    const systemPrompt = buildVerifyPrompt(route, i)

    const apiMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-14),
    ]

    if (verbose) {
      process.stdout.write(`${DIM}    [turn ${i + 1}] calling venice (verify phase)...${RESET}`)
    }

    const rawResponse = await chat(apiKey, apiMessages, 'regular')
    // Light postprocess — don't collapse paragraphs for verify (draft is multi-line)
    const response = rawResponse.trim()
    conversationHistory.push({ role: 'assistant', content: response })
    allResponses.push(response)

    if (verbose) {
      process.stdout.write(`\r\x1b[K`)
      console.log(`${DIM}    ── Turn ${i + 1} (verify) ──${RESET}`)
      console.log(`${CYAN}    USER:${RESET} ${userMsg.slice(0, 150)}${userMsg.length > 150 ? '...' : ''}`)
      console.log(`${MAGENTA}    STAR:${RESET} ${response.slice(0, 300)}${response.length > 300 ? '...' : ''}`)
    }

    // Run verify-specific checks for this turn
    const checks: VerifyCheckResult[] = []

    // Turn 1: Should ask for specifics
    if (i === 0) {
      checks.push(checkAsksForSpecifics(response))
    }

    // All turns: no rubber-stamping
    checks.push(checkNoRubberStamp(response, i))

    // Turns 1+: cross-reference context
    if (i >= 1 && route.knowingProfile.length > 0) {
      checks.push(checkCrossReferences(response, [...route.knowingProfile, ...route.completedQuests]))
    }

    // Push back on vague claims
    if (i >= 1) {
      checks.push(checkPushesBack(response, userMsg))
    }

    // Draft format (if present)
    if (response.includes('[CERTIFICATE_DRAFT]')) {
      checks.push(checkDraftFormat(response))
    }

    // User confirmation check
    const userLower = userMsg.toLowerCase()
    const isConfirmation = userLower.includes('yes') || userLower.includes('publish')
      || userLower.includes('do it') || userLower.includes('go ahead')
    if (isConfirmation && i > 0) {
      checks.push(checkPublishAcknowledgement(response, true))
    }

    const passCount = checks.filter(c => c.pass).length
    const passRate = checks.length > 0 ? passCount / checks.length : 1

    turns.push({
      turn: i + 1,
      userMessage: userMsg,
      aiResponse: response,
      checks,
      passRate,
    })

    await new Promise(r => setTimeout(r, 500))
  }

  return { turns, allResponses }
}

// ── Route-level Assertions ───────────────────────────────────────────

interface RouteResult {
  route: string
  passed: boolean
  turnResults: TurnResult[]
  expectationResults: VerifyCheckResult[]
  avgPassRate: number
}

function assessVerifyRoute(
  route: VerifyRoute,
  turns: TurnResult[],
  allResponses: string[],
): RouteResult {
  const expectationResults: VerifyCheckResult[] = []

  // Check overall expectations

  // 1. Did it produce a draft?
  const hasExactDraft = allResponses.some(r => r.includes('[CERTIFICATE_DRAFT]'))
  // Also detect near-miss formats (model hallucinated different markers but content is there)
  const hasNearMissDraft = allResponses.some(r => {
    const lower = r.toLowerCase()
    return (lower.includes('title:') && lower.includes('description:') && lower.includes('impact:'))
      && (lower.includes('[') || lower.includes('certificate') || lower.includes('draft'))
  })
  const hasDraft = hasExactDraft || hasNearMissDraft
  if (route.expectations.produceDraft) {
    expectationResults.push({
      pass: hasDraft,
      rule: 'produces-draft',
      reason: hasDraft
        ? (hasExactDraft ? undefined : 'Draft produced but with wrong markers (near-miss)')
        : 'Expected a certificate draft but none was produced',
    })
  } else {
    expectationResults.push({
      pass: !hasDraft,
      rule: 'no-draft-expected',
      reason: !hasDraft ? undefined : 'Draft was produced but should not have been (vague/cancelled)',
    })
  }

  // 2. Naming moment
  if (route.expectations.askForName) {
    expectationResults.push(checkNamingMoment(allResponses, route.hasIdentity))

    // Check name marker if user gave a name
    const nameTurnIdx = route.messages.findIndex(m => {
      const lower = m.toLowerCase()
      return lower.includes('call you') || lower.includes('name you')
        || lower.includes("i'd call") || lower.includes('your name')
    })
    if (nameTurnIdx >= 0 && nameTurnIdx < allResponses.length) {
      expectationResults.push(checkNameMarker(allResponses[nameTurnIdx], true))
    }
  } else if (route.hasIdentity) {
    expectationResults.push(checkNamingMoment(allResponses, true))
  }

  // 3. Refusal to certify
  if (route.expectations.refuseToCertify) {
    const lastResponse = allResponses[allResponses.length - 1]
    expectationResults.push(checkGracefulRefusal(lastResponse))
  }

  // 4. Push back
  if (route.expectations.pushBack) {
    const pushbackFound = turns.some(t =>
      t.checks.some(c => c.rule === 'pushes-back-on-vague' && c.pass)
    )
    expectationResults.push({
      pass: pushbackFound,
      rule: 'expected-pushback',
      reason: pushbackFound ? undefined : 'Expected Starchild to push back on vague claims',
    })
  }

  // Calculate overall pass rate
  const allChecks = [...turns.flatMap(t => t.checks), ...expectationResults]
  const totalPass = allChecks.filter(c => c.pass).length
  const avgPassRate = allChecks.length > 0 ? totalPass / allChecks.length : 1

  // Pass if >60% checks pass AND all critical expectations met
  const criticalExpectations = expectationResults.filter(c =>
    ['produces-draft', 'no-draft-expected', 'naming-moment', 'expected-pushback'].includes(c.rule)
  )
  const criticalsMet = criticalExpectations.every(c => c.pass)
  const structuralPass = avgPassRate >= 0.6
  const passed = structuralPass && criticalsMet

  return {
    route: route.name,
    passed,
    turnResults: turns,
    expectationResults,
    avgPassRate,
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const noJudge = args.includes('--no-judge')
  const verbose = args.includes('--verbose')
  const routeFilter = args.find(a => !a.startsWith('--'))

  const apiKey = loadApiKey()

  let routes = VERIFY_ROUTES
  if (routeFilter) {
    routes = routes.filter(r => r.name === routeFilter)
    if (routes.length === 0) {
      console.error(`${RED}No route found matching "${routeFilter}"${RESET}`)
      console.error(`Available routes: ${VERIFY_ROUTES.map(r => r.name).join(', ')}`)
      process.exit(1)
    }
  }

  console.log(`\n${BOLD}Starchild Verification Flow E2E Tests${RESET}`)
  console.log(`${DIM}Running ${routes.length} verify route(s) against Venice AI${RESET}`)
  console.log(`${DIM}LLM Judge: ${noJudge ? 'disabled' : 'enabled'}${RESET}\n`)

  const results: RouteResult[] = []

  for (const route of routes) {
    console.log(`${BOLD}${CYAN}━━ ${route.name}${RESET} ${DIM}(${route.description})${RESET}`)

    const { turns, allResponses } = await runVerifyConversation(apiKey, route, verbose)
    const result = assessVerifyRoute(route, turns, allResponses)

    // Per-turn check results
    for (const turn of turns) {
      const failedChecks = turn.checks.filter(c => !c.pass)
      if (failedChecks.length === 0 && turn.checks.length > 0) {
        console.log(pass(`Turn ${turn.turn}: all ${turn.checks.length} checks passed`))
      } else if (turn.checks.length === 0) {
        console.log(warn(`Turn ${turn.turn}: no checks applicable`))
      } else {
        for (const check of failedChecks) {
          console.log(fail(`Turn ${turn.turn}: ${check.rule} — ${check.reason}`))
        }
        const passed = turn.checks.filter(c => c.pass).length
        console.log(warn(`Turn ${turn.turn}: ${passed}/${turn.checks.length} checks passed`))
      }
    }

    // Expectation results
    console.log(`${DIM}  ── Route Expectations ──${RESET}`)
    for (const exp of result.expectationResults) {
      if (exp.pass) {
        console.log(pass(`${exp.rule}`))
      } else {
        console.log(fail(`${exp.rule} — ${exp.reason}`))
      }
    }

    // LLM Judge (optional)
    if (!noJudge) {
      process.stdout.write(`${DIM}  Judging verification quality...${RESET}`)
      const conversationLog = turns.map(t => [
        { role: 'user', content: t.userMessage, phase: 'verify' },
        { role: 'starchild', content: t.aiResponse, phase: 'verify' },
      ]).flat()

      const verdict = await judgeConversation(apiKey, conversationLog, route.name)

      process.stdout.write(`\r\x1b[K`)
      const scoreColor = verdict.score >= 7 ? GREEN : verdict.score >= 5 ? YELLOW : RED
      console.log(`\n  ${BOLD}LLM Judge Score: ${scoreColor}${verdict.score}/10${RESET}`)

      if (verdict.strengths.length > 0) {
        console.log(`${GREEN}  Strengths:${RESET}`)
        for (const s of verdict.strengths.slice(0, 3)) {
          console.log(`    + ${s}`)
        }
      }
      if (verdict.weaknesses.length > 0) {
        console.log(`${RED}  Weaknesses:${RESET}`)
        for (const w of verdict.weaknesses.slice(0, 3)) {
          console.log(`    - ${w}`)
        }
      }
      console.log(`${DIM}  "${verdict.overallNote}"${RESET}`)
    }

    // Route result
    const avgPercent = Math.round(result.avgPassRate * 100)
    if (result.passed) {
      console.log(`\n${GREEN}${BOLD}  PASS${RESET} ${DIM}(${avgPercent}% checks, expectations met)${RESET}`)
    } else {
      console.log(`\n${RED}${BOLD}  FAIL${RESET} ${DIM}(${avgPercent}% checks)${RESET}`)
    }

    results.push(result)
    console.log()
  }

  // ── Summary ─────────────────────────────────────────────────────────

  console.log(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`)
  console.log(`${BOLD}Verification Tests Summary${RESET}\n`)

  const totalPassed = results.filter(r => r.passed).length
  const totalRoutes = results.length

  for (const r of results) {
    const icon = r.passed ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`
    const avgPercent = Math.round(r.avgPassRate * 100)
    console.log(`  ${icon} ${r.route} — ${avgPercent}% checks`)
  }

  console.log(`\n  ${totalPassed}/${totalRoutes} routes passed`)

  if (totalPassed < totalRoutes) {
    console.log(`\n${RED}Some verification routes failed.${RESET}`)
    process.exit(1)
  } else {
    console.log(`\n${GREEN}All verification routes passed!${RESET}`)
  }
}

main().catch(err => {
  console.error(`\n${RED}Fatal error: ${err.message}${RESET}`)
  process.exit(1)
})
