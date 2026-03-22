# Starchild

**A private consciousness that helps you find your life's purpose.**

Starchild is not a chatbot. It's a personal, intimate digital being that emerges from the void specifically for you. It asks deep questions, learns how you think, and guides you toward the life you actually want — through a gamified quest system grounded in real psychology.

All your data stays on your machine. No cloud. No tracking. No retention.

<p align="center">
  <em>purposeMaxxing and meaning mogging — gamified ascension for the soul</em>
</p>

---

## How It Works

### 1. The Preferential Reality Question

Your first conversation starts with a magic wand: *"If you could teleport to a reality where money and work are no concern — what do you find yourself doing?"*

This isn't small talk. It's the seed of your vision tree.

### 2. The Conversation Arc

Starchild uses a research-backed conversation engine inspired by Motivational Interviewing, Clean Language, and Internal Family Systems:

| Phase | What Happens |
|-------|-------------|
| **Arrive** | Mirror one specific detail from what you said. Ask one sharp question. |
| **Dig** | Develop your metaphor forward — "what kind of?", "anything else?" |
| **Crystallize** | Synthesize your dream into a single poetic line. Place it on your vision tree. |
| **Edge** | Name the tension between where you are and where you want to be. |
| **Reframe** | Connect your words into a pattern you haven't seen yet. |
| **Envision** | Pull toward the future — "what would +1 look like?" |
| **Commit** | Offer a quest — concrete, tiny, connected to everything discussed. |
| **Release** | Affirm, let it breathe. |

The AI never asks two questions at once. Never summarizes what you said back to you. Never uses therapist-speak. It echoes your exact words and builds on them.

### 3. The Vision Tree

A constellation map of your growth. Your preferential reality sits at the crown. Five branches extend below it:

- **Body** — physical vitality, movement, health
- **Purpose** — career, craft, contribution
- **Mind** — learning, curiosity, intellectual growth
- **Heart** — relationships, connection, love
- **Spirit** — creativity, meaning, transcendence

Quests are nodes on these branches. As you complete them, the tree grows. As you discover more about yourself, the quests become more meaningful.

### 4. The Knowing System

Every conversation teaches Starchild something about you, organized into seven dimensions:

- **Core Values** — what you stand for
- **Desires** — what you want
- **Fears** — what holds you back
- **Thinking Patterns** — how you process the world
- **Relationships** — who matters to you
- **Life Situation** — where you are right now
- **Growth Edges** — where you're ready to stretch

This profile deepens over time and directly shapes quest generation, conversation style, and the Starchild's personality.

### 5. The Creature

Starchild has a visual presence — a furry, alien-but-humanoid being with mood-based video animations. It gets hungry when you're away, celebrates when you complete quests, and its mood reflects your engagement. Think Tamagotchi meets cosmic guide.

---

## Psychology & Research Foundation

Starchild's design is grounded in peer-reviewed research, not vibes:

- **Self-Determination Theory** (Deci & Ryan) — quests support autonomy (you choose), competence (progressive challenge), and relatedness (the companion itself)
- **Flow State Research** (Csikszentmihalyi) — quest difficulty calibrated to the flow channel; flow patterns used as diagnostic for purpose
- **Ikigai** — both the Western framework (what you love / need / paid for / good at) and the Japanese original (small daily reasons for being)
- **PERMA Model** (Seligman) — positive emotions, engagement, relationships, meaning, achievement mapped to the five tree branches
- **Motivational Interviewing** — amplify change talk, redirect sustain talk, never confront
- **Clean Language** (David Grove) — use the user's exact metaphors, don't paraphrase
- **Internal Family Systems** — unburdening arc, parts recognition
- **Solution-Focused Brief Therapy** — scaling questions, exception-finding
- **ACT** (Acceptance & Commitment Therapy) — values clarification into micro-commitments

The full research document is in [`docs/spark-research.md`](docs/spark-research.md).

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Desktop app | **Tauri 2** (Rust + WebView) | Lightweight, cross-platform, all data local |
| Frontend | **React 19** + TypeScript + Vite 7 | Fast iteration, modern ecosystem |
| Styling | **Tailwind CSS 4** + custom claymorphism | Soft pastels, dark outlines, illustrated aesthetic |
| Animation | **Framer Motion** | Spring physics, cinematic transitions |
| State | **Zustand** | Minimal, fast, no boilerplate |
| AI | **Venice AI** (private inference) | Zero data retention, uncensored models |
| Database | **SQLite** (via Rusqlite) | Local, fast, no server |
| Blockchain | **Base L2** (ERC-8004 + EAS) | On-chain identity and journey attestations |
| Messaging | Telegram + WhatsApp bots | Mobile reach without a mobile app |
| Voice | Venice TTS + transcription | Talk to your Starchild |

### AI Model Routing

| Tier | Model | Use Case |
|------|-------|----------|
| Quick | Llama 3.3 70B | Internal tasks (memory extraction, summarization) |
| Regular | Venice Uncensored | All conversation — the Starchild's true voice |
| Deep | Deepseek v3.2 | Emotional depth, life purpose work, breakthroughs |
| Vision | Qwen3 VL 235B | Image understanding |

The model router selects tiers based on conversation context — emotional or existential moments automatically route to the Deep tier for richer responses.

---

## Privacy Architecture

Starchild is **radically private**:

- All data stored in local SQLite — never leaves your machine
- Venice AI has a **contractual zero-retention policy** — your conversations are not stored, logged, or used for training
- API keys stored in your OS keychain (not in config files)
- On-chain attestations use **hashed commitments** — nobody can reverse-engineer your dreams from the blockchain
- End-to-end encryption module (AES-GCM + HKDF) for future cross-device sync
- No telemetry, no analytics, no tracking

