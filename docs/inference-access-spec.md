# Starchild Inference Access — Technical Spec

> **Lock $STARCHILD → get a funded, private Starchild inference key.**
> The token's first real *product* utility. Status: lock contract built (PR #21); the rest specced below.

---

## 1. Summary

The Starchild app needs a Venice API key to run. That key is a real barrier (signup, cost, friction). This feature lets a holder **lock $STARCHILD for a duration** and, in return, receive a **Venice inference key minted by us** — capped, scoped, and expiring with their lock. They paste it into the app's existing Venice-key field and use Starchild for free.

The app stays **free for everyone** with their own key — this is an *external access option*, not a gate. Funded by ETH fees (no token-selling). It is the concrete form of the **"Community E2EE inference pool"** founding proposal.

## 2. Principles & guardrails (non-negotiable)

- **The product is never gated.** Anyone can use the full app for free with their own Venice key. The locked path is a *funded convenience*, never a better/premium tier. Someone who never touches crypto loses nothing essential.
- **Privacy is preserved.** Conversations stay **client ↔ Venice E2EE**. We never proxy or see inference content.
- **No token-selling.** The pool is funded by ETH fees (rule #2 intact).
- **Locking never costs your vote.** Governance weight = `balanceOf + lockedOf`.
- **The product app changes ~nothing.** The whole feature lives in the commons (contract + backend); the app just receives a Venice key like always. The membrane holds.

## 3. How it works (end to end)

```
                         commons layer (token.starchild.software)                         product
 ┌──────────┐   1.lock    ┌───────────────┐                                          ┌──────────────┐
 │  holder  │────────────▶│ StarchildLock │ (Base, on-chain)                          │ Starchild app │
 │  wallet  │             └───────────────┘                                          │   (local)     │
 └────┬─────┘                    ▲                                                    └──────┬───────┘
      │ 2. sign "claim access"   │ lockInfo(wallet)                                          │
      ▼                          │                                                          │
 ┌─────────────────────────────────────────┐   4. Venice key (capped+expiring)              │
 │  /api/access/claim  (key-mint backend)   │───────────────────────────────────────────────▶ paste into
 │  - verify signature                      │                                                  the Venice-
 │  - read lockInfo on-chain                │   5. app uses it DIRECTLY with Venice (E2EE)      key field
 │  - mint Venice key via ADMIN key  ───────┼──────────────▶  ┌────────────┐  ◀───────────────────┘
 │  - store {wallet→keyId} in Upstash       │                 │  Venice    │   E2EE, local↔TEE,
 └─────────────────────────────────────────┘                 │  (TEE)     │   backend NOT in path
                                                              └────────────┘
```

1. **Lock** — holder calls `StarchildLock.lock(amount, duration)` (on `token.starchild.software/access`). Tokens locked; `unlockAt = now + duration`.
2. **Claim** — holder signs an EIP-712 `ClaimAccess` message (proves wallet ownership).
3. **Mint** — the backend reads `lockInfo(wallet)` on-chain, computes the cap from the amount, and uses the **Venice admin key** to mint an **inference key** with `expiresAt = unlockAt` and a per-epoch (daily) consumption cap.
4. **Receive** — backend returns the minted Venice key as the holder's "Starchild access key."
5. **Use** — holder pastes it into the app's existing Venice-key field. The app talks to **Venice directly, E2EE** — our backend is never in the conversation path.
6. **Expiry** — the key auto-expires at `unlockAt` (which is also exactly when the lock becomes withdrawable). To renew: extend the lock and re-claim.

## 4. Components

### 4.1 `StarchildLock` contract — ✅ built (PR #21)
Ownerless, never burns, no drain path, 7/7 tests. `lock(amount,duration)` (top-up + extend), `withdraw()` (after expiry), `lockedOf(addr)`, `lockInfo(addr) → (amount, unlockAt)`. **To do:** deploy + verify on Base, then **proactively report to Blockaid** (the lock tx is the only Blockaid surface; voting stays gasless).

### 4.2 Governance weight change
`weightOf(addr)` becomes `token.balanceOf(addr) + StarchildLock.lockedOf(addr)`. Summed so locking never disenfranchises. Wire once the lock is deployed (needs its address). Read-only; gasless voting unaffected.

### 4.3 Key-mint backend (new) — lives in `token/src/app/api/access/*`
Reuses the token site's existing infra (Next.js API routes, viem, Upstash).

**`POST /api/access/claim`**
1. Body `{ wallet, nonce, signature }`. Verify the EIP-712 `ClaimAccess` signature → recovers `wallet`.
2. Read `StarchildLock.lockInfo(wallet)` → `(amount, unlockAt)`. Require `amount ≥ MIN_LOCK` and `unlockAt > now`.
3. `dailyCapUsd = capMapping(amount)` (§4.5).
4. Idempotency: look up `access:key:<wallet>` in Upstash. If a key exists for the *same* `(amount, unlockAt)` → return it. If the lock changed → **revoke the old** Venice key (`DELETE /api_keys/{id}`) and mint a new one.
5. Mint via **admin key**: `POST https://api.venice.ai/api/v1/api_keys` with
   `{ apiKeyType: "INFERENCE", description: "starchild-access:<wallet>", expiresAt: <unlockAt ISO>, consumptionLimits: { usd: dailyCapUsd } }`
   *(verify exact field names against [Venice's create-key docs](https://docs.venice.ai/api-reference/endpoint/api_keys/create) at build time.)*
6. Store `access:key:<wallet> → { keyId, keyString, amount, unlockAt, createdAt }`.
7. Return `{ key, expiresAt, dailyCapUsd }`.

**`GET /api/access/status?wallet=`** — returns the current lock + whether a key is issued (for the UI).

### 4.4 The app (product) — ~zero changes
The minted key **is** a Venice key, so the existing field already works — paste and go. **No product-repo change is required.** *(Optional, later: a small UX touch — "Have a Starchild access key? Get one →" linking to `token.starchild.software/access". That's a nice-to-have, not a dependency.)* This is what keeps the membrane perfectly intact.

### 4.5 Cap mapping (`capMapping(amount) → usd/day`)
Daily epoch (Venice resets at 00:00 UTC). Models are cheap, so caps stretch far. Starting tiers (DAO-tunable, stored as config/env):

| Locked | Daily cap | Roughly |
|---|---|---|
| ≥ 10,000,000 $STARCHILD | $0.25/day | hundreds of GLM-4.7 messages |
| ≥ 50,000,000 | $1.00/day | heavy daily use |
| ≥ 200,000,000 | $4.00/day | power user |

`expiresAt = unlockAt`.

### 4.6 Funding (treasury → Venice balance)
ETH fees → topped up to the **pool's Venice USD balance**. Keep `Σ(active daily caps) ≤ Venice balance` with a safety buffer; monitor and top up. Manual to start; automatable later (fees → swap → deposit).

## 5. Privacy & security model

**Privacy.** Conversations are E2EE between the local app and Venice's TEE; the minted key only *authorizes/bills*. The backend sees a **claim** (wallet X locked → key issued), never inference content or sessions — and the lock itself is already public on-chain. So the only new metadata is "this wallet claimed access," which is minimal and disclosed.

**Security.**
- **Admin key** = the one new high-value secret. Compromise → attacker could mint keys or mint a huge-cap key and drain the Venice balance. Mitigations: server-only env (Vercel), never logged, rotatable, anomaly-monitored — and **recommended: a separate Venice account/sub-org for the pool with a bounded balance**, so the worst-case blast radius is that pool balance, not your whole Venice account.
- **Minted keys** are capped (daily) + expiring → a leaked key self-limits and dies at `unlockAt`. Abuse control lives **at the key**, not in-app.
- **Claim auth** — the EIP-712 signature proves wallet ownership; you can't claim someone else's lock.
- **Aggregate** — keep the Venice balance ahead of total issued caps; monitor for spend anomalies.

## 6. Lifecycle & edge cases

- **Top-up / extend** → re-claim → revoke old key + mint new with the updated cap/expiry.
- **Withdraw** is only possible *after* `unlockAt` — by which point the key has **already expired**. So there's no "withdrew but still has a live key" race. The lock duration *is* the access duration. (Elegant, and free.)
- **Lock expired, not withdrawn** → key already expired (no access), but tokens still count for voting (`lockedOf > 0`). Regain access by extending + re-claiming.
- **Repeat claims** → idempotent (return existing if unchanged).
- **Venice balance exhausted** → inference starts failing at Venice; monitoring + top-up prevents. Existing keys also stop at their own daily cap.

## 7. Data model (Upstash)
```
access:key:<wallet>  →  { keyId, keyString, amount, unlockAt, createdAt }
access:nonce:<wallet> →  last used claim nonce (replay protection)
```
On-chain is the source of truth for the lock; Upstash only tracks issued keys (for idempotency + revoke).

## 8. Open decisions (need a call)
1. **Key model:** (a) *recommended* — mint a real, scoped Venice key the user pastes directly (zero app change); vs (b) a custom `sk_starchild_…` token the app exchanges per-session for tighter control (adds an app↔backend dependency). **→ go (a)** unless we want per-session revocation.
2. **Cap tiers** (§4.5) — starting numbers; ratify via DAO.
3. **Min lock amount + min/max duration.**
4. **Separate bounded Venice pool account?** (recommended for blast-radius control.)
5. **Revoke-and-remint vs update-key on re-claim** — depends on whether Venice supports updating a key's limits/expiry.

## 9. Build sequence
1. Deploy + verify `StarchildLock` on Base → report to Blockaid proactively.
2. Wire governance `weightOf = balanceOf + lockedOf`.
3. Build `/api/access/claim` + `capMapping` + Upstash state *(needs the admin key)*.
4. Build the `token.starchild.software/access` page: lock UI + "claim key" flow.
5. *(Optional)* tiny app UX link.
6. DAO proposal to ratify the cap mapping / parameters.

## 10. Needed from the founder
- **A Venice ADMIN key** (ideally on a *separate, bounded* Venice pool account) — the one true blocker; only you can generate it. Stored server-side only.
- **Go-ahead to deploy** `StarchildLock`.
- **Decisions** on §8: cap tiers, min lock/duration, the separate-account question.
