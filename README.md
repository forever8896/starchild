# Starchild

An alien AI companion that helps you grow. Built with Tauri v2, React, and Venice AI.

Starchild is a privacy-first desktop companion that lives on your device. It chats with you, tracks your personal quests, remembers what matters to you, and evolves as you grow together. All data stays local.

## Features

- **AI Chat** — Conversational AI powered by Venice (privacy-preserving), with streaming responses and local chat history
- **Quest System** — Create daily/weekly quests with streak tracking, XP rewards, and level progression
- **Memory** — Starchild extracts and remembers facts about you, injecting context into future conversations
- **On-Chain Attestations** — Mint achievement attestations on-chain via ERC-8004 when you hit streak milestones (7/30/100 days)
- **Visual Avatar** — SVG companion with 4 growth stages, 6 mood palettes, animations, and expressions
- **Blockchain Identity** — Register your identity on-chain with secure key storage via OS keychain
- **Messaging Connectors** — Connect via Telegram bot or WhatsApp (Baileys) for on-the-go interaction
- **Desktop Notifications** — Check-in reminders and streak warnings so you never break a streak
- **Data Privacy** — Export all your data as JSON or wipe everything with one click. Your data, your control.

## Prerequisites

- **Linux** (x86_64) — tested on Arch Linux
- **Venice AI API Key** — get one at [venice.ai](https://venice.ai)
- No other dependencies needed for the packaged binary

## Install & Run (Packaged Binary)

### AppImage (recommended)

```bash
# Make executable and run
chmod +x starchild_0.1.0_amd64.AppImage
./starchild_0.1.0_amd64.AppImage
```

### Debian/Ubuntu (.deb)

```bash
sudo dpkg -i starchild_0.1.0_amd64.deb
starchild
```

## First Launch

1. Launch the app — the onboarding wizard will appear
2. Enter your Venice AI API key (it validates with a test call)
3. Choose your name and optionally name your Starchild
4. Start chatting! Your companion is ready.

## Build from Source

### Requirements

- Node.js 18+
- Rust 1.77+
- System libraries: `webkit2gtk-4.1`, `libayatana-appindicator3-1`, `librsvg2` (see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/))

### Steps

```bash
git clone <repo-url> starchild
cd starchild
npm install
npm run tauri:build
```

Binaries will be in `src-tauri/target/release/bundle/`.

## Development

```bash
npm install
npm run tauri:dev
```

## Architecture

- **Frontend:** React 19 + TypeScript + Tailwind CSS 4 + Vite 7
- **Backend:** Rust + Tauri v2 + SQLite (rusqlite) + tokio
- **AI:** Venice AI API with 7-layer system prompt and streaming
- **Chain:** viem for ERC-8004 identity and attestation contracts
- **Security:** OS keychain for secrets, local-only SQLite, CSP headers

## License

MIT
