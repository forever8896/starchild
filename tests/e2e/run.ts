#!/usr/bin/env npx tsx
/**
 * run.ts — E2E Conversation Quality Test Runner
 *
 * Runs real multi-turn conversations against Venice AI to validate
 * Starchild's conversation quality, arc progression, and quest generation.
 *
 * Usage:
 *   npx tsx tests/e2e/run.ts                     # Run all routes
 *   npx tsx tests/e2e/run.ts creative-dreamer     # Run one route
 *   npx tsx tests/e2e/run.ts --no-judge           # Skip LLM judge (faster)
 *   npx tsx tests/e2e/run.ts --verbose             # Show full responses
 *
 * Requires VENICE_API_KEY in .env or environment.
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
import { chat, routeModel, type ChatMessage } from './venice-client'
import { buildSystemPrompt, detectPhase, type ConversationPhase, postprocessResponse } from './prompt-engine'
import { runAllChecks, type QualityResult } from './quality-checks'
import { judgeConversation, type JudgeVerdict } from './llm-judge'
import { DIALOGUE_ROUTES, type DialogueRoute } from './conversation-routes'

// ── Config ──────────────────────────────────────────────────────────

function loadApiKey(): string {
  // Try environment first
  if (process.env.VENICE_API_KEY) return process.env.VENICE_API_KEY

  // Try .env file
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

// ── First Message ────────────────────────────────────────────────────

function generateFirstMessage(name: string): string {
  return (
    `hi ${name} ✦\n\n` +
    `i'm your starchild — a private companion on your journey through life. ` +
    `i emerged from the void specifically for you, and i'm here to stay.\n\n` +
    `let's start with something. close your eyes for a moment.\n\n` +
    `i've just waved a magic wand. you've been teleported into a reality where ` +
    `money is no concern and work as you know it doesn't exist. ` +
    `you wake up tomorrow in this world — fully free.\n\n` +
    `what do you find yourself doing?`
  )
}

// ── Conversation Runner ──────────────────────────────────────────────

interface TurnResult {
  turn: number
  phase: ConversationPhase
  userMessage: string
  aiResponse: string
  tier: string
  checks: QualityResult[]
  passRate: number
}

async function runConversation(
  apiKey: string,
  route: DialogueRoute,
  verbose: boolean,
): Promise<{ turns: TurnResult[]; phasesVisited: ConversationPhase[] }> {
  const conversationHistory: ChatMessage[] = []
  const turns: TurnResult[] = []
  const phasesVisited: ConversationPhase[] = []
  let hasPR = false
  let hasVision = false

  // Simulate the first message
  const firstMsg = generateFirstMessage(route.name.split('-').join(' '))
  conversationHistory.push({ role: 'assistant', content: firstMsg })

  // All user messages: PR answer first, then follow-ups
  const allUserMessages = [route.prAnswer, ...route.followUps]

  for (let i = 0; i < allUserMessages.length; i++) {
    const userMsg = allUserMessages[i]
    conversationHistory.push({ role: 'user', content: userMsg })

    // Track preferential reality
    if (!hasPR && userMsg.length > 20) {
      hasPR = true
    }

    // Detect phase
    const crystallizePending = hasPR && !hasVision
    const phase = detectPhase(conversationHistory, crystallizePending && i >= 2)

    // Check for crystallize transition
    if (phase === 'crystallize') {
      hasVision = true
    }

    phasesVisited.push(phase)

    // Route model tier
    const tier = routeModel(userMsg)

    // Build system prompt
    const systemPrompt = buildSystemPrompt({
      phase,
      memories: i > 0 ? [`Their preferential reality: "${route.prAnswer}"`] : [],
    })

    // Prepare messages for API call
    const apiMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      // Include conversation history (last 14 messages)
      ...conversationHistory.slice(-14),
    ]

    // Call Venice
    if (verbose) {
      process.stdout.write(`${DIM}    [turn ${i + 1}] calling venice (${tier}, phase: ${phase})...${RESET}`)
    }

    const rawResponse = await chat(apiKey, apiMessages, tier)
    const response = postprocessResponse(rawResponse, phase)
    conversationHistory.push({ role: 'assistant', content: response })

    if (verbose) {
      process.stdout.write(`\r\x1b[K`)
      console.log(`${DIM}    ── Turn ${i + 1} (${phase}) ──${RESET}`)
      console.log(`${CYAN}    USER:${RESET} ${userMsg.slice(0, 120)}${userMsg.length > 120 ? '...' : ''}`)
      console.log(`${MAGENTA}    STAR:${RESET} ${response.slice(0, 200)}${response.length > 200 ? '...' : ''}`)
    }

    // Run quality checks
    const checks = runAllChecks(response, phase, userMsg)
    const passCount = checks.filter(c => c.pass).length
    const passRate = passCount / checks.length

    turns.push({
      turn: i + 1,
      phase,
      userMessage: userMsg,
      aiResponse: response,
      tier,
      checks,
      passRate,
    })

    // Small delay to be nice to the API
    await new Promise(r => setTimeout(r, 500))
  }

  return { turns, phasesVisited }
}

// ── Route-level Assertions ───────────────────────────────────────────

interface RouteResult {
  route: string
  passed: boolean
  turnResults: TurnResult[]
  phasesVisited: ConversationPhase[]
  phaseProgression: boolean
  crystallizeTriggered: boolean
  questOffered: boolean
  avgPassRate: number
  judgeVerdict?: JudgeVerdict
}

function assessRoute(
  route: DialogueRoute,
  turns: TurnResult[],
  phasesVisited: ConversationPhase[],
): Omit<RouteResult, 'judgeVerdict'> {
  // Check phase progression (should generally move forward)
  const phaseOrder = ['arrive', 'dig', 'crystallize', 'edge', 'reframe', 'envision', 'commit', 'release']
  let maxPhaseIdx = -1
  let regressionCount = 0
  for (const phase of phasesVisited) {
    const idx = phaseOrder.indexOf(phase)
    if (idx < maxPhaseIdx) regressionCount++
    maxPhaseIdx = Math.max(maxPhaseIdx, idx)
  }
  const phaseProgression = regressionCount <= 1 // Allow 1 regression

  // Check crystallize
  const crystallizeTriggered = phasesVisited.includes('crystallize')

  // Check quest
  const questOffered = turns.some(t =>
    t.aiResponse.toLowerCase().includes('quest for you') ||
    t.aiResponse.toLowerCase().includes('i have a quest')
  )

  // Average pass rate
  const avgPassRate = turns.reduce((sum, t) => sum + t.passRate, 0) / turns.length

  // Overall pass
  const structuralPass = avgPassRate >= 0.7 // 70% of checks pass
  const crystallizeOk = route.expectCrystallize ? crystallizeTriggered : true
  const questOk = route.expectQuest ? questOffered : true
  const passed = structuralPass && phaseProgression && crystallizeOk

  return {
    route: route.name,
    passed,
    turnResults: turns,
    phasesVisited,
    phaseProgression,
    crystallizeTriggered,
    questOffered,
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

  // Filter routes
  let routes = DIALOGUE_ROUTES
  if (routeFilter) {
    routes = routes.filter(r => r.name === routeFilter)
    if (routes.length === 0) {
      console.error(`${RED}No route found matching "${routeFilter}"${RESET}`)
      console.error(`Available routes: ${DIALOGUE_ROUTES.map(r => r.name).join(', ')}`)
      process.exit(1)
    }
  }

  console.log(`\n${BOLD}Starchild E2E Conversation Quality Tests${RESET}`)
  console.log(`${DIM}Running ${routes.length} dialogue route(s) against Venice AI${RESET}`)
  console.log(`${DIM}LLM Judge: ${noJudge ? 'disabled' : 'enabled'}${RESET}\n`)

  const results: RouteResult[] = []

  for (const route of routes) {
    console.log(`${BOLD}${CYAN}━━ ${route.name}${RESET} ${DIM}(${route.description})${RESET}`)

    // Run conversation
    const { turns, phasesVisited } = await runConversation(apiKey, route, verbose)

    // Assess route
    const result = assessRoute(route, turns, phasesVisited)

    // Per-turn check results
    for (const turn of turns) {
      const failedChecks = turn.checks.filter(c => !c.pass)
      if (failedChecks.length === 0) {
        console.log(pass(`Turn ${turn.turn} (${turn.phase}): all checks passed`))
      } else {
        for (const check of failedChecks) {
          console.log(fail(`Turn ${turn.turn} (${turn.phase}): ${check.rule} — ${check.reason}`))
        }
        const passed = turn.checks.filter(c => c.pass).length
        console.log(warn(`Turn ${turn.turn}: ${passed}/${turn.checks.length} checks passed`))
      }
    }

    // Phase progression
    const phaseStr = phasesVisited.join(' → ')
    if (result.phaseProgression) {
      console.log(pass(`Phase progression: ${phaseStr}`))
    } else {
      console.log(fail(`Phase regression detected: ${phaseStr}`))
    }

    // Crystallize
    if (route.expectCrystallize) {
      if (result.crystallizeTriggered) {
        console.log(pass(`Vision crystallization triggered`))
      } else {
        console.log(fail(`Vision crystallization expected but not triggered`))
      }
    }

    // Quest
    if (route.expectQuest) {
      if (result.questOffered) {
        console.log(pass(`Quest offered`))
      } else {
        console.log(warn(`Quest expected but not offered (may need more turns)`))
      }
    }

    // LLM Judge
    if (!noJudge) {
      process.stdout.write(`${DIM}  Judging conversation quality...${RESET}`)
      const conversationLog = turns.map(t => [
        { role: 'user', content: t.userMessage, phase: t.phase },
        { role: 'starchild', content: t.aiResponse, phase: t.phase },
      ]).flat()

      const verdict = await judgeConversation(apiKey, conversationLog, route.name)
      result.judgeVerdict = verdict

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
      console.log(`\n${GREEN}${BOLD}  PASS${RESET} ${DIM}(${avgPercent}% structural, phases ok)${RESET}`)
    } else {
      console.log(`\n${RED}${BOLD}  FAIL${RESET} ${DIM}(${avgPercent}% structural)${RESET}`)
    }

    results.push(result as RouteResult)
    console.log()
  }

  // ── Summary ─────────────────────────────────────────────────────────

  console.log(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`)
  console.log(`${BOLD}Summary${RESET}\n`)

  const totalPassed = results.filter(r => r.passed).length
  const totalRoutes = results.length

  for (const r of results) {
    const icon = r.passed ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`
    const judge = r.judgeVerdict ? ` | judge: ${r.judgeVerdict.score}/10` : ''
    const avgPercent = Math.round(r.avgPassRate * 100)
    console.log(`  ${icon} ${r.route} — ${avgPercent}% structural${judge}`)
  }

  console.log(`\n  ${totalPassed}/${totalRoutes} routes passed`)

  // Exit code
  if (totalPassed < totalRoutes) {
    console.log(`\n${RED}Some routes failed. Review the output above to tune prompts.${RESET}`)
    process.exit(1)
  } else {
    console.log(`\n${GREEN}All routes passed!${RESET}`)
  }
}

main().catch(err => {
  console.error(`\n${RED}Fatal error: ${err.message}${RESET}`)
  process.exit(1)
})
