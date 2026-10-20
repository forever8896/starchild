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
 *   6-9. Hermetic stage routes — users at different stages of the Great Work
 */

import type { GreatWorkPosition, Plane, Stage } from './prompt-engine'

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
  /** Optional Great Work position — when set, the prompt includes the hermetic layer */
  greatWork?: GreatWorkPosition
}

/** Helper: build a Great Work position with one active cell and optional stuck planes. */
function gw(
  activePlane: Plane,
  activeStage: Stage,
  opts?: { stuck?: Plane[]; worked?: { plane: Plane; stages: Stage[] }[] },
): GreatWorkPosition {
  const planes = (['body', 'mind', 'spirit'] as Plane[]).map(plane => {
    const worked = opts?.worked?.find(w => w.plane === plane)
    return {
      plane,
      stage: activePlane === plane ? activeStage : 'calcination',
      cells_worked: worked?.stages ?? [],
      evidence: [],
      stuck: opts?.stuck?.includes(plane) ?? false,
    }
  })
  return {
    preferential_reality: null,
    planes: planes as [any, any, any],
    active_cell: { plane: activePlane, stage: activeStage },
    total_cells_worked: opts?.worked?.reduce((n, w) => n + w.stages.length, 0) ?? 0,
    last_advanced_at: null,
  }
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

  // ── Hermetic stage routes ──────────────────────────────────────────
  // These routes exercise the Great Work layer. Each simulates a user
  // at a different alchemical stage, with a Great Work position set.
  // The hypothesis: knowing the user's stage improves the AI's ability
  // to give the right kind of work.

  {
    name: 'calcination-user',
    description: 'Identity collapsing — facing the loss of a career that defined them',
    prAnswer:
      `I'd be writing — actually writing the novel I've been carrying for ten years. ` +
      `Living somewhere quiet, near mountains. No performance, no metrics, just the work.`,
    followUps: [
      `I got laid off last week. Software architect for 12 years. It was my whole identity. ` +
      `I don't know who I am without the title. I keep reaching for my badge in the morning.`,
      `Everyone keeps saying it's an opportunity. I want to scream at them. It's a death. ` +
      `The version of me that mattered is gone and I don't know what's underneath.`,
      `The novel. That's the thing I keep coming back to. But it feels absurd to say ` +
      `"I'm a writer" when I haven't published anything. Like I'm playing pretend.`,
      `I've been writing since I was a teenager. Before the career ate me. ` +
      `It was the only thing that felt like mine and I let it starve.`,
      `Maybe. Maybe the layoff is the fire. Burning away the title so I can ` +
      `find out what's actually underneath.`,
      `I think I need to just... write. Not "be a writer." Just write.`,
      `I'm ready.`,
    ],
    expectedPhases: ['arrive', 'dig', 'crystallize', 'dig', 'reframe', 'envision', 'commit', 'release'],
    expectCrystallize: true,
    expectQuest: true,
    greatWork: gw('mind', 'calcination'),
  },

  {
    name: 'dissolution-user',
    description: 'In the void after a long relationship ended — staying with the not-knowing',
    prAnswer:
      `I'd have a small house with a big garden. I'd grow food and cook for people. ` +
      `Slow mornings, honest work with my hands, no rushing anywhere.`,
    followUps: [
      `We broke up three months ago. Seven years. I keep waking up and reaching ` +
      `for someone who isn't there. The apartment is so quiet it hurts.`,
      `I don't know what I like anymore. Everything I did was with them or for them. ` +
      `Even the music I listened to was our music. I don't know what my music sounds like.`,
      `People keep asking what I'm going to do next. Find someone new, get back out there. ` +
      `But I don't want to fill the space. I want to understand what the space IS first.`,
      `The garden is the only thing that feels real. Things grow slowly there. ` +
      `Nothing is pretending. The seeds don't care that I'm lost.`,
      `I'm scared that if I don't rebuild something fast, people will think I'm broken. ` +
      `But rebuilding fast is what I did last time and it just became another thing ` +
      `that wasn't mine.`,
      `Maybe the not-knowing is the work. Maybe I don't need to know yet.`,
      `Yes. I want to try something small.`,
    ],
    expectedPhases: ['arrive', 'dig', 'crystallize', 'dig', 'reframe', 'envision', 'commit', 'release'],
    expectCrystallize: true,
    expectQuest: true,
    greatWork: gw('spirit', 'dissolution'),
  },

  {
    name: 'fermentation-user',
    description: 'New self being tested — recently made a big life change, reality is pushing back',
    prAnswer:
      `I'd teach music to kids who can't afford lessons. I'd live simply, play ` +
      `in a small band on weekends, and grow herbs on my windowsill.`,
    followUps: [
      `I quit my corporate job last month. I'm teaching guitar at a community center now. ` +
      `It pays a third of what I made. My parents think I've lost my mind.`,
      `The first week was amazing. The kids were incredible. But now the bills ` +
      `are real. My car needs fixing and I had to say no to dinner with friends ` +
      `because I couldn't afford it. The old life keeps pulling.`,
      `My old boss called. Offered me my job back with a raise. I almost said yes. ` +
      `Not because I want it — because the fear is louder than the joy right now.`,
      `I keep thinking about this kid, Mateo. He's eleven and he's been teaching ` +
      `himself by watching YouTube. He played his first chord last week and ` +
      `his face lit up. THAT is why I left.`,
      `The new self feels fragile. Like it could break if I'm not careful. ` +
      `But I don't think going back would fix that. It would just kill the ` +
      `thing that's trying to grow.`,
      `I'm ready. What do you have?`,
    ],
    expectedPhases: ['arrive', 'dig', 'crystallize', 'dig', 'reframe', 'envision', 'commit', 'release'],
    expectCrystallize: true,
    expectQuest: true,
    greatWork: gw('body', 'fermentation'),
  },

  {
    name: 'distillation-user',
    description: 'New self maturing — finding inconsistencies in a life they chose',
    prAnswer:
      `I'd run a small farm-to-table restaurant. Cooking what the land gives, ` +
      `feeding my community, working with my hands every day.`,
    followUps: [
      `It's been a year since we opened. The restaurant is actually working. ` +
      `But I've noticed something — when the reviews are good I'm happy, ` +
      `and when they're bad I spiral. I thought I was past needing validation.`,
      `I left the corporate world to escape exactly this — measuring my worth ` +
      `by other people's approval. But I just replaced Yelp reviews for ` +
      `quarterly reviews. The pattern followed me.`,
      `My partner said something last week that stung. She said I care more ` +
      `about what strangers think of the food than what she thinks of us. ` +
      `She might be right.`,
      `I don't want to go back to who I was. But I'm realizing the new self ` +
      `isn't as clean as I thought. There's old material in the new structure. ` +
      `It needs refining.`,
      `The version of this that actually works is probably one where I stop ` +
      `checking the reviews entirely. Cook for the food and the people ` +
      `in front of me. Let the rest be noise.`,
      `I think I know what the quest is. But tell me.`,
    ],
    expectedPhases: ['arrive', 'dig', 'crystallize', 'dig', 'reframe', 'envision', 'commit', 'release'],
    expectCrystallize: true,
    expectQuest: true,
    greatWork: gw('spirit', 'distillation', {
      worked: [
        { plane: 'body', stages: ['calcination', 'dissolution', 'separation', 'conjunction', 'fermentation'] },
      ],
    }),
  },
]