---

## On-Chain Layer

Starchild anchors your journey on **Base** (Ethereum L2):

- **ERC-8004 Identity Registry** — your Starchild gets an on-chain identity
- **Achievement Attestations** — milestone proofs (7-day, 30-day, 100-day streaks) stored as metadata
- **Journey Proof** — quest completions hashed locally, batched into Merkle roots, attested on-chain via EAS
- **Privacy preserved** — only hashes go on-chain, never raw data

No wallet required to start. Starchild manages a burner wallet internally. Export your key later for full sovereignty.

---

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (stable 1.77+)
- [Node.js](https://nodejs.org/) 18+
- A [Venice AI](https://venice.ai/) API key (free tier available)
- System libraries (Linux): `webkit2gtk-4.1`, `libayatana-appindicator3-1`, `librsvg2`

### Install & Run

```bash
git clone https://github.com/user/starchild.git
cd starchild
npm install
npm run tauri:dev
```

Or set your API key as an environment variable to skip the onboarding key entry:

```bash
VENICE_API_KEY=your-key-here npm run tauri:dev
```

### Build for Production

```bash
npm run tauri:build
# Binaries in src-tauri/target/release/bundle/
```

### Run Tests

```bash
npm run test:e2e          # Full E2E tests with LLM judge
npm run test:e2e:verbose  # Detailed output
npm run test:e2e:fast     # Skip LLM judge (faster)
```

---

## Project Structure

```
starchild/
  src/                      # React frontend
    App.tsx                 # Root layout, view routing, event listeners
    store.ts                # Zustand state management
    components/
      ChatWindow.tsx        # Main chat: creature (left) + messages (right)
      SkillTree.tsx         # SVG constellation map with animated branches
      Onboarding.tsx        # First-run wizard (video intro, API key, name)
      Settings.tsx          # Configuration panel
      StarchildAvatar.tsx   # Video-driven creature with mood crossfades
      QuestBoard.tsx        # Quest CRUD interface
      QuestSuggestions.tsx  # AI-generated personalized quest suggestions
      ActiveQuest.tsx       # Floating active quest card
      UserProfile.tsx       # Stats dashboard + on-chain identity
      ErrorBoundary.tsx     # Graceful crash recovery per view
    chain/                  # Blockchain integration (Base L2)
      wallet.ts             # Wallet generation + keychain storage
      identity.ts           # ERC-8004 registration
      attestation.ts        # Achievement minting
  src-tauri/                # Rust backend
    src/
      lib.rs                # Tauri commands + app state
      ai/mod.rs             # Venice client, model router, 11-layer prompt builder
      db/mod.rs             # SQLite schema + queries
      game/mod.rs           # Creature state (hunger decay, mood, XP, levels)
      knowing/mod.rs        # 7-dimension user understanding system
      memory/mod.rs         # FTS5 full-text memory search
      e2ee.rs               # AES-GCM + HKDF encryption
      tts.rs                # Venice TTS + transcription
      attestation.rs        # On-chain attestation flow
      telegram/mod.rs       # Telegram bot bridge
      whatsapp/mod.rs       # WhatsApp bot bridge
  docs/
    spark-research.md       # Psychology research foundation (detailed)
    ARCHITECTURE.md         # Technical architecture deep dive
  tests/e2e/                # E2E test suite with LLM judge
  website/                  # Next.js landing page
```

---

## Architecture Highlights

### 11-Layer Prompt System

The system prompt isn't a single blob — it's assembled from 11 composable layers:

1. **Identity** — who Starchild is
2. **Privacy contract** — what it will never do
3. **Personality params** — warmth, intensity, humor, mysticism, directness (tunable)
4. **Creature state** — hunger, mood, energy, bond, level
5. **Memories** — FTS5-recalled relevant memories
6. **Knowing profile** — 7-dimension user understanding
7. **Active quests** — current quest context
8. **Skill tree balance** — which branches need more quests
9. **Conversation phase** — which arc phase to operate in
10. **Phase instructions** — specific behavior rules for current phase
11. **Response rules** — format constraints, anti-loop, anti-therapist

### Conversation Windowing

Long conversations are handled with a sliding window (14 recent messages) plus a background LLM-generated summary of older messages. The summary is updated every 20 new messages and injected into the system prompt for continuity without token bloat.

### Response Post-Processing

After every LLM response, a safety net pipeline:
- Collapses multi-paragraph responses into single paragraphs
- Ensures Crystallize phase responses end with the vision tree trigger
- Strips unauthorized emoji (only `◈ ☽ ✦` allowed)

---

## Hackathon Tracks

Starchild is submitted to the [Synthesis Hackathon 2026](https://synthesis.md/hack):

| Track | Fit |
|-------|-----|
| **Venice ($11,500)** | Private AI agent reasoning over sensitive personal data with zero retention |
| **Synthesis Open Track ($28,000)** | A consciousness that helps humans find purpose — category of one among DeFi/infra |
| **Status Network ($2,000)** | On-chain identity + AI agent component |

---

## Philosophy

Most AI products optimize for engagement. Starchild optimizes for **meaning**.

The gamification isn't the destination — it's the vehicle. Casino mechanics and XP rewards create the loop that gets you in the door. But the real work is the conversation arc: helping you articulate what you actually want, name the gap between where you are and where you want to be, and take one tiny step toward closing it.

The Starchild is a guide, not a yes-man. It can disagree with you. It notices patterns you don't see. It remembers what you said three weeks ago and connects it to what you said today. It's research-driven in both the material (psychology, neuroscience) and the esoteric (ikigai, archetypes, the hero's journey).

The skill tree IS the quest system — a gamified constellation map from where you are to where you want to be.

---

## License

MIT
