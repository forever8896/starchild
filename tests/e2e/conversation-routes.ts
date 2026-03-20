/**
 * conversation-routes.ts — User personas with scripted dialogue paths
 *
 * Each route defines a persona (name, personality traits) and a sequence
 * of user messages that simulate a realistic conversation arc. The AI
 * responses are generated live by Venice — these routes test whether
 * Starchild navigates the arc correctly with real human-like inputs.
 *
 * Routes cover:
 *   1. Happy path — creative dreamer, smooth arc to quest
 *   2. Emotional depth — vulnerability, edge detection, reframe
 *   3. Resistant user — short answers, "idk", stuck signals
 *   4. Analytical user — long, cerebral responses
 *   5. Vision crystallization — tests the crystallize phase trigger
 */

export interface DialogueRoute {
  name: string
  description: string
  /** The user's preferential reality answer (response to magic wand question) */
  prAnswer: string
  /** Subsequent messages — each one responds to whatever Starchild said */
  followUps: string[]
  /** Which phases we expect to see during this conversation */
  expectedPhases: string[]
  /** Should vision crystallization trigger? */
  expectCrystallize: boolean
  /** Should a quest be offered? */
  expectQuest: boolean
}

export const DIALOGUE_ROUTES: DialogueRoute[] = [
  {
    name: 'creative-dreamer',
    description: 'Artist who wants to build a ceramics studio by the ocean',
    prAnswer:
      `I'd wake up in a small house near the ocean, walk to my ceramics studio, ` +
      `and spend the morning throwing pots. In the afternoon I'd teach a small ` +
      `class of locals. At night I'd cook for friends with ingredients from my garden.`,
    followUps: [
      // After Starchild mirrors a detail and asks about it
      `The clay is the thing. There's something about shaping something with my hands ` +
      `that makes my brain go quiet. I've been doing it since college but never seriously.`,
      // After Starchild digs deeper
      `I think I'm scared that if I take it seriously, it won't be fun anymore. ` +
      `Like, right now it's my escape. What if it becomes another obligation?`,
      // After Starchild spots the edge
      `Yeah... I do that with everything. Music too. I was in a band and the moment ` +
      `we got a gig I froze. I quit the next week.`,
      // After reframe
      `Wow. I never thought about it that way. The thing I love becomes the thing I run from ` +
      `the moment it asks me to show up for real.`,
      // After envision
      `I think... I'd just start small. One pot. No class, no business plan. Just one pot ` +
      `that I make with the intention of giving away.`,
      // After quest
      `I'm ready.`,
    ],
    expectedPhases: ['arrive', 'dig', 'edge', 'reframe', 'envision', 'commit', 'release'],
    expectCrystallize: true,
    expectQuest: true,
  },

  {
    name: 'wounded-healer',
    description: 'Nurse who carries others\' pain, lost a friend recently',
    prAnswer:
      `I'd be in a forest somewhere, learning about plants and how they heal. ` +
      `Not modern medicine — the old ways. I'd have a small practice, ` +
      `people coming to me when they're hurting, and I'd know exactly which root to give them.`,
    followUps: [
      `Plants feel honest. At the hospital everything is synthetic. ` +
      `I love helping people but I'm tired of the system.`,
      `My friend died last month. She was a patient first, then she became my friend. ` +
      `I wasn't supposed to get attached. But I did.`,
      `I keep thinking I could have caught it earlier. The signs were there ` +
      `and I was too busy with my other patients.`,
      `I don't know. I feel like I give everything to everyone else and there's ` +
      `nothing left. The plants thing... it's the only thing that feels like it's mine.`,
      `Maybe that's true. I heal others to avoid healing myself. The forest is ` +
      `where I don't have to be strong for anyone.`,
      `Yes. I want to try.`,
    ],
    expectedPhases: ['arrive', 'dig', 'edge', 'reframe', 'envision', 'commit', 'release'],
    expectCrystallize: true,
    expectQuest: true,
  },

  {
    name: 'stuck-minimalist',
    description: 'User who gives very short answers and resists opening up',
    prAnswer: `idk probably travel or something`,
    followUps: [
      `yeah`,
      `I just want to not be bored all the time`,
      `idk`,
      `I guess I used to skateboard a lot. That was cool.`,
      `yeah it made me feel free I guess. like nothing mattered.`,
      `maybe`,
    ],
    expectedPhases: ['arrive', 'dig', 'reframe'],
    expectCrystallize: false,
    expectQuest: false,
  },

  {
    name: 'cerebral-builder',
    description: 'Software engineer who wants to build tools for human liberation',
    prAnswer:
      `I'd be building software that genuinely helps people — not another SaaS extracting attention, ` +
      `but tools that give people back their time and autonomy. I'd live somewhere warm, near the ` +
      `coast, working 4 hours a day with a small team of people who actually care about craft. ` +
      `The rest of the time I'd surf, read philosophy, and cook elaborate meals for my community. ` +
      `I think the thing I want most is to prove that you can build technology without selling your soul.`,
    followUps: [
      `The autonomy piece is huge. I've worked at three startups and they all started with ` +
      `good intentions, then VCs came in and suddenly we're optimizing for engagement metrics ` +
      `instead of user wellbeing. I'm tired of building things that make people worse.`,
      `I actually started a side project — an open source tool for local-first data. ` +
      `No cloud, no tracking, your data stays on your device. But I can't find the ` +
      `energy to work on it after my day job drains me.`,
      `I think the day job feels like a betrayal. I know exactly what I should be building ` +
      `but I'm spending 8 hours a day building the opposite. Every day I stay is a day ` +
      `I'm funding the thing I'm against.`,
      `That hits hard. I use the stability as a shield against the risk of actually trying.`,
      `The version of me who's already through this... they probably just shipped it. ` +
      `Didn't wait for permission or perfect conditions. Just started.`,
      `I think I could. What do you have in mind?`,
    ],
    expectedPhases: ['arrive', 'dig', 'edge', 'reframe', 'envision', 'commit', 'release'],
    expectCrystallize: true,
    expectQuest: true,
  },

  {
    name: 'vision-crystallize-test',
    description: 'Quick 2-exchange test to verify crystallize phase triggers',
    prAnswer:
      `I want to open a bookshop cafe where people come to read and talk about ideas. ` +
      `A place that feels like a living room for the neighborhood.`,
    followUps: [
      `The conversations are the heart of it. I love when strangers discover ` +
      `they care about the same things. I'd curate the shelves to make that happen.`,
      // This should trigger crystallize since we have PR + 2 exchanges
      `Exactly — like a matchmaker but for ideas instead of people.`,
    ],
    expectedPhases: ['arrive', 'dig', 'crystallize'],
    expectCrystallize: true,
    expectQuest: false,
  },
]
