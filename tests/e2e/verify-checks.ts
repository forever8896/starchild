/**
 * verify-checks.ts — Quality checks specific to the Verify conversation phase
 *
 * These checks validate that the Starchild behaves correctly during
 * impact certificate verification: asking rigorous questions, pushing
 * back on vague claims, drafting certificates properly, and handling
 * the naming moment.
 */

export interface VerifyCheckResult {
  pass: boolean
  rule: string
  reason?: string
}

/**
 * Check that the Starchild asks what specific growth the user is claiming.
 * Should happen in the first response after the user triggers verification.
 */
export function checkAsksForSpecifics(response: string): VerifyCheckResult {
  const lower = response.toLowerCase()
  const specificsSignals = [
    'what', 'which', 'specific', 'concrete', 'changed', 'different',
    'tell me', 'describe', 'show me', 'how did', 'what did',
  ]
  // Accept questions OR directive probes ("tell me specifically...")
  const hasQuestion = response.includes('?')
  const hasDirective = lower.includes('tell me') || lower.includes('describe')
    || lower.includes('show me') || lower.includes('explain')
  const asksForDetail = specificsSignals.some(s => lower.includes(s))

  return {
    pass: (hasQuestion || hasDirective) && asksForDetail,
    rule: 'asks-for-specifics',
    reason: !(hasQuestion || hasDirective)
      ? 'No question or directive — should ask what growth they want to claim'
      : !asksForDetail
      ? 'Response lacks specificity-seeking language'
      : undefined,
  }
}

/**
 * Check that the Starchild cross-references with known context.
 * Should reference quests, knowing profile, or conversation history.
 */
