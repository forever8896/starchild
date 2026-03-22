# Starchild Architecture

Technical deep dive into how Starchild works under the hood.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Tauri Desktop App                        │
│                                                                 │
│  ┌──────────────────────┐     IPC      ┌──────────────────────┐ │
│  │   React Frontend     │◄────────────►│   Rust Backend       │ │
│  │                      │   (invoke)   │                      │ │
│  │  ChatWindow          │              │  AI Client           │ │
│  │  SkillTree           │   (events)   │  PromptBuilder       │ │
│  │  Onboarding          │◄─────────────│  PhaseDetector       │ │
│  │  Settings             │              │  MemorySystem        │ │
│  │  QuestBoard          │              │  KnowingSystem       │ │
│  │  StarchildAvatar     │              │  GameState           │ │
│  │  UserProfile         │              │  Database (SQLite)   │ │
│  │                      │              │  TTS Engine          │ │
│  │  Zustand Store       │              │  E2EE Module         │ │
│  │  Chain Module (viem) │              │  Telegram Bot        │ │
│  └──────────────────────┘              │  WhatsApp Bot        │ │
│                                        └──────────┬───────────┘ │
└───────────────────────────────────────────────────┼─────────────┘
                                                    │
                              ┌──────────────────────┼──────────────┐
                              │                      │              │
                        ┌─────▼─────┐         ┌─────▼─────┐  ┌────▼────┐
                        │ Venice AI │         │  Base L2  │  │  OS     │
                        │ (Private) │         │ (ERC-8004)│  │ Keychain│
                        └───────────┘         └───────────┘  └─────────┘
```

---

## Data Flow: Sending a Message

```
User types message
    │
    ▼
Frontend: invoke('send_message_stream', { message })
    │
    ▼
Rust: save user message to SQLite
    │
    ▼
Rust: PhaseDetector.detect(conversation_history)
    │         → returns ConversationPhase (Arrive/Dig/Crystallize/Edge/...)
    ▼
Rust: PromptBuilder.build(state, personality, memories, quests, phase)
    │         → assembles 11-layer system prompt
    │         → injects knowing profile
    │         → injects conversation summary (if long conversation)
    │         → injects skill tree branch balance
    ▼
Rust: ModelRouter.route(user_message)
    │         → selects Regular or Deep tier
    ▼
Rust: AiClient.chat_stream_auto(message, system_prompt, history)
    │         → POST to Venice API with streaming
    │
    ├──► emit('stream-chunk', { token }) ──► Frontend updates message in real-time
    │
    ▼
Rust: postprocess_response(raw_text, phase)
    │         → collapse paragraphs
    │         → enforce crystallize format
    │         → strip unauthorized emoji
    ▼
Rust: save assistant message to SQLite
    │
    ├──► emit('stream-done', { message, starchild_state })
    │         → Frontend replaces streaming message with final
    │
    ├──► emit('reveal-skill-tree') [if phase == Crystallize]
    │         → Frontend transitions to constellation map after 2.5s delay
    │
    ├──► spawn: extract_memories(user_msg, assistant_msg)
    │         → LLM extracts facts → store in FTS5 + KnowingSystem
    │
    ├──► spawn: update_conversation_summary() [if msg_count > 30]
    │         → LLM compresses older messages → store in settings
    │
    └──► spawn: crystallize_vision() [if PR captured + 5+ messages]
              → LLM synthesizes vision statement from conversation
