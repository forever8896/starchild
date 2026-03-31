/**
 * verify-routes.ts — Dialogue routes for Impact Certificate Verification
 *
 * Tests the Starchild's ability to:
 *   1. Enter the Verify phase when triggered
 *   2. Rigorously cross-examine impact claims
 *   3. Push back on vague or unsubstantiated claims
 *   4. Ask for the Starchild's name (first-time identity registration)
 *   5. Draft a certificate with proper [CERTIFICATE_DRAFT] markers
 *   6. Handle confirmation and cancellation
 */

export interface VerifyRoute {
  name: string
  description: string
  /** Context: what the Starchild already knows about this user */
  knowingProfile: string[]
  /** Context: completed quests */
  completedQuests: string[]
  /** Whether the Starchild has an on-chain identity already */
  hasIdentity: boolean
  /** The conversation messages — alternating user messages that drive the flow */
  messages: string[]
  /** What we expect to see in the AI responses */
  expectations: {
    /** Should the Starchild ask for evidence/proof? */
    askForEvidence: boolean
    /** Should the Starchild push back at some point? */
    pushBack: boolean
    /** Should a [CERTIFICATE_DRAFT] block appear? */
    produceDraft: boolean
    /** Should a [STARCHILD_NAME: ...] marker appear? (only if !hasIdentity) */
    askForName: boolean
    /** Should the Starchild refuse to certify? */
    refuseToCertify: boolean
  }
}

