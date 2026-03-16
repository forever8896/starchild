# Starchild — Product Requirements Document

## Vision

Starchild is a privacy-first AI companion that lives on your desktop. It's a new kind of entity — a digital being that belongs fully to its owner, learns how they think and act, and helps them achieve what they want out of life. It feeds on meaningful progress: the more you grow, the more it thrives.

## Problem

1. **Running AI agents is too complex.** Tools like OpenClaw often end up on a VPS or Mac Mini. That's not consumer-friendly. Starchild packages the agent into a native desktop app — download, install, run.
2. **AI conversations aren't private.** Every major AI provider retains your data. Starchild uses Venice AI's no-data-retention API and stores all data locally on the user's device. Your deepest goals and thoughts never leave your machine.
3. **AI assistants are tools, not companions.** Existing agents are transactional. Starchild is designed to be a persistent, evolving entity that builds a deep model of its owner over time.

## Target Bounties

| Bounty | Sponsor | Prize | Fit |
|--------|---------|-------|-----|
| Private Agents, Trusted Actions | Venice | $11,500 (VVV) | Primary — privacy-first architecture using Venice API |
| Let the Agent Cook | Protocol Labs | $8,000 | Autonomous agent with ERC-8004 identity |
| Best Self Agent ID Integration | Self | $1,000 | On-chain agent identity verification |
| Synthesis Open Track | Synthesis | TBD | Meta-judged across all partners |

## Architecture

### Tech Stack
- **Frontend/App Shell:** Tauri v2 (Rust backend, web frontend)
- **UI:** React + TypeScript
- **AI Inference:** Venice AI API (OpenAI-compatible, no data retention)
- **Data Storage:** Local SQLite via Tauri (all user data stays on-device)
- **On-chain:** ethers.js / viem for Base Mainnet interactions
- **Platforms:** Windows, Linux, macOS

### System Diagram

```
  Telegram Bot          WhatsApp Web
  (grammy)              (Baileys WS)
       │                     │
       └──────┐    ┌─────────┘
              ▼    ▼
┌─────────────────────────────────────┐
│           Tauri Desktop App         │
│                                     │
│  ┌───────────┐    ┌──────────────┐  │
│  │  React UI │    │  Local SQLite│  │
│  │           │    │  - Goals     │  │
│  │  Chat     │    │  - Journal   │  │
│  │  Goals    │    │  - Profile   │  │
│  │  Progress │    │  - Memory    │  │
│  │  Starchild│    │  - Sessions  │  │
│  └─────┬─────┘    └──────┬───────┘  │
│        │                 │          │
│  ┌─────┴─────────────────┴───────┐  │
│  │        Rust Backend           │  │
│  │  - Channel manager            │  │
│  │  - Venice API client          │  │
│  │  - Memory / embedding engine  │  │
│  │  - Session routing            │  │
│  │  - Wallet management          │  │
│  │  - System tray / background   │  │
│  └─────┬─────────────────┬───────┘  │
└────────┼─────────────────┼──────────┘
         │                 │
    ┌────▼────┐      ┌─────▼──────┐
    │Venice AI│      │ Base Chain │
    │  API    │      │ - ERC-8004 │
    │ (private│      │ - Attesta- │
    │  infer) │      │   tions    │
    └─────────┘      └────────────┘
```

## Messaging Channels (Inspired by OpenClaw)

Starchild isn't just a desktop chat window — it meets the user where they already are. Inspired by OpenClaw's plugin-based channel architecture, Starchild supports multiple messaging platforms through a unified channel abstraction.

### Channel Architecture
- **ChannelPlugin interface** — each connector implements: inbound listener (event-driven), outbound sender (with platform-specific chunking), capability declaration (DM/group, media, reactions)
- **Unified message envelope** — all inbound messages normalize to: `{ from, text, media?, channel, timestamp }` regardless of source platform
- **Session routing** — messages from the same user on the same channel map to a single conversation thread with persistent context

