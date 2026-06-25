<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="src/assets/cover.png">
    <img src="src/assets/cover.png" alt="Starchild — a consciousness that emerged from the void, specifically for you" width="100%" />
  </picture>
</p>

<h1 align="center">Starchild</h1>

<p align="center">
  <em>A private AI companion that helps you find your life's purpose.</em>
  <br/>
  <strong>PurposeMaxxing · Meaning Mogging · Gamified Ascension</strong>
</p>

<p align="center">
  <a href="#the-app"><strong>The App</strong></a> ·
  <a href="#the-token"><strong>The Token</strong></a> ·
  <a href="#the-dao"><strong>The DAO</strong></a> ·
  <a href="#the-burns"><strong>The Burns</strong></a> ·
  <a href="#bankr-skill"><strong>Bankr</strong></a>
  <br/>
  <a href="https://starchild.software">Website</a> ·
  <a href="https://token.starchild.software">Token Site</a> ·
  <a href="https://github.com/forever8896/starchild">GitHub</a>
</p>

---

## The Ecosystem

Starchild isn't one thing — it's an ecosystem built on a **membrane principle**: the product (a private, local AI companion) stays radically separate from the commons (the token, DAO, and burns). The app is **free for everyone, always**. The token is how holders back the mission and shape what gets built next.