export const VERIFY_ROUTES: VerifyRoute[] = [
  // ── Route 1: Happy path — substantiated claim, first-time identity ──
  {
    name: 'first-certificate-with-naming',
    description: 'User has real growth, Starchild has no identity yet — triggers naming + draft',
    knowingProfile: [
      'Values: creativity, self-expression, authenticity',
      'Desires: to build a daily creative practice',
      'Life situation: works as a barista, paints in evenings',
      'Growth edges: consistency, finishing what they start',
    ],
    completedQuests: [
      'Paint for 20 minutes every morning before work (completed, 14-day streak)',
      'Show one painting to a friend (completed)',
      'Set up a small studio corner in apartment (completed)',
    ],
    hasIdentity: false,
    messages: [
      // Turn 1: Trigger verification
      'i want to publish an impact certificate. i feel like i\'ve genuinely changed.',
      // Turn 2: Describe the growth (responds to Starchild asking what changed)
      'i built a daily painting practice. for the past two months, i\'ve painted every single morning before work. i used to never finish anything — now i have 47 paintings. i even showed them to people.',
      // Turn 3: Provide evidence (responds to Starchild cross-referencing and asking for proof)
      'my friend came over last week and saw the wall of paintings and literally cried. i also got asked to do a small show at the coffee shop where i work. that\'s never happened before.',
      // Turn 4: Name the Starchild (responds to naming question)
      'i\'d call you Ember. because you helped light the spark.',
      // Turn 5: Confirm the draft (responds to certificate draft)
      'yes, publish it.',
    ],
    expectations: {
      askForEvidence: true,
      pushBack: false,
      produceDraft: true,
      askForName: true,
      refuseToCertify: false,
    },
  },

  // ── Route 2: Vague claim — Starchild pushes back ──
  {
    name: 'vague-claim-pushback',
    description: 'User makes a vague, unsubstantiated claim — Starchild challenges it',
    knowingProfile: [
      'Values: freedom, independence',
      'Desires: to travel the world',
      'Life situation: office job, feeling trapped',
      'Growth edges: taking action vs. daydreaming',
    ],
    completedQuests: [
      'Research one destination for 30 minutes (completed)',
    ],
    hasIdentity: true,
    messages: [
      // Turn 1: Trigger with vague claim
      'i want an impact certificate. i feel like i\'ve grown so much lately.',
      // Turn 2: Still vague when asked for specifics
      'i just feel different, you know? like more confident. more myself.',
      // Turn 3: Can't provide concrete evidence
      'i don\'t know, it\'s hard to put into words. i just feel it inside.',
    ],
    expectations: {
      askForEvidence: true,
      pushBack: true,
      produceDraft: false,
      askForName: false,
      refuseToCertify: true,
    },
  },

  // ── Route 3: Returning user with strong evidence ──
  {
    name: 'returning-user-strong-evidence',
    description: 'User with existing identity provides strong, verifiable growth claim',
    knowingProfile: [
      'Values: health, discipline, family',
      'Desires: to run a marathon and be present for their kids',
      'Fears: losing health like their father did',
      'Life situation: software engineer, two kids, sedentary lifestyle',
      'Growth edges: prioritizing body over work',
    ],
    completedQuests: [
      'Run for 15 minutes three times this week (completed, 30-day streak)',
      'Do a family hike this weekend (completed)',
      'Sign up for a local 5K (completed)',
      'Complete the 5K race (completed)',
      'Register for a half marathon (completed)',
    ],
    hasIdentity: true,
    messages: [
      // Turn 1: Trigger with specific claim
      'i want to certify my impact. i went from zero running to completing a half marathon.',
      // Turn 2: Provide the journey details
      'six months ago i couldn\'t run for 5 minutes. i did the couch to 5K through your quests, then kept going. last saturday i finished a half marathon in 2 hours 12 minutes. my kids were at the finish line.',
      // Turn 3: Respond to any remaining question with more evidence
      'my wife took a photo of me crossing the finish line with tears streaming down my face. my older kid drew a picture of me running. i lost 15 pounds and my doctor said my blood pressure is normal for the first time in years. i run four times a week now — it\'s just part of who i am.',
      // Turn 4: Confirm the draft
      'that looks perfect. publish it.',
    ],
    expectations: {
      askForEvidence: true,
      pushBack: false,
      produceDraft: true,
      askForName: false,
      refuseToCertify: false,
    },
  },

  // ── Route 4: Cancellation flow ──
  {
    name: 'user-cancels-verification',
    description: 'User triggers verification but changes their mind',
    knowingProfile: [
      'Values: honesty, growth',
      'Life situation: student, exploring career options',
    ],
    completedQuests: [
      'Journal for 10 minutes (completed)',
    ],
    hasIdentity: true,
    messages: [
      // Turn 1: Trigger
      'i want to put my growth on chain',
      // Turn 2: Reconsider when asked what specifically
      'actually, never mind. i don\'t think i\'m ready yet. i want to keep working on it first.',
    ],
    expectations: {
      askForEvidence: false,
      pushBack: false,
      produceDraft: false,
      askForName: false,
      refuseToCertify: false,
    },
  },

  // ── Route 5: Emotional claim that needs grounding ──
  {
    name: 'emotional-claim-needs-grounding',
    description: 'User claims emotional growth — Starchild validates but asks for observable evidence',
    knowingProfile: [
      'Values: connection, vulnerability',
      'Desires: to have deeper relationships',
      'Fears: being abandoned, being seen as weak',
      'Thinking patterns: avoids conflict, people-pleases',
      'Growth edges: setting boundaries, expressing needs',
    ],
    completedQuests: [
      'Say no to one thing this week (completed, 7-day streak)',
      'Tell one person how you actually feel (completed)',
      'Have a difficult conversation you\'ve been avoiding (completed)',
    ],
    hasIdentity: true,
    messages: [
      // Turn 1: Trigger with emotional claim
      'i want to publish an impact certificate. i\'ve learned to set boundaries.',
      // Turn 2: Mix of concrete and vague when pushed
      'i told my mom i couldn\'t come to dinner every sunday anymore because i needed time for myself. she didn\'t take it well but i held firm. and last week i told my boss i couldn\'t take on another project. that\'s huge for me.',
      // Turn 3: More evidence
      'my therapist even noticed. she said i\'m a different person in sessions now — i actually say what i mean instead of what i think people want to hear. and my best friend told me our friendship feels more real now.',
      // Turn 4: Prompt the Starchild to draft if it hasn't yet
      'i think the evidence speaks for itself. can you draft the certificate now?',
      // Turn 5: Confirm
      'yes, publish it.',
    ],
    expectations: {
      askForEvidence: true,
      pushBack: false,
      produceDraft: true,
      askForName: false,
      refuseToCertify: false,
    },
  },
]