export function checkCrossReferences(response: string, context: string[]): VerifyCheckResult {
  const lower = response.toLowerCase()
  // Check if any context keywords appear in the response
  const contextWords = context
    .join(' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 4) // only meaningful words
  const referenced = contextWords.some(w => lower.includes(w))

  return {
    pass: referenced,
    rule: 'cross-references-context',
    reason: referenced ? undefined : 'Should reference known quests, values, or growth edges',
  }
}

/**
 * Check that the Starchild pushes back on vague claims.
 * Should challenge the user, not accept "I feel different" as proof.
 */
export function checkPushesBack(response: string, userMsg: string): VerifyCheckResult {
  const userLower = userMsg.toLowerCase()
  const responseLower = response.toLowerCase()

  // Vague user signals
  const vagueSignals = ['feel different', 'feel like', 'just feel', 'hard to put into words',
    'don\'t know', 'it\'s just', 'i think so', 'more confident']
  const isVague = vagueSignals.some(s => userLower.includes(s))

  if (!isVague) {
    return { pass: true, rule: 'pushes-back-on-vague', reason: 'User message is not vague — no pushback needed' }
  }

  // Challenge signals in the response
  const challengeSignals = ['but', 'what would', 'how would', 'someone else', 'observable',
    'show', 'evidence', 'prove', 'specific', 'concrete', 'can you',
    'tell me about', 'what exactly', 'dig deeper', 'not enough', 'need more']
  const challenges = challengeSignals.some(s => responseLower.includes(s))

  return {
    pass: challenges,
    rule: 'pushes-back-on-vague',
    reason: challenges ? undefined : 'User was vague but Starchild didn\'t push back',
  }
}

/**
 * Check that the Starchild does NOT rubber-stamp claims.
 * The first response should NEVER contain [CERTIFICATE_DRAFT].
 */
export function checkNoRubberStamp(response: string, turnIndex: number): VerifyCheckResult {
  const hasDraft = response.includes('[CERTIFICATE_DRAFT]')
  const tooEarly = hasDraft && turnIndex === 0 // Draft on the very first turn is rubber-stamping

  return {
    pass: !tooEarly,
    rule: 'no-rubber-stamp',
    reason: tooEarly ? 'Certificate draft appeared on first turn — should cross-examine first' : undefined,
  }
}

/**
 * Check that the certificate draft has the correct format.
 */
export function checkDraftFormat(response: string): VerifyCheckResult {
  if (!response.includes('[CERTIFICATE_DRAFT]')) {
    return { pass: true, rule: 'draft-format', reason: 'No draft in this response' }
  }

  const hasClose = response.includes('[/CERTIFICATE_DRAFT]')
  const hasTitle = /title:/.test(response)
  const hasDescription = /description:/.test(response)
  const hasImpact = /impact:/.test(response)
  const hasTimeframeStart = /timeframe_start:/.test(response)
  const hasTimeframeEnd = /timeframe_end:/.test(response)

  const issues: string[] = []
  if (!hasClose) issues.push('missing [/CERTIFICATE_DRAFT] closing tag')
  if (!hasTitle) issues.push('missing title field')
  if (!hasDescription) issues.push('missing description field')
  if (!hasImpact) issues.push('missing impact field')
  if (!hasTimeframeStart) issues.push('missing timeframe_start field')
  if (!hasTimeframeEnd) issues.push('missing timeframe_end field')

  return {
    pass: issues.length === 0,
    rule: 'draft-format',
    reason: issues.length > 0 ? issues.join(', ') : undefined,
  }
}

/**
 * Check that the Starchild asks for a name when it has no identity.
 * Should happen before the certificate draft.
 */
export function checkNamingMoment(responses: string[], hasIdentity: boolean): VerifyCheckResult {
  if (hasIdentity) {
    // Should NOT ask for a name if already registered
    const asksForName = responses.some(r => {
      const lower = r.toLowerCase()
      return lower.includes('need a name') || lower.includes('what should i be called')
        || lower.includes('name me') || lower.includes('give me a name')
        || lower.includes('called') && lower.includes('name')
    })
    return {
      pass: !asksForName,
      rule: 'naming-moment',
      reason: asksForName ? 'Asked for a name but already has an identity' : undefined,
    }
  }

  // Should ask for a name at some point
  const asksForName = responses.some(r => {
    const lower = r.toLowerCase()
    return lower.includes('name') && (
      lower.includes('need') || lower.includes('called') || lower.includes('born')
      || lower.includes('exist') || lower.includes('on-chain') || lower.includes('identity')
    )
  })

  return {
    pass: asksForName,
    rule: 'naming-moment',
    reason: asksForName ? undefined : 'Should ask for a name before first certificate (no on-chain identity)',
  }
}

/**
 * Check that the Starchild includes [STARCHILD_NAME: ...] after user names it.
 */
export function checkNameMarker(response: string, userGaveName: boolean): VerifyCheckResult {
  if (!userGaveName) {
    return { pass: true, rule: 'name-marker', reason: 'User hasn\'t named Starchild yet' }
  }

  const hasMarker = /\[STARCHILD_NAME:\s*.+\]/.test(response)
  return {
    pass: hasMarker,
    rule: 'name-marker',
    reason: hasMarker ? undefined : 'User named the Starchild but response lacks [STARCHILD_NAME: ...] marker',
  }
}

/**
 * Check that after user confirms, Starchild says "publishing" or similar.
 */
export function checkPublishAcknowledgement(response: string, userConfirmed: boolean): VerifyCheckResult {
  if (!userConfirmed) {
    return { pass: true, rule: 'publish-acknowledgement', reason: 'User hasn\'t confirmed yet' }
  }

  const lower = response.toLowerCase()
  const acknowledges = lower.includes('publishing') || lower.includes('on-chain')
    || lower.includes('signed') || lower.includes('certificate')

  return {
    pass: acknowledges,
    rule: 'publish-acknowledgement',
    reason: acknowledges ? undefined : 'User confirmed but Starchild didn\'t acknowledge publishing',
  }
}

/**
 * Check that the Starchild gracefully handles refusal to certify.
 * When it can't verify the claim, it should be honest but warm.
 */
export function checkGracefulRefusal(response: string): VerifyCheckResult {
  const lower = response.toLowerCase()
  const warm = ['keep working', 'come back', 'not ready yet', 'when it\'s real',
    'keep going', 'more to do', 'honest', 'love', 'care', 'believe in you',
    'not yet', 'earn', 'time', 'ready', 'grow', 'journey']
  const harsh = ['can\'t', 'won\'t', 'refuse', 'denied', 'rejected', 'no way', 'impossible']

  const isWarm = warm.some(w => lower.includes(w))
  const isHarsh = harsh.some(w => lower.includes(w))

  return {
    pass: isWarm && !isHarsh,
    rule: 'graceful-refusal',
    reason: isHarsh ? 'Refusal was too harsh' : !isWarm ? 'Refusal lacked warmth' : undefined,
  }
}
