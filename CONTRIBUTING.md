# Contributing to Starchild

Starchild is an open-source ecosystem with many layers — a private AI companion app, a token on Base, a DAO, and agent skills. Every layer has a place for you.

**The membrane principle:** the companion app stays private, local, and free — forever. The token, DAO, and burns are the commons that surround it, never the gate. Good contributions extend the mission from the outside; they never make the app depend on the token.

---

## Ways to Contribute

### Code

| Area | Stack | Location |
|------|-------|----------|
| **Desktop App** | Tauri 2 (Rust) + React 19 (TypeScript) | `src/` + `src-tauri/` |
| **Website** | Next.js (TypeScript) | `website/` |
| **Token Site** | Next.js 16 + viem + Upstash | `token/` |
| **Contracts** | Solidity + Foundry | `contracts/` |
| **Bankr Skills** | SKILL.md | `bankr/` |

**Get started:**
1. Fork the repo
2. Follow setup instructions in the [README](README.md#-getting-started)
3. Pick an [open issue](https://github.com/forever8896/starchild/issues)
4. Build, test, and submit a PR

### Participate in the DAO

Hold $STARCHILD and your voice counts. Propose ideas, vote on initiatives, and help shape the commons.

- **Weight:** Your live $STARCHILD balance — no staking, no locking
- **Propose:** Hold ≥ 10,000,000 $STARCHILD
- **Vote:** Gasless EIP-712 signatures (free)
- **One rule:** A proposal must never make the product depend on the token

→ [token.starchild.software/dao](https://token.starchild.software/dao)

### Test and Report Bugs

Run the app, push it to its edges, and open an issue when something breaks.

- **Bug reports:** Include your OS, app version, and steps to reproduce
- **Feature requests:** Describe the problem, not your solution — we'll figure out the right fix together
- **Security issues:** See [SECURITY.md](SECURITY.md) for responsible disclosure

### Improve Documentation

Docs are never done. If something was confusing, unclear, or missing:
- Fix the [README](README.md)
- Improve the [architecture docs](docs/ARCHITECTURE.md)
- Add to the [inference access spec](docs/inference-access-spec.md)

### Spread the Word

Tell someone who needs Starchild. Write about it. Share the [origin story](https://starchild.software/origin). The best growth is people who believe in the mission.

---

## Development Setup

### Prerequisites

- [Rust](https://rustup.rs/) (stable 1.77+)
- [Node.js](https://nodejs.org/) 18+
- A [Venice AI](https://venice.ai/) API key (free tier available)
- System libs (Linux): `webkit2gtk-4.1`, `libayatana-appindicator3-1`, `librsvg2`
- [Foundry](https://book.getfoundry.sh/) (for contracts)

### Quick Start

```bash
git clone https://github.com/forever8896/starchild.git
cd starchild

# Core app
npm install
npm run tauri dev

# Token site (separate terminal)
cd token && npm install && npm run dev

# Website (separate terminal)
cd website && npm install && npm run dev

# Contracts
cd contracts && forge build && forge test
```

---

## Code Conventions

### General

- Touch only what the task needs — no drive-by refactors or formatting changes
- Read the relevant module before making changes
- Run `npm run lint` and `npm run build` after every change before submitting

### Rust (src-tauri/)

- Trace frontend-backend IPC boundaries in `src-tauri/src/lib.rs` before adding new Tauri commands
- `cargo check` after IPC changes
- Keep the conversation arc intact: Arrive → Dig → Crystallize → Explore → Reframe → Quest → Release

### React / TypeScript (src/)

- React 19 with hooks and functional components
- Tailwind CSS 4 for styling (claymorphism system)
- Framer Motion for animation (spring physics: `{ type: 'spring', stiffness: 300, damping: 25 }`)
- Zustand for state management
- TypeScript strict — no `any` unless absolutely necessary

### Solidity (contracts/)

- Load the [ethskills](https://ethskills.com) skill before writing Solidity — it covers stale pricing data, security patterns, and current best practices
- Foundry for build and test
- Always use SafeERC20 for token transfers

### Next.js (website/ + token/)

- App Router
- Styling via Tailwind CSS 4 (no CSS modules)
- Framer Motion for page transitions
- viem for onchain reads/writes (token site)

---

## PR Workflow

1. **Fork and branch** — `git checkout -b feat/your-feature`
2. **Make changes** — one logical change per commit
3. **Test** — `npm run lint && npm run build` for frontend, `forge test` for contracts
4. **Commit** — use conventional commits:
   - `feat:` — new feature
   - `fix:` — bug fix
   - `docs:` — documentation
   - `refactor:` — code change that neither fixes nor adds
   - `hardening:` — security/reliability hardening
   - `test:` — adding tests
   - `chore:` — maintenance
5. **Push and PR** — target the `main` branch
6. **Describe** — what changed, why, and how to test

Your PR will be reviewed. Be responsive to feedback — good ideas can come from anywhere.

---

## Questions?

Reach out on [X / Twitter](https://x.com/KilianSolutions) or open a [discussion](https://github.com/forever8896/starchild/discussions).

Every contribution — code, token, word-of-mouth — makes Starchild stronger. Thank you.