/**
 * Achievement Attestation system for Starchild.
 *
 * Mints on-chain attestations by storing achievement proof as metadata
 * on the Starchild's ERC-8004 identity token. Each attestation is a
 * metadata entry with key "achievement:<type>" and value containing
 * an opaque timestamp proof (no personal data on-chain).
 */

import { invoke } from '@tauri-apps/api/core'
import { toHex } from 'viem'
import { IDENTITY_REGISTRY_ADDRESS, IDENTITY_REGISTRY_ABI } from './abi'
import { getWalletClient, getPublicClient } from './wallet'

/** Milestone definitions with human-readable labels */
export const MILESTONES: Record<string, { label: string; description: string }> = {
  '7_day_streak':   { label: '7-Day Streak',   description: 'Completed a quest for 7 days in a row' },
  '30_day_streak':  { label: '30-Day Streak',  description: 'Completed a quest for 30 days in a row' },
  '100_day_streak': { label: '100-Day Streak', description: 'Completed a quest for 100 days in a row' },
}

export interface Attestation {
  id: string
  achievement_type: string
  tx_hash: string | null
  status: 'pending' | 'confirmed' | 'error'
  metadata: string | null
  created_at: string
}

/**
 * Mint an achievement attestation on-chain.
 *
 * Calls setMetadata on the ERC-8004 Identity Registry to store
 * an opaque proof (achievement type + timestamp) on the agent's token.
 */
export async function mintAttestation(
  achievementType: string,
): Promise<{ txHash: string; attestationId: string }> {
  // Get the agent ID from settings
  const agentId = await invoke<string | null>('get_setting', { key: 'starchild_agent_id' })
  if (!agentId) {
    throw new Error('No registered identity. Register your Starchild identity first.')
  }

  // Build opaque proof payload (no personal data)
  const proof = {
    type: achievementType,
    ts: Math.floor(Date.now() / 1000),
    v: 1,
  }
  const proofBytes = toHex(new TextEncoder().encode(JSON.stringify(proof)))

  // Metadata key: "achievement:<type>"
  const metadataKey = `achievement:${achievementType}`

  // Save as pending in local DB
  const attestationId = crypto.randomUUID()
  await invoke('save_attestation', {
    request: {
      id: attestationId,
      achievement_type: achievementType,
      tx_hash: null,
      status: 'pending',
      metadata: JSON.stringify(proof),
    },
  })

  try {
    const walletClient = await getWalletClient()
    const publicClient = getPublicClient()

    // Call setMetadata on the ERC-8004 contract
    const txHash = await walletClient.writeContract({
      address: IDENTITY_REGISTRY_ADDRESS,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'setMetadata',
      args: [(() => { try { return BigInt(agentId) } catch { throw new Error(`Invalid agent ID: "${agentId}" is not a valid number`) } })(), metadataKey, proofBytes],
    })

    // Update with tx hash
    await invoke('save_attestation', {
      request: {
        id: attestationId,
        achievement_type: achievementType,
        tx_hash: txHash,
        status: 'pending',
        metadata: JSON.stringify(proof),
      },
    })

    // Wait for confirmation (120s timeout to avoid indefinite hang)
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 })

    if (receipt.status === 'success') {
      await invoke('save_attestation', {
        request: {
          id: attestationId,
          achievement_type: achievementType,
          tx_hash: txHash,
          status: 'confirmed',
          metadata: JSON.stringify(proof),
        },
      })
    } else {
      await invoke('save_attestation', {
        request: {
          id: attestationId,
          achievement_type: achievementType,
          tx_hash: txHash,
          status: 'error',
          metadata: JSON.stringify(proof),
        },
      })
      throw new Error('Transaction reverted')
    }

    return { txHash, attestationId }
  } catch (err) {
    // Update status to error
    await invoke('save_attestation', {
      request: {
        id: attestationId,
        achievement_type: achievementType,
        tx_hash: null,
        status: 'error',
        metadata: JSON.stringify({ ...proof, error: err instanceof Error ? err.message : String(err) }),
      },
    })
    throw err
  }
}

/** Get all attestations from local DB */
export async function getAttestations(): Promise<Attestation[]> {
  return invoke<Attestation[]>('get_attestations')
}