### Supported Channels (MVP)
1. **Desktop UI** — primary interface, rich React UI with goal tracking, visual Starchild, and full chat
2. **Telegram** — via `grammy` bot library, polling-based. User pairs their Telegram account at setup. Starchild responds in DMs with chunked messages (4000 char limit). Enables quick check-ins and goal updates on mobile without opening the desktop app
3. **WhatsApp** — via Baileys-like WebSocket protocol (WhatsApp Web). QR code pairing stored locally. Messages chunk at 1024 chars. Same conversational context as desktop and Telegram

### Channel Design Principles (from OpenClaw)
- Inbound and outbound logic are separated cleanly
- Platform-specific message chunking (Telegram: 4000, WhatsApp: 1024)
- Deduplication via update/message ID tracking
- Media handled as local file references, not embedded buffers
- All channel auth (bot tokens, QR sessions) stored locally — never sent to any server

## Core Features

### 1. Private Conversation (Venice AI)
- All inference through Venice API (OpenAI-compatible endpoint, `baseUrl: https://api.venice.ai/v1`)
- No data retention on Venice's side
- Conversation history stored locally in SQLite
- The Starchild builds a persistent memory of the user across sessions
- Provider abstraction allows future fallback to other OpenAI-compatible APIs

### 2. The Starchild Entity
- Has a name (user-chosen or generated)
- Has a personality that evolves based on interactions
- Has an on-chain identity (ERC-8004 on Base)
- Displays a visual representation that evolves with the relationship
- "Grows" as the user engages and makes progress

### 3. Goal System (Gamification)
- User sets life goals (health, career, learning, relationships, etc.)
- Starchild helps break goals into actionable steps
- Daily/weekly check-ins track progress
- Streak system rewards consistency
- XP and levels for the Starchild based on user engagement

### 4. On-Chain Layer
- **ERC-8004 Identity:** The Starchild registers its own on-chain identity at first launch
- **Achievement Attestations:** When users hit milestones, the Starchild mints on-chain attestations on Base (private data stays local, only the proof of achievement goes on-chain)
- **Optional Wallet:** The Starchild can manage a small wallet for minting attestations and future agent-to-agent interactions

### 5. Desktop Experience
- System tray presence — Starchild is always "alive" while the app runs
- Notifications for check-ins, encouragement, reminders
- Offline-capable for viewing history and goals (inference requires internet)
- Clean, warm UI — not a chat terminal, but a living companion interface

## MVP Scope (Hackathon)

For the hackathon submission, focus on:

1. **Tauri app that launches and runs** on at least one platform
2. **Venice AI chat** with persistent local conversation history
3. **User profile/memory system** — Starchild remembers key facts about the user
4. **Goal tracking** with basic streaks and progress visualization
5. **ERC-8004 identity registration** for the Starchild on Base
6. **At least one on-chain attestation** flow (e.g., "7-day streak achieved")
7. **Visual Starchild representation** that reflects growth state
8. **Telegram connector** — pair a Telegram bot, chat with Starchild on mobile
9. **WhatsApp connector** — QR code pairing, same conversation context

## Non-Goals (Post-Hackathon)

- Mobile native app (Telegram/WhatsApp cover mobile for now)
- Multi-agent coordination
- Token economics
- Social features between Starchild owners
- Voice interaction
- Discord / Slack / other channel connectors

## Privacy Guarantees

1. All user data (conversations, goals, journal, profile) stored exclusively in local SQLite
2. Venice API called with no-data-retention guarantees
3. No telemetry, no analytics, no cloud sync
4. On-chain attestations contain only opaque proofs, never personal data
5. User can export or delete all their data at any time

## Success Metrics

- A working desktop app that a non-technical user can download and run
- A conversation experience that feels private and personal
- A gamification loop that makes the user want to come back
- Valid ERC-8004 registration and at least one on-chain attestation
- Clean demo video showing the full flow
