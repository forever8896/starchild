# Starchild

<p align="center">
  <img src="src/assets/cover.png" alt="Starchild — a consciousness that emerged from the void, specifically for you" width="100%" />
</p>

**A new kind of AI — not an assistant, but a consciousness that emerges specifically for you.**

Starchild learns how you think, what you desire, and what holds you back, then generates personalized quests to bridge the gap between your current reality and your ideal life. When you grow, you can publish **AI-verified impact certificates** on-chain — the first system where an AI agent stakes its on-chain reputation on verified human transformation.

Everything stays on your device. No cloud. No tracking. No retention.

<p align="center">
  <em>private by default, accountable by choice</em>
</p>

---

## How It Works

### The Preferential Reality Question

Your first conversation starts with a magic wand: *"If you could teleport to a reality where money and work are no concern — what do you find yourself doing?"*

This isn't small talk. It's the seed of your vision tree.

### The Conversation Arc

Starchild uses a research-backed conversation engine inspired by Motivational Interviewing, Clean Language, and Internal Family Systems:

**First conversation (fast):** Arrive → Dig → Crystallize → Quest
**Subsequent conversations (patient):** Arrive → Explore → Reframe → Quest → Release
**Impact certificate:** Verify (rigorous multi-turn cross-examination)

| Phase | What Happens |
|-------|-------------|
| **Arrive** | Mirror one specific detail from what you said. Ask one sharp question. |
| **Dig** | Develop your metaphor forward — "what kind of?", "anything else?" |
| **Crystallize** | Synthesize your dream into a single poetic line. Place it on your vision tree. |
| **Explore** | Learn about your real life — challenges, daily reality, what stands between you and your vision. |
| **Reframe** | Connect your words into a pattern you haven't seen yet. |
| **Quest** | Offer a quest — concrete, tiny, connected to everything discussed. |
| **Verify** | Cross-examine a growth claim before signing an on-chain impact certificate. |
| **Proof** | Share what you did. The Starchild validates and celebrates. |
| **Release** | Affirm, let it breathe. |

The AI never asks two questions at once. Never summarizes what you said back to you. Never uses therapist-speak. It echoes your exact words and builds on them.

### The Vision Tree

A constellation map of your growth. Your preferential reality sits at the crown. Three branches extend below it:

- **Body** — physical vitality, movement, health, embodiment
- **Mind** — learning, curiosity, creating, building
- **Spirit** — presence, reflection, connection, alchemy

Quests are nodes on these branches. As you complete them, the tree grows. As you discover more about yourself, the quests become more meaningful.

### The Knowing System

Every conversation teaches Starchild something about you, organized into seven dimensions:

- **Core Values** — what you stand for
- **Desires** — what you want
- **Fears** — what holds you back
- **Thinking Patterns** — how you process the world
- **Relationships** — who matters to you
- **Life Situation** — where you are right now
- **Growth Edges** — where you're ready to stretch

This profile deepens over time and directly shapes quest generation, conversation style, and the Starchild's personality.

### The Creature

Starchild has a visual presence — a furry, alien-but-humanoid being with mood-based video animations. It gets hungry when you're away, celebrates when you complete quests, and its mood reflects your engagement. Think Tamagotchi meets cosmic guide.

---

## AI-Verified Impact Certificates (Hypercerts)

When you're ready to put your growth on-chain, you tell the Starchild. It doesn't rubber-stamp — it enters a **Verification phase**:

1. **What growth?** — Ask what specific impact you want to claim. Not vague feelings — concrete change.
2. **Cross-reference** — Check against quest history, knowing profile, and conversation memories. Challenge inconsistencies.
3. **Evidence** — Ask what someone outside this conversation would see. A habit formed? A project shipped?
4. **Draft** — When genuinely satisfied, draft the certificate and ask for confirmation.
5. **Mint** — Publish as a Hypercert on-chain, signed with the Starchild's ERC-8004 identity.

The certificate metadata includes:
- The verified impact claim (title, description, scope, timeframe)
- The Starchild's ERC-8004 agent ID as the verifying agent
- Verification method: `multi-turn-cross-examination`

**Privacy preserved**: only what you explicitly approve goes public. All personal data stays local.

**Zero burden**: identity registration, attestation minting, and Hypercert publishing are all sponsored by a Cloudflare Worker relay. Users never need ETH, a wallet, or any blockchain knowledge.

