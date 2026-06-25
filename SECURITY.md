# Security Policy

Starchild takes security and privacy seriously. The core thesis of the project is that **an AI companion that reasons over your most intimate thoughts must be private by design** — not by policy.

## Reporting a Vulnerability

If you discover a security vulnerability in the Starchild app, contracts, or infrastructure, please report it privately.

**Do not** open a public GitHub issue for security vulnerabilities.

### How to Report

- **Direct message** the founder on X: [@KilianSolutions](https://x.com/KilianSolutions)
- If you prefer email, open a GitHub issue asking for a secure contact method (we'll respond privately)

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Scope

The following are in scope:

- **Core app** (`src/`, `src-tauri/`) — data privacy, encryption, local storage integrity
- **Smart contracts** (`contracts/`) — fund safety, access control, economic attacks
- **API endpoints** (`token/src/app/api/`) — auth bypasses, data leaks
- **Website** (`website/`) — XSS, CSRF, dependency vulnerabilities

The following are **out of scope**:

- AI prompt injection in the companion app (it's a design feature, not a bug — the app is designed to converse freely)
- The Venice AI platform itself (report to Venice)
- Social engineering of the team
- Theoretical attacks requiring physical access to the user's machine

## Response

You'll receive an acknowledgment within 48 hours. We'll work with you to understand the issue and ship a fix.

## Bug Bounty

Starchild is a community-funded open-source project. At this time, we cannot offer financial bounties, but security researchers will be credited in release notes and acknowledged in the repo.

## Safe Harbor

We will not pursue legal action against researchers who:
- Follow this disclosure policy
- Do not access or destroy user data
- Act in good faith to improve the security of the ecosystem

Thank you for helping keep Starchild safe.