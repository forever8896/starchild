# Bankr skills

Skills that let [Bankr](https://bankr.bot) agents interact with the **commons** around Starchild — the token, the burns, the DAO. They live entirely in the public/token layer and **never touch the product**: the Starchild app stays private, local, free, and Bankr-free by design (the membrane).

## Skills

### [`starchild-dao`](./starchild-dao/) ✦
Read, stake, propose, and vote in the Starchild stake-to-govern DAO from inside Bankr. Gasless EIP-712 signature votes/proposals on Base, wired to the live endpoints at `token.starchild.software`. Public by design — no privacy to protect, so nothing to compromise.

**Install (Bankr agent):**
```
install the starchild-dao skill from https://github.com/forever8896/starchild/tree/main/bankr/starchild-dao
```

Then:
```
bankr prompt "using the starchild-dao skill, show me the proposals"
```