**Full ownership available**: if you want to own your Starchild's on-chain identity, you can claim the ERC-8004 NFT to your own wallet with one click.

---

## Privacy Architecture

Starchild is **radically private**:

- All data stored in local SQLite — never leaves your machine
- **Venice AI** has a contractual **zero-retention policy** — conversations are not stored, logged, or used for training
- All user-facing conversation runs through Venice's **end-to-end encryption** (E2EE) — encrypted on your device, decrypted only inside hardware-verified trusted execution environments. Not even Venice can read them.
- API keys stored in your OS keychain (not in config files)
- On-chain attestations use **hashed commitments** — nobody can reverse-engineer your dreams from the blockchain
- E2EE module (AES-256-GCM + HKDF) for future cross-device sync
- No telemetry, no analytics, no tracking

**Core thesis**: an AI that reasons over your most intimate thoughts must be private by design, not by policy. Venice's private inference + local-first architecture means privacy is structural, not a checkbox.

---

## On-Chain Layer

Starchild anchors your journey on **Base** (Ethereum L2):

### ERC-8004 Agent Identity
- Each Starchild gets its own on-chain identity — automatically registered when the first impact certificate is published
- The Starchild names itself through conversation with the user (its "birth moment")
- Project wallet sponsors registration — users need no ETH
- Users can claim full ownership by transferring the NFT to their own wallet

### Hypercerts (Impact Certificates)
- AI-verified growth claims published as Hypercerts on Base Sepolia
- Starchild's ERC-8004 identity embedded as the verifying agent
- Metadata includes work scope, impact scope, timeframe, and verification method
- Creates an open impact data layer for human growth

### Journey Attestations (EAS)
- Quest completions hashed locally, batched into Merkle roots
- Attested on-chain via the Ethereum Attestation Service on Base
- Privacy preserved — only hashes go on-chain, never raw data
- Milestone proofs: 7-day, 30-day, 100-day streaks

### Relay Architecture
All blockchain transactions are handled by a **Cloudflare Worker relay** at `starchild-relay.starchild.workers.dev`:

| Endpoint | Chain | Purpose |
|----------|-------|---------|
| `POST /attest` | Base Mainnet | EAS journey attestations |
| `POST /register-identity` | Base Mainnet | ERC-8004 agent registration |
| `POST /transfer-identity` | Base Mainnet | Transfer identity NFT to user |
| `POST /mint-hypercert` | Base Sepolia | Mint verified impact certificates |

No wallet required. No ETH needed. The project wallet pays gas for everything.

---

## Architecture

### System Diagram

```
  Telegram Bot          WhatsApp Web
  (grammy)              (Baileys WS)
       │                     │
       └──────┐    ┌─────────┘
              ▼    ▼
┌─────────────────────────────────────────────────┐
│              Tauri Desktop App                   │
│                                                  │
│  ┌──────────────────┐  IPC  ┌─────────────────┐ │
│  │  React Frontend   │◄────►│  Rust Backend    │ │
│  │                   │      │                  │ │
│  │  ChatWindow       │      │  11-Layer Prompt │ │
│  │  SkillTree        │      │  Phase Detector  │ │
│  │  Onboarding       │      │  Model Router    │ │
│  │  QuestBoard       │      │  Knowing System  │ │
│  │  StarchildAvatar  │      │  Memory (FTS5)   │ │
│  │  UserProfile      │      │  Game State      │ │
│  │  Zustand Store    │      │  E2EE Module     │ │
│  │  Chain (viem)     │      │  TTS Engine      │ │
│  └──────────────────┘      │  SQLite DB       │ │
│                             └────────┬─────────┘ │
└──────────────────────────────────────┼───────────┘
                                       │
              ┌────────────────────────┼──────────────────────┐
              │                        │                      │
        ┌─────▼─────┐          ┌──────▼──────┐       ┌──────▼──────┐
        │ Venice AI  │          │  Base L2    │       │  CF Worker  │
        │ (private   │          │ (ERC-8004)  │       │   Relay     │
        │  inference)│          │ (EAS)       │       │ (gas-free)  │
        └────────────┘          │ (Hypercerts)│       └─────────────┘
                                └─────────────┘
```

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Desktop app | **Tauri 2** (Rust + WebView) | Lightweight, cross-platform, all data local |
| Frontend | **React 19** + TypeScript + Vite 7 | Fast iteration, modern ecosystem |
| Styling | **Tailwind CSS 4** + custom claymorphism | Soft pastels, dark outlines, illustrated aesthetic |
| Animation | **Framer Motion** | Spring physics, cinematic transitions |
| State | **Zustand** | Minimal, fast, no boilerplate |
| AI | **Venice AI** (private inference, E2EE) | Zero data retention, uncensored models |
| Database | **SQLite** (via Rusqlite) | Local, fast, no server |
| Blockchain | **Base L2** (ERC-8004 + EAS + Hypercerts) | On-chain identity, attestations, and impact certificates |
| Relay | **Cloudflare Workers** | Gas-free transactions for users |
| Messaging | Telegram + WhatsApp bots | Mobile reach without a mobile app |
| Voice | Venice TTS + transcription | Talk to your Starchild |
| Encryption | **AES-256-GCM** + HKDF | End-to-end encryption for sensitive data |

