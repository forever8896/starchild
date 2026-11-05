# $STARCHILD: the commons

This is the funding and governance layer around [Starchild](../README.md), the app. It lives on its own site,
[token.starchild.software](https://token.starchild.software), and stays separate from the product.

> **The membrane:** the app never touches the token, a wallet, or any blockchain, and nothing in it is token-gated.
> The commons (token, DAO, burns) lives on the token site. The two coexist but never cross.

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

**Spec:** [`docs/inference-access-spec.md`](../docs/inference-access-spec.md)

---

## Bankr Skill

The [`starchild-dao`](../bankr/starchild-dao/) Bankr skill lets any Bankr agent read proposals, check voting weight, vote, and propose — all from inside Bankr. Installed via:

```
install the starchild-dao skill from https://github.com/forever8896/starchild/tree/main/bankr/starchild-dao
```

---

## Development

```bash
# Token site (Next.js)
cd token && npm install && npm run dev   # http://localhost:3000

# Contracts (Foundry)
cd contracts && forge build && forge test -vvv
```

| Path | What |
|------|------|
| [`token/`](.) | This site: pages, API routes, governance (`src/lib/governance.ts`) |
| [`contracts/`](../contracts/) | `StarchildLock.sol` (lock for inference access); `StarchildBurnGoals.sol` and `StarchildStaking.sol` are retired |
| [`bankr/starchild-dao/`](../bankr/starchild-dao/) | Bankr skill for DAO governance |
