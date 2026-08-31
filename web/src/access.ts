/**
 * Token-utility inference tier (PRD §6.2 · docs/inference-access-spec.md).
 *
 * The lock + claim lives on the commons site (token.starchild.software/access —
 * it already has the governance wallet infra), so the app stays walletless and
 * just LINKS there. The holder locks $STARCHILD, claims a minted Venice key, and
 * pastes it into Settings → Venice key (the BYOK slot). The app then talks to
 * Venice directly (E2EE); the mint backend is never in the conversation path.
 */
export const ACCESS_URL = 'https://token.starchild.software/access'
