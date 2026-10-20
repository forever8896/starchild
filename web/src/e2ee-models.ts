/**
 * e2ee-models.ts — the Venice E2EE models Starchild may use, best first.
 *
 * Shared by the browser client (`e2ee.ts`), the trial proxy and attestation
 * relay (`api/`), and the dev proxy, so the allow-list can't drift. No imports:
 * the edge functions pull this in without the crypto libraries.
 *
 * Venice retires E2EE models every few months (GLM-4.7 went in Aug 2026), so
 * this is a ranked fallback list. Each entry speaks the v1 secp256k1 attestation
 * (flat `signing_public_key`) and pins the upstream model its attestation must
 * name. Ranked by measured time-to-first-token on 2026-10-20 (warm):
 *   qwen3-8-27b ≈ 2.6s · qwen3-6-35b-a3b ≈ 13–22s · deepseek-v4-flash ≈ 50s.
 * GLM-5.3-flash (≈50–110s) and the `aci/1`-shaped models are deliberately absent.
 * Keep in sync with `E2EE_MODELS` in `src-tauri/core/src/ai.rs`.
 */
export const E2EE_MODELS: readonly { id: string; upstream: string }[] = [
  { id: 'e2ee-qwen3-8-27b', upstream: 'Qwen/Qwen3.8-27B' },
  { id: 'e2ee-qwen3-6-35b-a3b', upstream: 'Qwen/Qwen3.6-35B-A3B-FP8' },
  { id: 'e2ee-deepseek-v4-flash', upstream: 'deepseek-ai/DeepSeek-V4-Flash' },
]

/** The preferred E2EE model. */
export const E2EE_MODEL = E2EE_MODELS[0].id

export function isAllowedE2eeModel(id: unknown): id is string {
  return typeof id === 'string' && E2EE_MODELS.some((m) => m.id === id)
}
