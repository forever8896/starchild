/**
 * Hypercert impact certificate minting for Starchild.
 *
 * Allows users to publish AI-verified impact certificates on-chain.
 * The Starchild's ERC-8004 identity is embedded in the certificate
 * as the verifying agent.
 *
 * On first mint, the Starchild auto-registers its ERC-8004 identity
 * via the relay (project-sponsored, user needs no ETH). This is the
 * Starchild's "birth certificate" — it becomes a named on-chain entity
 * so it can put its reputation behind verified impact claims.
 *
 * Chain: Base Sepolia (testnet) for hypercerts
 * Chain: Base Mainnet for ERC-8004 identity
 */

import { invoke } from '@tauri-apps/api/core'

const RELAY_URL = 'https://starchild-relay.starchild.workers.dev'

export interface HypercertDraft {
  title: string
  description: string
  impact: string
  timeframe_start: string
  timeframe_end: string
}

export interface HypercertResult {
  tx_hash: string
  chain: string
  contract: string
  metadata_uri: string
}

/**
 * Ensure the Starchild has an ERC-8004 identity on Base Mainnet.
 * If not registered, registers via the relay (project wallet pays gas).
 * Returns the agent ID.
 */
async function ensureIdentity(): Promise<string> {
  const existing = await invoke<string | null>('get_setting', { key: 'starchild_agent_id' })
  if (existing) return existing

  // Get the Starchild's name from settings (set during onboarding)
  const name = await invoke<string | null>('get_setting', { key: 'starchild_name' }) || 'Starchild'

  const relayUrl = import.meta.env.VITE_RELAY_URL || RELAY_URL
  const response = await fetch(`${relayUrl}/register-identity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ starchild_name: name }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(`Identity registration failed: ${(err as { error: string }).error}`)
  }

  const result = await response.json() as { tx_hash: string; agent_id: string | null; name: string }

  if (!result.agent_id) {
    throw new Error('Identity registered but no agent ID returned')
  }

  // Save identity info locally
  await invoke('save_settings', { key: 'starchild_agent_id', value: result.agent_id })
  await invoke('save_settings', { key: 'starchild_registration_tx', value: result.tx_hash })
  await invoke('save_settings', { key: 'starchild_registration_status', value: 'registered' })

  return result.agent_id
}

/**
 * Mint a verified impact certificate as a hypercert via the relay.
 *
 * If the Starchild doesn't have an ERC-8004 identity yet, it registers
 * one first (the Starchild's "birth into the world"). Then mints the
 * hypercert with the agent ID embedded as the verifying agent.
 *
 * The relay handles all transactions — user needs no ETH.
 */
/**
 * Transfer the Starchild's ERC-8004 identity from the project wallet
 * to the user's own wallet. After this, the user fully owns their
 * Starchild's on-chain identity.
 *
 * This is a one-way operation — once transferred, the project wallet
 * can no longer manage or update the identity.
 */
export async function claimIdentity(): Promise<{ txHash: string; agentId: string }> {
  const agentId = await invoke<string | null>('get_setting', { key: 'starchild_agent_id' })
  if (!agentId) {
    throw new Error('No registered identity to claim. Publish an impact certificate first.')
  }

  const walletAddress = await invoke<string | null>('get_setting', { key: 'wallet_address' })
  if (!walletAddress) {
    throw new Error('No wallet address set. Enter your wallet address in Settings first.')
  }

  const relayUrl = import.meta.env.VITE_RELAY_URL || RELAY_URL
  const response = await fetch(`${relayUrl}/transfer-identity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_id: agentId,
      to_address: walletAddress,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(`Transfer failed: ${(err as { error: string }).error}`)
  }

  const result = await response.json() as { tx_hash: string; agent_id: string }

  // Update local status to reflect user ownership
  await invoke('save_settings', { key: 'starchild_identity_owner', value: 'user' })

  return { txHash: result.tx_hash, agentId }
}

/**
 * Mint a verified impact certificate as a hypercert via the relay.
 *
 * If the Starchild doesn't have an ERC-8004 identity yet, it registers
 * one first (the Starchild's "birth into the world"). Then mints the
 * hypercert with the agent ID embedded as the verifying agent.
 *
 * The relay handles all transactions — user needs no ETH.
 */
export async function mintHypercert(draft: HypercertDraft): Promise<HypercertResult> {
  // Step 1: Ensure the Starchild has an on-chain identity
  const agentId = await ensureIdentity()
  const verifyingAgentId = `erc8004:${agentId}@base`

  // Step 2: Get user context
  const walletAddress = await invoke<string | null>('get_setting', { key: 'wallet_address' })
  const userHash = await invoke<string | null>('get_setting', { key: 'verification_secret_hash' })

  // Step 3: Mint the hypercert via relay
  const relayUrl = import.meta.env.VITE_RELAY_URL || RELAY_URL
  const response = await fetch(`${relayUrl}/mint-hypercert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: draft.title,
      description: draft.description,
      work_scope: [draft.impact, 'personal-growth'],
      impact_scope: [draft.impact],
      timeframe_start: draft.timeframe_start,
      timeframe_end: draft.timeframe_end,
      contributors: walletAddress ? [walletAddress] : ['anonymous'],
      verifying_agent_id: verifyingAgentId,
      user_hash: userHash || '0x0',
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error((err as { error: string }).error || `Relay returned ${response.status}`)
  }

  const result = await response.json() as HypercertResult

  // Step 4: Save as attestation locally
  const attestationId = crypto.randomUUID()
  await invoke('save_attestation', {
    request: {
      id: attestationId,
      achievement_type: 'hypercert',
      tx_hash: result.tx_hash,
      status: 'confirmed',
      metadata: JSON.stringify({
        title: draft.title,
        description: draft.description,
        impact: draft.impact,
        timeframe_start: draft.timeframe_start,
        timeframe_end: draft.timeframe_end,
        chain: result.chain,
        contract: result.contract,
        verifying_agent_id: verifyingAgentId,
      }),
    },
  })

  return result
}
