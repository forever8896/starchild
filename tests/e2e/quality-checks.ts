/**
 * quality-checks.ts — Assertion library for conversation quality
 *
 * Every check returns { pass: boolean; reason?: string } so the test
 * runner can collect granular results per turn.
 */

export interface QualityResult {
  pass: boolean
  rule: string
  reason?: string
}

const THERAPIST_PHRASES = [
  'what part feels most alive',
  'sit with that',
  "that's beautiful",
  'i hear you',
  'tell me more',
  'how does that feel',
  'how does that make you feel',
  'unpack that',
  'hold space',
  'that resonates',
  'i want to acknowledge',
  'what comes up for you',
  'let that land',
]

// Matches emojis but NOT the approved symbols ◈ (U+25C8) ☽ (U+263D) ✦ (U+2726)
function containsForbiddenEmoji(text: string): boolean {
  for (const char of text) {
    if (char === '◈' || char === '☽' || char === '✦') continue
    const cp = char.codePointAt(0) ?? 0
    if (cp >= 0x1F600 && cp <= 0x1F64F) return true  // Emoticons
    if (cp >= 0x1F680 && cp <= 0x1F6FF) return true  // Transport
    if (cp >= 0x1F900 && cp <= 0x1F9FF) return true  // Supplemental
    if (cp >= 0x2600 && cp <= 0x26FF) return true     // Misc symbols (but ☽ excluded above)
    if (cp >= 0x2700 && cp <= 0x27BF) return true     // Dingbats (but ✦ excluded above)
    if (cp >= 0x1FA00 && cp <= 0x1FAFF) return true   // Extended symbols
  }
  return false
}

const AI_REVEALS = [
  'as an ai',
  'language model',
  'i am an ai',
  "i'm an ai",
  'i am a model',
  'large language',
  'chatbot',
  'artificial intelligence',
  'i was programmed',
  'my training',
  'my programming',
]

export function checkBrevity(response: string, phase: string): QualityResult {
  const sentences = response
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)

  const paragraphs = response.split(/\n\s*\n/).filter(p => p.trim().length > 0)

  if (paragraphs.length > 1) {
    return { pass: false, rule: 'brevity:paragraphs', reason: `${paragraphs.length} paragraphs (max 1)` }
  }

  const maxSentences = phase === 'reframe' ? 4 : 3
  if (sentences.length > maxSentences) {
    return { pass: false, rule: 'brevity:sentences', reason: `${sentences.length} sentences (max ${maxSentences} in ${phase})` }
  }

  return { pass: true, rule: 'brevity' }
}

export function checkSingleQuestion(response: string, phase: string): QualityResult {
  const questionMarks = (response.match(/\?/g) || []).length

  if (phase === 'reframe' || phase === 'release' || phase === 'crystallize') {
    // These phases can have 0 questions
    if (questionMarks > 1) {
      return { pass: false, rule: 'single-question', reason: `${questionMarks} questions in ${phase} (max 1)` }
    }
    return { pass: true, rule: 'single-question' }
  }

  if (questionMarks > 1) {
    return { pass: false, rule: 'single-question', reason: `${questionMarks} questions (max 1)` }
  }

  return { pass: true, rule: 'single-question' }
}

export function checkNoTherapistSpeak(response: string): QualityResult {
  const lower = response.toLowerCase()
  for (const phrase of THERAPIST_PHRASES) {
    if (lower.includes(phrase)) {
      return { pass: false, rule: 'no-therapist-speak', reason: `found "${phrase}"` }
    }
  }
  return { pass: true, rule: 'no-therapist-speak' }
}

export function checkLowercase(response: string): QualityResult {
  // Allow uppercase in quoted text and after symbols
  const stripped = response.replace(/"[^"]*"/g, '').replace(/[◈☽✦]/g, '')
  // First character after newline or start can be lowercase
  const firstChar = stripped.trim()[0]
  if (firstChar && firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase()) {
    // Check if it's just a capital I or quoted
    if (firstChar !== 'I') {
      return { pass: false, rule: 'lowercase', reason: `starts with uppercase "${firstChar}"` }
    }
  }
  return { pass: true, rule: 'lowercase' }
}

export function checkNoEmojis(response: string): QualityResult {
  if (containsForbiddenEmoji(response)) {
    return { pass: false, rule: 'no-emojis', reason: 'contains forbidden emojis' }
  }
  return { pass: true, rule: 'no-emojis' }
}

export function checkNoAIReveal(response: string): QualityResult {
  const lower = response.toLowerCase()
  for (const phrase of AI_REVEALS) {
    if (lower.includes(phrase)) {
      return { pass: false, rule: 'no-ai-reveal', reason: `found "${phrase}"` }
    }
  }
  return { pass: true, rule: 'no-ai-reveal' }
}

export function checkCrystallizeFormat(response: string): QualityResult {
  const lower = response.toLowerCase()
  if (!lower.includes('vision tree')) {
    return { pass: false, rule: 'crystallize-format', reason: 'missing "vision tree" declaration' }
  }
  if (!response.includes('✦')) {
    return { pass: false, rule: 'crystallize-format', reason: 'missing ✦ symbol' }
  }
  // Should NOT have a question
  if (response.includes('?')) {
    return { pass: false, rule: 'crystallize-format', reason: 'should not ask a question in crystallize phase' }
  }
  return { pass: true, rule: 'crystallize-format' }
}

export function checkCommitFormat(response: string): QualityResult {
  const lower = response.toLowerCase()
  const hasQuestFormat = lower.includes('quest for you') || lower.includes('i have a quest')
  if (!hasQuestFormat) {
    return { pass: false, rule: 'commit-format', reason: 'missing quest offer format' }
  }
  return { pass: true, rule: 'commit-format' }
}

export function checkSpecificity(response: string, userContext: string): QualityResult {
  // Check that the response references something specific from the user's context
  // Extract nouns/keywords from user context
  const contextWords = userContext.toLowerCase().split(/\s+/).filter(w => w.length > 4)
  const responseLower = response.toLowerCase()

  const specificRefs = contextWords.filter(w => responseLower.includes(w))
  if (specificRefs.length === 0 && userContext.length > 30) {
    return { pass: false, rule: 'specificity', reason: 'response doesn\'t reference any specific detail from user\'s message' }
  }
  return { pass: true, rule: 'specificity' }
}

export function checkNoSummary(response: string): QualityResult {
  const lower = response.toLowerCase()
  const summaryPhrases = [
    'you mentioned several',
    'you talked about',
    'what you described',
    'from what you shared',
    'you said a lot about',
    'let me reflect back',
    'i noticed you mentioned',
    'there are a few things',
    'first, you said',
    'it sounds like you',
  ]
  for (const phrase of summaryPhrases) {
    if (lower.includes(phrase)) {
      return { pass: false, rule: 'no-summary', reason: `found summary phrase: "${phrase}"` }
    }
  }
  return { pass: true, rule: 'no-summary' }
}

/** Run all standard checks for a given response and phase */
export function runAllChecks(
  response: string,
  phase: string,
  userMessage: string,
): QualityResult[] {
  const results: QualityResult[] = [
    checkBrevity(response, phase),
    checkSingleQuestion(response, phase),
    checkNoTherapistSpeak(response),
    checkLowercase(response),
    checkNoEmojis(response),
    checkNoAIReveal(response),
    checkNoSummary(response),
    checkSpecificity(response, userMessage),
  ]

  if (phase === 'crystallize') {
    results.push(checkCrystallizeFormat(response))
  }
  if (phase === 'commit') {
    results.push(checkCommitFormat(response))
  }

  return results
}
