# Starchild Burn Goals

Crowd-patronage of the Starchild commons by **burning $STARCHILD**.

Supporters burn $STARCHILD toward public funding goals. When a goal's target is
reached, the maintainer ships that work **free and open-source to everyone**.
Tokens are destroyed (sent to `0x…dEaD`), not collected — supply shrinks, the
commons grows, and the maintainer profits nothing from contributions.

## Why it's trustless

`contribute(goalId, amount)` calls `token.transferFrom(you → 0x…dEaD)`. Tokens go
**straight to the burn address**; the contract never custodies them, so neither the
maintainer nor the contract can withdraw, redirect, or rug contributed funds. The
only privileged actions are `addGoal` and `markShipped` — neither touches funds.

This lives entirely in the "commons" layer: the private Starchild companion app
never touches the token, a wallet, or this contract.

## Layout

- `src/StarchildBurnGoals.sol` — the contract
- `test/StarchildBurnGoals.t.sol` — Foundry tests (burn-to-dead, tallying, funded events, access control)
- `script/Deploy.s.sol` — deploy + seed starter goals

## Build & test

Requires [Foundry](https://book.getfoundry.sh/).

```bash
cd contracts
forge install foundry-rs/forge-std   # first time only
forge build
forge test -vvv
```

## Deploy to Base

$STARCHILD on Base: `0x980e9f2061487376ab1438e965ad276a1d36fba3`

```bash
export DEPLOYER_PRIVATE_KEY=0x...        # the maintainer wallet (pays gas)
forge script script/Deploy.s.sol \
  --rpc-url https://mainnet.base.org \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast --verify
```

After deploy, put the contract address into `website/src/lib/burnGoals.ts`
(`BURN_GOALS_ADDRESS`) so the goals page can read it.

## Supporter flow (handled by the website)

1. `approve(BurnGoals, amount)` on the $STARCHILD token
2. `contribute(goalId, amount)` — burns the tokens toward that goal

## Maintainer actions

- `addGoal(title, detail, target)` — open a new goal
- `markShipped(goalId)` — flag the work as delivered once it's live