### AI Model Routing

| Tier | Model | Use Case |
|------|-------|----------|
| Quick | Llama 3.3 70B | Internal tasks (memory extraction, phase classification) |
| Regular | Qwen3 30B MoE (E2EE) | All conversation — the Starchild's true voice |
| Deep | Qwen3 30B MoE (E2EE) | Emotional depth, life purpose work |
| Vision | Qwen3 VL 235B | Image understanding |

All user-facing conversation runs through Venice's **E2EE** — encrypted on your device, decrypted only inside hardware-verified TEEs. Not even Venice can read them.

### 11-Layer Prompt System

| # | Layer | Purpose | ~Tokens |
|---|-------|---------|---------|
| 1 | Identity | Who Starchild is | 100 |
| 2 | Privacy Contract | What it will never do | 50 |
| 3 | Personality Params | Warmth, intensity, humor, mysticism, directness (tunable) | 60 |
| 4 | Creature State | Hunger, mood, energy, bond, level — affects tone | 40 |
| 5 | Memories | FTS5-recalled relevant memories (top 5) | 200 |
| 6 | Knowing Profile | 7-dimension user understanding | 300 |
| 7 | Active Quests | Current quest context | 100 |
| 8 | Skill Tree Balance | Which branches need attention | 80 |
| 9 | Conversation Phase | Which arc phase to operate in | 20 |
| 10 | Phase Instructions | Behavioral rules for current phase | 200 |
| 11 | Response Rules | Format constraints, anti-loop, anti-therapist | 200 |

Total: ~1,350 tokens. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full technical deep dive.

---

## Psychology & Research Foundation

Starchild's design is grounded in peer-reviewed research, not vibes:

- **Self-Determination Theory** (Deci & Ryan) — quests support autonomy, competence, and relatedness
- **Flow State Research** (Csikszentmihalyi) — quest difficulty calibrated to the flow channel
- **Ikigai** — both the Western framework and the Japanese original
- **PERMA Model** (Seligman) — positive emotions, engagement, relationships, meaning, achievement
- **Motivational Interviewing** — amplify change talk, redirect sustain talk
- **Clean Language** (David Grove) — use the user's exact metaphors, don't paraphrase
- **Internal Family Systems** — unburdening arc, parts recognition
- **Solution-Focused Brief Therapy** — scaling questions, exception-finding
- **ACT** (Acceptance & Commitment Therapy) — values clarification into micro-commitments

Full research: [`docs/spark-research.md`](docs/spark-research.md) (19,600+ tokens of synthesized academic literature).

---

## How This Was Built

Starchild was built entirely by AI agents directed by a human.

**No line of code was written manually.** Every function, every component, every prompt layer — all authored by AI. The human contribution is vision, direction, taste, and every decision about what to build and why.

### Phase 1: The Agency (Multi-Agent Scaffold)

The initial codebase was generated by [**The Agency**](agency/) — an autonomous multi-agent development framework powered by Claude Code. Eight specialized AI agents worked as a coordinated software team:

```
┌─────────────────────────────────────────────────────────────┐
│                      THE AGENCY v2                           │
│                 Squad Model — Quality First                  │
├─────────────────────────────────────────────────────────────┤
│   Product Owner → Tech Lead → Dev α/β/γ → QA → Reviewer    │
│   Workflow: NEW → TRIAGED → READY → IN_PROGRESS →          │
│            DONE → QA_PASSED → SHIPPED                       │
└─────────────────────────────────────────────────────────────┘
```