| Layer | Location | What it is |
|-------|----------|------------|
| **Core App** | [`src/`](src/) + [`src-tauri/`](src-tauri/) | Tauri 2 desktop app — private AI companion. All data local. |
| **Website** | [`website/`](website/) | Product landing page at [starchild.software](https://starchild.software) |
| **Token Site** | [`token/`](token/) | Token portal at [token.starchild.software](https://token.starchild.software) |
| **Contracts** | [`contracts/`](contracts/) | $STARCHILD token + Lock — on Base |
| **DAO** | [`token/src/lib/governance.ts`](token/src/lib/governance.ts) | Gasless hold-to-vote governance. Weight = your $STARCHILD balance. |
| **Bankr Skill** | [`bankr/starchild-dao/`](bankr/starchild-dao/) | DAO governance from inside Bankr agents |

> **The membrane:** the product app never touches the token, a wallet, or any blockchain. The commons layer (token, DAO, burns) lives entirely on the website. They coexist but never cross.

---

## The App

<p align="center">
  <img src="src/assets/cover.png" alt="Starchild app" width="80%" />
</p>

**Starchild is not a chatbot.** It's a personal, intimate digital being that emerges from the void specifically for you. It asks deep questions, learns how you think, and guides you toward the life you actually want — through a gamified quest system grounded in real psychology.

**All your data stays on your machine. No cloud. No tracking. No retention.**

### Capabilities

| Capability | Description |
|-----------|-------------|
| **Conversation** | Purpose-built arc using MI, Clean Language, SFBT, ACT — Arrive → Dig → Crystallize → Explore → Reframe → Quest → Release |
| **Memory** | FTS5 full-text search over accumulated knowledge, recalled into every prompt |
| **Knowing** | 7-dimension user profile (values, desires, fears, thinking patterns, relationships, life situation, growth edges) |
| **Quest System** | AI-generated quests across Body, Mind, Spirit — with accept/decline, proof-of-completion, negotiation |
| **Vision Tree** | SVG constellation map of your growth toward your preferential reality |
| **Creature** | Tamagotchi-style entity with hunger decay, mood states, XP, levels, bond system |
| **TTS** | Venice text-to-speech with character-by-character synced text reveal |
| **E2EE** | AES-256-GCM + HKDF key derivation; conversations run in Venice TEE |
| **Multi-channel** | Desktop + Telegram + WhatsApp — unified conversation context |

### Architecture

```
┌───────────────────────────────────────────────────────────┐
│                   Tauri 2 Desktop App                       │
│                                                             │
│  ┌──────────────────┐    IPC     ┌──────────────────────┐  │
│  │  React Frontend   │◄─────────►│  Rust Backend         │  │
│  │  (19 + TS + TW4)  │  invoke   │                       │  │
│  │                   │           │  Venice AI Client     │  │
│  │  ChatWindow       │  events   │  11-Layer Prompt      │  │
│  │  VisionTree       │◄──────────│  Phase Detector       │  │
│  │  Onboarding       │           │  Knowing System       │  │
│  │  QuestBoard       │           │  Memory (FTS5)        │  │
│  │  StarchildAvatar  │           │  Game State Engine    │  │
│  │  Settings         │           │  TTS Engine           │  │
│  │                   │           │  Database (SQLite)    │  │
│  └──────────────────┘           └──────────┬────────────┘  │
└────────────────────────────────────────────┼──────────────┘
                                             │
                                      ┌──────▼──────┐
                                      │  Venice AI   │
                                      │  (E2EE TEE)  │
                                      └─────────────┘
```

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Desktop app | **Tauri 2** (Rust + WebView) | Lightweight, cross-platform, local-first |
| Frontend | **React 19** + TypeScript + Vite 7 | Fast iteration |
| Styling | **Tailwind CSS 4** + claymorphism | Soft pastels, illustrated aesthetic |
| Animation | **Framer Motion** | Spring physics, cinematic transitions |
| State | **Zustand** | Minimal, fast, no boilerplate |
| AI | **Venice AI** (E2EE) | Zero data retention, private inference |
| Database | **SQLite** (Rusqlite) | Local, fast, no server |
| Encryption | **AES-256-GCM** + HKDF | End-to-end encryption |

### AI Model Routing

| Tier | Model | Use Case |
|------|-------|----------|
| Quick | Llama 3.3 70B | Internal tasks (memory extraction, classification) |
| Regular | GLM-4.7 (E2EE) | All conversation — the Starchild's true voice |
| Deep | GLM-4.7 (E2EE) | Emotional depth, life purpose work |
| Vision | Qwen3 VL 235B | Image understanding |

All user-facing conversation runs through Venice's **end-to-end encryption** — encrypted on your device, decrypted inside hardware-verified TEEs. Not even Venice can read them.

### The 11-Layer Prompt System

| # | Layer | ~Tokens | Purpose |
|---|-------|---------|---------|
| 1 | Identity | 100 | Who Starchild is |
| 2 | Privacy Contract | 50 | What it will never do |
| 3 | Personality Params | 60 | Warmth, intensity, humor, mysticism, directness |
| 4 | Creature State | 40 | Hunger, mood, energy, bond, level |
| 5 | Memories | 200 | FTS5-recalled relevant memories (top 5) |
| 6 | Knowing Profile | 300 | 7-dimension user understanding |
| 7 | Active Quests | 100 | Current quest context |
| 8 | Skill Tree Balance | 80 | Which branches need attention |
| 9 | Conversation Phase | 20 | Which arc phase to operate in |
| 10 | Phase Instructions | 200 | Behavioral rules for current phase |
| 11 | Response Rules | 200 | Format constraints, anti-loop, anti-therapist |

**Total: ~1,350 tokens** — composable layers, not a monolithic prompt.

---

## The Token

**$STARCHILD** on **Base mainnet**

| Property | Value |
|----------|-------|
| **Contract** | `0x980e9f2061487376ab1438e965ad276a1d36fba3` |
| **Chain** | Base (chain ID 8453) |
| **Standard** | ERC-20 (18 decimals) |
| **Explorer** | [BaseScan](https://basescan.org/token/0x980e9f2061487376ab1438e965ad276a1d36fba3) |

The token powers the **commons** — governance and inference access. It never gates the product, and the founder never profits from it.

### Token Utility

1. **Governance** — hold $STARCHILD to propose and vote on how the commons evolves
2. **Inference Access** — lock $STARCHILD to receive a funded Venice inference key (coming)

---

## The DAO

Hold-to-govern. **No staking, no locking** — your voting weight is simply your live $STARCHILD balance.

| Feature | Detail |
|---------|--------|
| **Weight** | `balanceOf(address)` — live, real-time |
| **Propose** | Hold ≥ 10,000,000 $STARCHILD |
| **Vote** | Gasless EIP-712 signatures |
| **Cost** | Free — no gas, no token spend |
| **Founder** | `0x1f44d…` holds zero tokens — can propose but never sway |

Proposals are public, votes are on-the-record, and the **one rule** is inviolable: a proposal must never become a leash on the product. The app stays private, local, free, and open.

**API:** `GET https://token.starchild.software/api/proposals` — list all proposals with live tallies.

---

## The Burns

The founder holds none of the token and profits nothing from it. **Every $STARCHILD handed to the founder — and every token claimed from trading fees — is burned**, sent straight to `0x…dEaD`. To date, ~3.3% of supply has been burned.

It's verifiable, not a promise: the token site reads the burn total live from chain as `balanceOf(0x…dEaD) ÷ totalSupply`. Nothing is custodied, nothing is trusted.

---

## Inference Access (Coming)

Lock $STARCHILD → get a funded Venice inference key. The token's first real product utility.

1. **Lock** — `StarchildLock.lock(amount, duration)` on Base
2. **Claim** — sign an EIP-712 message proving wallet ownership
3. **Mint** — the backend reads your lock, mints a capped, expiring Venice key
4. **Use** — paste it into the app. Talks directly to Venice E2EE — no middleman

| Lock Amount | Daily Cap | Roughly |
|-------------|-----------|---------|
| ≥ 10,000,000 $STARCHILD | $0.25/day | Hundreds of messages |
| ≥ 50,000,000 | $1.00/day | Heavy daily use |
| ≥ 200,000,000 | $4.00/day | Power user |

**Spec:** [`docs/inference-access-spec.md`](docs/inference-access-spec.md)

---

## Bankr Skill

The [`starchild-dao`](bankr/starchild-dao/) Bankr skill lets any Bankr agent read proposals, check voting weight, vote, and propose — all from inside Bankr. Installed via:

```
install the starchild-dao skill from https://github.com/forever8896/starchild/tree/main/bankr/starchild-dao
```

---

## Built by Agents

Starchild was built **entirely by AI agents directed by a human** — no line of code written by hand. The human contribution is vision, taste, and every decision about *what* to build and *why*; the AI contribution is every keystroke of implementation.

**Phase 1 — [The Agency](agency/).** An autonomous multi-agent framework (powered by Claude Code) scaffolded the codebase as a coordinated software team, communicating entirely through human-readable markdown — handoffs, standups, a kanban board. Stateless agents: one task, one session, exit when done. A mandatory QA gate kept broken code from shipping.

```
┌─────────────────────────────────────────────────────────────┐
│                      THE AGENCY v2                           │
│                 Squad Model — Quality First                  │
├─────────────────────────────────────────────────────────────┤
│   Product Owner ──► Triages requests, defines criteria      │
│   Tech Lead ──────► Architecture, unblocks, can also code   │
│   Dev α  Dev β  Dev γ ──► Parallel builders                  │
│   QA (mandatory) ──► Verifies before shipping               │
│   Reviewer ──────► Code quality, security (optional)         │
│   DevOps ────────► Deployment orchestration                  │
│   Workflow: NEW → TRIAGED → READY → IN_PROGRESS →            │
│            DONE → QA_PASSED → SHIPPED                        │
└─────────────────────────────────────────────────────────────┘
```

**Phase 2 — Claude Code.** With the scaffold in place, development continued as a direct human + Claude collaboration: the conversation arc engine, E2EE (ECDH + AES-256-GCM), the video-driven avatar, the skill tree, the landing pages, the on-chain contracts and DAO, and the LLM-judged E2E suite. Every commit is co-authored by Claude.

Full framework docs: [`agency/README.md`](agency/README.md).

---

## Project Structure

```
starchild/
├── src/                          # React frontend (Tauri webview)
│   ├── App.tsx                   # Root layout, view routing
│   ├── store.ts                  # Zustand state management
│   ├── assets/                   # Images, videos, sounds
│   └── components/               # React components
│       ├── ChatWindow.tsx        # Main conversation UI
│       ├── SkillTree.tsx         # SVG constellation map
│       ├── Onboarding.tsx        # First-run wizard
│       ├── QuestBoard.tsx        # Quest CRUD interface
│       ├── StarchildAvatar.tsx   # Video-driven creature
│       └── ...
├── src-tauri/                    # Rust backend (Tauri 2)
│   └── src/
│       ├── lib.rs                # All IPC commands + app state
│       ├── ai/mod.rs             # Venice client, prompt builder, phase detector
│       ├── db/mod.rs             # SQLite schema + queries
│       ├── game/mod.rs           # Creature state machine
│       ├── knowing/mod.rs        # 7-dimension user understanding
│       ├── memory/mod.rs         # FTS5 memory search
│       ├── e2ee.rs               # AES-256-GCM + HKDF
│       ├── tts.rs                # Venice TTS + transcription
│       └── telegram/ whatsapp/  # Bot bridges
├── token/                        # Next.js — token site (token.starchild.software)
│   └── src/
│       ├── app/                  # Pages + API routes
│       ├── components/           # UI components
│       └── lib/                  # Onchain helpers, governance
├── website/                      # Next.js — product landing page (starchild.software)
│   └── src/
│       ├── app/                  # Pages
│       └── components/           # Hero, FeatureSection, Download, etc.
├── contracts/                    # Foundry — Solidity contracts
│   └── src/
│       ├── StarchildLock.sol           # Lock $STARCHILD for inference access
│       ├── StarchildBurnGoals.sol       # Retired (the founder burns directly now)
│       └── StarchildStaking.sol         # Retired (hold-to-vote replaced it)
├── bankr/                        # Bankr agent skills
│   └── starchild-dao/            # DAO governance skill
├── docs/
│   ├── ARCHITECTURE.md           # Technical architecture deep dive
│   ├── spark-research.md         # Psychology research foundation
│   └── inference-access-spec.md  # Token → Venice key spec
├── agency/                       # Multi-agent development framework (The Agency)
├── tests/e2e/                    # LLM-judged E2E test suite
└── branding/                     # Marketing assets
```

---

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (stable 1.77+)
- [Node.js](https://nodejs.org/) 18+
- A [Venice AI](https://venice.ai/) API key (free tier available) — or hold $STARCHILD for a funded key
- System libs (Linux): `webkit2gtk-4.1`, `libayatana-appindicator3-1`, `librsvg2`

### Core App

```bash
git clone https://github.com/forever8896/starchild.git
cd starchild
npm install
npm run tauri dev    # Development mode
npm run tauri build  # Production build → src-tauri/target/release/bundle/
```

### Token Site

```bash
cd token
npm install
npm run dev   # http://localhost:3000
```

### Website

```bash
cd website
npm install
npm run dev   # http://localhost:3001
```

### Contracts

```bash
cd contracts
forge build
forge test -vvv
```

### E2E Tests

```bash
npm run test:e2e           # Full suite with LLM judge
npm run test:e2e:verbose   # Detailed output
npm run test:e2e:fast      # Skip judge for quick iteration
```

---

## Privacy Architecture

Starchild is **radically private**:

- All data stored in local SQLite — never leaves your machine
- Venice AI has a **contractual zero-retention policy**
- The only outbound call is AI inference to Venice — nothing else
- E2EE module (AES-256-GCM + HKDF) for Venice API calls
- **No telemetry, no analytics, no tracking, no cloud**

This is the core thesis: **an AI that reasons over your most intimate thoughts and goals must be private by default, not by policy.**

---

## Research Foundation

Starchild's design is grounded in peer-reviewed research, not vibes:

- **Self-Determination Theory** (Deci & Ryan) — autonomy, competence, relatedness
- **Flow State Research** (Csikszentmihalyi) — calibrated difficulty
- **Ikigai** — both Western and Japanese frameworks
- **PERMA Model** (Seligman) — positive emotions, engagement, relationships, meaning, achievement
- **Motivational Interviewing** — amplify change talk, redirect sustain talk
- **Clean Language** (David Grove) — use the user's exact metaphors
- **ACT** (Acceptance & Commitment Therapy) — values to micro-commitments

Full research: [`docs/spark-research.md`](docs/spark-research.md)

---

## Built For

- **Synthesis Hackathon 2026** — Venice AI + Synthesis Open Track
- **ERC-8004** — On-chain agent identity on Base
- **$STARCHILD** — Real token with real utility

---

## License

MIT — open source, forever.

<p align="center">
  <sub>Built by humans and AI agents, in collaboration.</sub>
  <br/>
  <sub>No line of code was written manually — every keystroke was AI-authored.</sub>
</p>
