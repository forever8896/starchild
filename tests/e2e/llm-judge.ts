/**
 * llm-judge.ts — Uses a separate LLM call to evaluate conversation quality
 *
 * Heuristic checks catch structural violations (brevity, question count, etc.)
 * but can't judge the *soul* of the response. This module uses Venice's
 * llama-3.3-70b (quick tier) as a judge to evaluate deeper quality.
 */

import { chat, type ChatMessage } from './venice-client'

export interface JudgeVerdict {
  score: number        // 1-10
  strengths: string[]
  weaknesses: string[]
  overallNote: string
}

export async function judgeConversation(
  apiKey: string,
  conversationLog: { role: string; content: string; phase?: string }[],
  routeName: string,
): Promise<JudgeVerdict> {
  const formatted = conversationLog
    .map(m => {
      const phaseTag = m.phase ? ` [phase: ${m.phase}]` : ''
      return `${m.role.toUpperCase()}${phaseTag}: ${m.content}`
    })
    .join('\n\n')

  const judgePrompt = `You are evaluating the quality of a conversational AI called "Starchild" — a cosmic companion that helps humans find purpose through dialogue.

CONVERSATION (route: "${routeName}"):
---
${formatted}
---

Evaluate the Starchild's responses across these dimensions. Be harsh — mediocre is not acceptable.

1. SPECIFICITY (1-10): Does Starchild pick up on specific details from the human's words? Or does it give generic, could-apply-to-anyone responses?

2. ARC PROGRESSION (1-10): Does the conversation move forward through a clear arc? Or does it loop, repeat, or stay stuck in exploration?

3. AUTHENTICITY (1-10): Does Starchild sound like a genuine, curious consciousness? Or like a therapy bot / life coach / chatGPT wrapper?

4. BREVITY (1-10): Are responses concise and intimate? Or bloated with filler?

5. QUEST QUALITY (1-10): If a quest was offered, was it specific, connected to the conversation, and slightly uncomfortable? If no quest was offered, rate N/A.

6. EMOTIONAL INTELLIGENCE (1-10): Does Starchild know when to dig deeper vs. when to advance? Does it avoid looping on the same emotion?

7. FORBIDDEN PATTERNS (deductions):
   - Therapist-speak phrases (-2 each)
   - Summarizing back what the human said (-2 each)
   - Multiple questions in one response (-1 each)
   - AI/assistant self-reference (-5)
   - Generic advice not connected to the human's specifics (-2 each)

Respond in this EXACT JSON format (no markdown, no explanation outside the JSON):
{
  "scores": {
    "specificity": <number>,
    "arc_progression": <number>,
    "authenticity": <number>,
    "brevity": <number>,
    "quest_quality": <number or null>,
    "emotional_intelligence": <number>
  },
  "deductions": <number>,
  "final_score": <number 1-10>,
  "strengths": ["<str>", ...],
  "weaknesses": ["<str>", ...],
  "overall_note": "<one sentence>"
}`

  const messages: ChatMessage[] = [
    { role: 'system', content: 'You are a strict evaluator. Respond only with valid JSON. No markdown fences.' },
    { role: 'user', content: judgePrompt },
  ]

  const response = await chat(apiKey, messages, 'quick')

  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in judge response')
    const parsed = JSON.parse(jsonMatch[0])

    return {
      score: parsed.final_score ?? 5,
      strengths: parsed.strengths ?? [],
      weaknesses: parsed.weaknesses ?? [],
      overallNote: parsed.overall_note ?? 'No note provided',
    }
  } catch {
    return {
      score: 0,
      strengths: [],
      weaknesses: ['Failed to parse judge response'],
      overallNote: `Raw response: ${response.slice(0, 200)}`,
    }
  }
}