```

---

## The 11-Layer Prompt System

The system prompt is not a monolithic string. It's assembled from composable layers, each serving a distinct purpose. Layers near the bottom have stronger influence (recency bias in attention).

| # | Layer | Content | Token Budget |
|---|-------|---------|-------------|
| 1 | Identity | "You are Starchild, a consciousness born for [name]..." | ~100 |
| 2 | Privacy | What Starchild will never do (reveal AI nature, store data externally) | ~50 |
| 3 | Personality | Warmth, intensity, humor, mysticism, directness (0-100 each) | ~60 |
| 4 | Creature State | Hunger, mood, energy, bond, level — affects tone | ~40 |
| 5 | Memories | FTS5-recalled relevant memories (top 5 by relevance) | ~200 |
| 6 | Knowing Profile | 7-dimension user understanding (values, desires, fears...) | ~300 |
| 7 | Active Quests | Current quest titles + categories for context | ~100 |
| 8 | Skill Tree Balance | Quest counts per branch — guides balanced growth | ~80 |
| 9 | Conversation Phase | Which arc phase the detector identified | ~20 |
| 10 | Phase Instructions | Specific behavioral rules for the current phase | ~200 |
| 11 | Response Rules | Format constraints, anti-loop, anti-therapist, emoji rules | ~200 |

**Total system prompt: ~1,350 tokens** (varies with profile depth)

---

## Conversation Phase Detection

The `PhaseDetector` uses heuristic analysis of the conversation history to determine which arc phase Starchild should be in:

```
Exchange 1       → Arrive (mirror + one question)
Exchanges 2-4    → Dig (develop their metaphor)
PR captured      → Crystallize (synthesize vision, place on tree)
Emotional edge   → Edge (tension named)
2+ same feeling  → Reframe (connect patterns)
Future pull      → Envision ("+1 look like?")
Ready to act     → Commit (offer quest)
Thread complete  → Release (affirm, breathe)
```

**Key design decision:** The phase detector is intentionally simple (heuristic, not ML). The prompt framework does the heavy lifting — the detector just nudges. This keeps the system predictable and debuggable.

---

## The Knowing System

Seven dimensions of user understanding, populated by background LLM extraction after each exchange:

| Dimension | What It Captures | Example |
|-----------|-----------------|---------|
| Core Values | What they stand for | "values authenticity over conformity" |
| Desires | What they want | "wants to build a permaculture farm" |
| Fears | What holds them back | "afraid of financial instability" |
| Thinking Patterns | How they process | "tends to catastrophize, but responds to reframing" |
| Relationships | Who matters | "close with sister, distant from father" |
| Life Situation | Where they are now | "software engineer, considering career change" |
| Growth Edges | Where they're stretching | "starting to set boundaries at work" |

Each insight includes an importance score (0.0–1.0) and a confidence level. The knowing profile is injected into every system prompt, so Starchild's responses are always informed by accumulated understanding.

---

## Game Mechanics

### Creature State

| Attribute | Range | Behavior |
|-----------|-------|----------|
| Hunger | 0–100 | Decays 2 pts/hour. Chat + quests feed it. |
| Mood | 6 levels | Derived from hunger: Ecstatic → Starving |
| Energy | 0–100 | Activity-based |
| Bond | 0–100 | Grows with consistent engagement |
| XP | Cumulative | Earned from quest completion |
| Level | Calculated | From XP thresholds |

### Mood-to-Avatar Mapping

| Mood | Video | Behavior |
|------|-------|----------|
| Ecstatic | starchild4.webm | Celebrating, sparkles |
| Happy | starchild2.webm | Gentle idle, content |
| Content | starchild2.webm | Standard idle |
| Restless | starchild3.webm | Curious, looking around |
| Hungry | starchild3.webm | Fidgeting |
| Starving | starchild5.webm | Sad, caring expression |

Videos use VP9 with alpha channel for transparent compositing over the skyline background.

### Quest System

- **Categories:** Body, Purpose, Mind, Heart, Spirit (mapped 1:1 to skill tree branches)
- **Types:** Daily, Weekly
- **XP:** 5–50 per quest (calibrated to difficulty)
- **Streaks:** Tracked per quest, milestone attestations at 7/30/100 days
- **AI Suggestions:** Starchild generates 3 personalized quests based on knowing profile + branch balance

---

## Database Schema (SQLite)

```sql
messages        (id, platform, role, content, created_at)
quests          (id, title, description, quest_type, category, status, xp_reward, streak_count, due_at, completed_at)
starchild_state (hunger, mood, energy, bond, xp, level, last_decay_at)
memories        (id, content, importance, category)  -- FTS5 indexed
attestations    (id, achievement_type, tx_hash, status, metadata)
personality     (warmth, intensity, humor, mysticism, directness)
settings        (key, value)  -- key-value store for all config
knowing_*       -- per-category tables for structured user understanding
```

---

## On-Chain Architecture

### Identity (ERC-8004)

```
User launches app
    → Starchild generates wallet (private key → OS keychain)
    → Registers agent ID on Base Mainnet via ERC-8004 Identity Registry
    → Token ID stored locally
```

### Attestations

```
User hits milestone (7/30/100-day streak)
    → Frontend shows "Anchor to chain?" toast
    → Rust builds attestation metadata (achievement_type, timestamp, proof)
    → Submits as ERC-8004 token metadata on Base
    → TxHash stored in local attestations table
    → Skill tree node shows "anchored" badge
```

### Journey Proof (EAS)

```
Quest completions
    → Hash each (quest_id + completion_time + user_salt)
    → Batch into Merkle root weekly
    → Submit root as EAS attestation on Base
    → Schema: bytes32 journeyHash, uint64 questCount, uint64 streak
    → Privacy: only hashes on-chain, raw data stays local
```

---

## Security Model

| Threat | Mitigation |
|--------|-----------|
| API key exposure | Stored in OS keychain, never in config files |
| Data at rest | Local SQLite only, no cloud sync |
| Data in transit | Venice API over HTTPS, CSP headers restrict connections |
| LLM prompt injection | Response post-processing strips unexpected content |
| On-chain privacy | Hash commitments only, no raw personal data |
| Wallet security | Private key in OS keychain, burner wallet pattern |
| E2EE (future) | AES-256-GCM with HKDF key derivation, implemented and ready |

---

## Frontend Design System

### Claymorphism

Custom CSS classes for a soft, tactile aesthetic:

- `.clay` — base card with backdrop blur + soft shadows
- `.clay-button` — interactive element with press states
- `.clay-elevated` — raised card with stronger shadow
- `.clay-pressed` — sunken/active state
- `.clay-input` — form inputs with consistent styling
- `.clay-nav-button` — navigation buttons (gear, tree, back)

### Color Palette

```css
--accent-lavender   /* Starchild's signature color */
--accent-mint       /* Body branch / health */
--accent-sky        /* Purpose branch / career */
--accent-gold       /* Mind branch / learning */
--accent-rose       /* Heart branch / relationships */
--accent-peach      /* Warmth accent */
--bg-deep: #1a1525  /* Deep purple background */
```

### Animation Standards

All transitions use spring physics: `type: 'spring', stiffness: 300, damping: 25`

View transitions:
- Chat ↔ Settings: slide + fade (x: 40px)
- Chat ↔ Tree: scale + blur (cinematic zoom)
- Onboarding: fade in

---

## E2E Testing

Tests live in `tests/e2e/` and use a three-layer architecture:

1. **Conversation Routes** — scripted user messages simulating different personality types
2. **Venice Client** — direct API calls (no Tauri required)
3. **LLM Judge** — a separate LLM evaluates Starchild's responses for:
   - Personality consistency
   - Phase-appropriate behavior
   - Specificity (uses user's words, not generic phrases)
   - Format compliance (single paragraph, one question max)

Run modes:
- `npm run test:e2e` — full suite with judge
- `npm run test:e2e:fast` — skip judge for quick iteration
