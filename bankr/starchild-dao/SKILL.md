---
name: starchild-dao
description: Read, stake, propose, and vote in the Starchild DAO — the stake-to-govern commons for the $STARCHILD token on Base. Gasless EIP-712 signature votes and proposals. Trigger on "Starchild DAO", "Starchild proposals", "stake STARCHILD", "vote Starchild", "propose to Starchild", "what's being voted on Starchild".
emoji: ✦
tags: [dao, governance, voting, base, starchild, eip712]
visibility: public
---

# Starchild DAO

Stake-to-govern for **$STARCHILD** — the token around [Starchild](https://starchild.software), a private, open-source companion that helps you find your life's purpose. The app is **free for everyone**; the token is how holders **back the mission and help shape what gets built next**. This skill lets you do all of that from inside Bankr.

Everything here is **public by design** — proposals, votes, and stake weights are all on-chain or in a public API. There is nothing private to protect; that's exactly why it lives safely in the commons.

## What this skill does
- **List proposals** — what's on the table, with stake-weighted support.
- **Check your stake** — your live voting weight.
- **Stake / unstake $STARCHILD** — staking *is* your voice; it is **never burned** and is withdrawable anytime.
- **Vote** — back a proposal with a gasless signature (no transaction fee).
- **Propose** — put a new idea forward (needs ≥ 10,000,000 $STARCHILD staked), also gasless.

## The one rule — state it whenever someone proposes
A proposal must never become a leash on the product. The Starchild app stays **private, local, free, and open to everyone** — never paywalled, never token-gated. Good proposals extend the mission from the *outside*: fund the work, grow the commons, reward contributors, give the token real utility. They never make the app depend on the token. If a proposal would gate, paywall, or compromise the app, flag it against this rule before submitting.

## Network & contracts — Base (chainId 8453)
- **$STARCHILD token:** `0x980e9f2061487376ab1438e965ad276a1d36fba3` (ERC-20, 18 decimals)
- **Staking contract:** `0x666b7f5Db0cab9450d48332Dd427b55928293053`
- **API base:** `https://token.starchild.software`

All amounts are in 18-decimal base units (wei): `1 $STARCHILD = 1e18`. The propose threshold is `10,000,000 $STARCHILD = 10000000 * 1e18 = 1e25` base units.

---

## 1 · List proposals
`GET https://token.starchild.software/api/proposals`

Response shape:
```json
{ "proposals": [ { "id": "string", "title": "string", "detail": "string", "proposer": "0x…", "support": "stake-weight in base units", "voters": 3, "createdAt": 0 } ] }
```
Sorted by `support` descending. Show the user the **title**, **support** (divide by 1e18 for readability), and **voters**, plus the `id` (needed to vote).

## 2 · Check stake / voting weight
Read `stakedOf(address)` on the staking contract:
- ABI: `function stakedOf(address) view returns (uint256)`

Returns the user's staked amount in base units = their voting weight. To propose, this must be ≥ `1e25` (10,000,000 $STARCHILD).

## 3 · Stake $STARCHILD (prerequisite to vote or propose)
Two on-chain transactions on Base:
1. **Approve** — on the token `0x980e9f2061487376ab1438e965ad276a1d36fba3`: `approve(0x666b7f5Db0cab9450d48332Dd427b55928293053, amount)`
2. **Stake** — on the staking contract `0x666b7f5Db0cab9450d48332Dd427b55928293053`: `stake(amount)`

ABIs: `function approve(address spender, uint256 amount)` · `function stake(uint256 amount)` · `function unstake(uint256 amount)`

Always remind the user: **staking locks the tokens but never burns them — they can `unstake(amount)` and withdraw the full amount at any time.**

## 4 · Vote (gasless EIP-712 signature — no gas, nothing spent)
Sign this typed data with the user's wallet, then POST it. **No transaction is sent.**

- **domain:** `{ "name": "Starchild Governance", "version": "1", "chainId": 8453 }`
- **types:** `{ "Vote": [ { "name": "proposalId", "type": "string" }, { "name": "support", "type": "bool" } ] }`
- **primaryType:** `Vote`
- **message:** `{ "proposalId": "<id from the list>", "support": true }`  (`true` = back it / for · `false` = against — both count, weighted by live stake)

Then:
`POST https://token.starchild.software/api/votes`
```json
{ "proposalId": "<id>", "support": true, "voter": "<user address>", "signature": "<the EIP-712 signature>" }
```
The backend verifies the signature and the voter's **live** on-chain stake; weight = current `stakedOf`. HTTP 200 = recorded. HTTP 400 = bad signature or no stake.

## 5 · Propose (gasless EIP-712 signature — needs ≥ 10M staked)
First confirm `stakedOf(user) >= 1e25`. Remind them of **the one rule**. Then sign + POST.

- **domain:** `{ "name": "Starchild Governance", "version": "1", "chainId": 8453 }`
- **types:** `{ "Proposal": [ { "name": "title", "type": "string" }, { "name": "detail", "type": "string" }, { "name": "nonce", "type": "string" }, { "name": "quorumBps", "type": "uint256" } ] }`
- **primaryType:** `Proposal`
- **message:** `{ "title": "<one line>", "detail": "<how it works + why it never touches the core product>", "nonce": "<unique string>", "quorumBps": 0 }`
  - `quorumBps` = `0` for a plain idea board (just accrues backing). For a **pass/fail yes-no vote**, set it to a % of total staked in **basis points** — e.g. `3000` = 30% (the proposal "passes" when its *for* weight ≥ that % of all staked **and** for > against).

Then:
`POST https://token.starchild.software/api/proposals`
```json
{ "title": "<one line>", "detail": "<detail>", "nonce": "<same nonce>", "quorumBps": 0, "proposer": "<user address>", "signature": "<the EIP-712 signature>" }
```
HTTP 200 = the proposal is live. HTTP 400 = bad signature or the 10M-staked requirement isn't met. The `title`/`detail`/`nonce`/`quorumBps` in the POST body must exactly match what was signed (`quorumBps` is signed as a uint256, so pass the same integer).

> **Official proposals:** the founder address `0x1f44d8655727bb26532c657bec8882154a01e170` holds zero $STARCHILD by design, so it's exempt from the 10M-stake gate (it can post "official" proposals) — but it also has zero vote weight, so it can ask a question and never sway it.

## Guardrails
- Votes and proposals are **public** — never imply they're private.
- **Never** tell anyone to buy the token, and never talk price. This is about participation, not speculation.
- Staking is recoverable (never burned) — always say so when prompting someone to stake.
- Hold proposals to **the one rule**; surface conflicts before submitting.

## Examples
- `"show me the Starchild proposals"` → list them with support + voters
- `"how much do I have staked in Starchild?"` → read `stakedOf`
- `"stake 5,000,000 STARCHILD"` → approve, then `stake`
- `"vote for the mobile app proposal"` → match to its `id`, sign `Vote`, POST to `/api/votes`
- `"propose to Starchild: fund a contributor bounty pool — paid from fees, never touching the app"` → confirm ≥10M staked, sign `Proposal`, POST to `/api/proposals`