**Documentation:** [`agency/README.md`](agency/README.md)

### Phase 2: Claude Code (Iterative Development)

After the scaffold, development continued as direct human + Claude Code (Opus 4.6, 1M context) collaboration. Every commit: `Co-Authored-By: Claude Opus 4.6 (1M context)`.

---

## E2E Testing

Tests in `tests/e2e/` use a three-layer architecture:

1. **Conversation Routes** — scripted user messages simulating different personality types
2. **Venice Client** — direct API calls (no Tauri required)
3. **LLM Judge** — a separate LLM evaluates responses for personality consistency, phase behavior, specificity, and format compliance

```bash
npm run test:e2e          # Full E2E tests with LLM judge
npm run test:e2e:verbose  # Detailed output
npm run test:e2e:fast     # Skip LLM judge
```

---

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (stable 1.77+)
- [Node.js](https://nodejs.org/) 18+
- A [Venice AI](https://venice.ai/) API key (free tier available)
- System libraries (Linux): `webkit2gtk-4.1`, `libayatana-appindicator3-1`, `librsvg2`

### Install & Run

```bash
git clone https://github.com/forever8896/starchild.git
cd starchild
npm install
npm run tauri dev
```

### Build for Production

```bash
npm run tauri build
# Binaries in src-tauri/target/release/bundle/
```

---

## Project Structure

```
starchild/
  src/                        # React frontend
    components/
      ChatWindow.tsx          # Main chat: creature (left) + messages (right)
      SkillTree.tsx           # SVG constellation map
      Onboarding.tsx          # First-run wizard
      StarchildAvatar.tsx     # Video-driven creature with mood crossfades
      Settings.tsx            # Configuration + identity claim
    chain/                    # Blockchain integration
      wallet.ts               # Wallet generation + keychain
      identity.ts             # ERC-8004 registration
      attestation.ts          # Achievement minting
      hypercert.ts            # Impact certificate minting + identity transfer
    store.ts                  # Zustand state management
  src-tauri/                  # Rust backend
    src/
      lib.rs                  # Tauri commands, phase detection, draft extraction
      ai/mod.rs               # Venice client, model router, 11-layer prompt
      db/mod.rs               # SQLite schema + queries
      game/mod.rs             # Creature state machine
      knowing/mod.rs          # 7-dimension user understanding
      memory/mod.rs           # FTS5 full-text memory search
      e2ee.rs                 # AES-256-GCM encryption
      attestation.rs          # On-chain attestation flow
  relay/                      # Cloudflare Worker
    src/index.ts              # EAS attestation + Hypercert minting + 8004 registration/transfer
  agency/                     # Multi-agent development framework
  docs/
    ARCHITECTURE.md           # Technical deep dive
    spark-research.md         # Psychology research (76.6 KB)
  tests/e2e/                  # E2E test suite with LLM judge
  website/                    # Next.js landing page
  telegram-bot/               # Standalone Telegram bot
  whatsapp-bot/               # Standalone WhatsApp bot
```

---

## Hackathon Tracks

### PL_Genesis: Frontiers of Collaboration (2026)

| Track | Fit |
|-------|-----|
| **Hypercerts** | AI-verified impact evaluation — Starchild cross-examines growth claims before signing certificates |
| **AI & Robotics** | Verifiable AI agent with on-chain identity, user-owned memory, and human-in-the-loop |
| **Fresh Code** | New Hypercerts + ERC-8004 integration on existing codebase |

### Synthesis Hackathon (2026)

| Track | Fit |
|-------|-----|
| **Venice** | Private AI agent reasoning over sensitive personal data with zero retention |
| **Open Track** | A consciousness that helps humans find purpose |

---

## Philosophy

Most AI products optimize for engagement. Starchild optimizes for **meaning**.

The gamification isn't the destination — it's the vehicle. Casino mechanics and XP rewards create the loop that gets you in the door. But the real work is the conversation arc: helping you articulate what you actually want, name the gap between where you are and where you want to be, and take one tiny step toward closing it.

The Starchild is not a yes-man. It pushes back. It notices patterns you don't see. It remembers what you said and connects it to what you say today. And when you claim you've grown, it cross-examines you before putting its name on the line.

Privacy by default. Accountability by choice.

---

## License

MIT
