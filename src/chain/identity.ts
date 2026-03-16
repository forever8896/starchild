/**
 * ERC-8004 Identity Registration for Starchild.
 *
 * Handles registering a Starchild agent identity on Base Mainnet,
 * checking registration status, and reading identity data.
 */

import { invoke } from '@tauri-apps/api/core'
import { toHex, decodeEventLog } from 'viem'
import { IDENTITY_REGISTRY_ADDRESS, IDENTITY_REGISTRY_ABI } from './abi'
import { getWalletClient, getPublicClient, getWalletAddress } from './wallet'

const AGENT_ID_SETTING = 'starchild_agent_id'
const REGISTRATION_TX_SETTING = 'starchild_registration_tx'
const REGISTRATION_STATUS_SETTING = 'starchild_registration_status'

const VALID_STATUSES = ['none', 'pending', 'confirmed', 'registered', 'error'] as const
export type RegistrationStatus = (typeof VALID_STATUSES)[number]

export interface IdentityInfo {
  status: RegistrationStatus
  agentId: string | null
  walletAddress: string | null
  txHash: string | null
  error?: string
}

/** Validate and sanitize a status string from storage */
function parseStatus(raw: string | null): RegistrationStatus {
  if (raw && (VALID_STATUSES as readonly string[]).includes(raw)) {
    return raw as RegistrationStatus
  }
  return 'none'
}

/** Validate starchild name: 1-256 chars, basic text only */
function validateName(name: string): string {
  const trimmed = (name || 'Starchild').trim()
  if (trimmed.length === 0) return 'Starchild'
  if (trimmed.length > 256) {
    return trimmed.slice(0, 256)
  }
  // Allow alphanumeric, spaces, basic punctuation
  const sanitized = trimmed.replace(/[^\w\s\-_.!?'"()]/g, '')
  return sanitized || 'Starchild'
}

/** Build a data-URI registration file for the Starchild agent */
function buildRegistrationURI(name: string): string {
  const registration = {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: name,
    description: 'An AI companion that grows with you. Built on Venice AI.',
    image: '',
    services: [],
    active: true,
    x402Support: false,
    registrations: [],
    supportedTrust: [],
  }
  const json = JSON.stringify(registration)
  const b64 = btoa(json)
  return `data:application/json;base64,${b64}`
}

/** Extract agentId from transaction logs using type-safe event decoding */
function extractAgentIdFromLogs(logs: readonly { address: string; topics: readonly string[]; data: string }[]): string | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== IDENTITY_REGISTRY_ADDRESS.toLowerCase()) continue
    try {
      const decoded = decodeEventLog({
        abi: IDENTITY_REGISTRY_ABI,
        data: log.data as `0x${string}`,
        topics: log.topics as [signature: `0x${string}`, ...args: `0x${string}`[]],
      })
      if (decoded.eventName === 'Registered' && 'agentId' in decoded.args) {
        return (decoded.args.agentId as bigint).toString()
      }
    } catch {
      // Not a matching event, continue
    }
  }
  return null
}

/** Get current identity registration info from local settings */
export async function getIdentityInfo(): Promise<IdentityInfo> {
  const [status, agentId, walletAddress, txHash] = await Promise.all([
    invoke<string | null>('get_setting', { key: REGISTRATION_STATUS_SETTING }),
    invoke<string | null>('get_setting', { key: AGENT_ID_SETTING }),
    getWalletAddress(),
    invoke<string | null>('get_setting', { key: REGISTRATION_TX_SETTING }),
  ])

  return {
    status: parseStatus(status),
    agentId,
    walletAddress,
    txHash,
  }
}

/** Register a new ERC-8004 identity on Base Mainnet */
export async function registerIdentity(starchildName: string): Promise<IdentityInfo> {
  const validName = validateName(starchildName)

  // Update status to pending
  await invoke('save_settings', { key: REGISTRATION_STATUS_SETTING, value: 'pending' })

  try {
    const walletClient = await getWalletClient()
    const publicClient = getPublicClient()

    // Build the agent URI (data URI with registration JSON)
    const agentURI = buildRegistrationURI(validName)

    // Encode metadata: store the starchild name
    const nameBytes = toHex(new TextEncoder().encode(validName))
    const metadata = [{ metadataKey: 'name', metadataValue: nameBytes }]

    // Send the registration transaction
    const txHash = await walletClient.writeContract({
      address: IDENTITY_REGISTRY_ADDRESS,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'register',
      args: [agentURI, metadata],
    })

    // Save tx hash
    await invoke('save_settings', { key: REGISTRATION_TX_SETTING, value: txHash })

    // Wait for confirmation with 2-minute timeout
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 120_000,
    })

    if (receipt.status === 'success') {
      const agentId = extractAgentIdFromLogs(receipt.logs)

      if (!agentId) {
        console.error('Registration tx succeeded but no Registered event found in logs')
      }

      if (agentId) {
        await invoke('save_settings', { key: AGENT_ID_SETTING, value: agentId })
      }
      await invoke('save_settings', { key: REGISTRATION_STATUS_SETTING, value: 'registered' })

      return {
        status: 'registered',
        agentId,
        walletAddress: walletClient.account.address,
        txHash,
      }
    } else {
      await invoke('save_settings', { key: REGISTRATION_STATUS_SETTING, value: 'error' })
      return {
        status: 'error',
        agentId: null,
        walletAddress: walletClient.account.address,
        txHash,
        error: 'Transaction reverted',
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    await invoke('save_settings', { key: REGISTRATION_STATUS_SETTING, value: 'error' })
    return {
      status: 'error',
      agentId: null,
      walletAddress: await getWalletAddress(),
      txHash: null,
      error: errorMsg,
    }
  }
}

/** Check if an existing registration tx has been confirmed */
export async function checkRegistrationStatus(): Promise<IdentityInfo> {
  const info = await getIdentityInfo()

  if (info.status === 'pending' && info.txHash) {
    try {
      const publicClient = getPublicClient()
      const receipt = await publicClient.getTransactionReceipt({ hash: info.txHash as `0x${string}` })

      if (receipt) {
        if (receipt.status === 'success') {
          let agentId = info.agentId
          if (!agentId) {
            agentId = extractAgentIdFromLogs(receipt.logs)
            if (agentId) {
              await invoke('save_settings', { key: AGENT_ID_SETTING, value: agentId })
            }
          }
          await invoke('save_settings', { key: REGISTRATION_STATUS_SETTING, value: 'registered' })
          return { ...info, status: 'registered', agentId }
        } else {
          await invoke('save_settings', { key: REGISTRATION_STATUS_SETTING, value: 'error' })
          return { ...info, status: 'error', error: 'Transaction reverted' }
        }
      }
    } catch {
      // Tx not found yet — still pending
    }
  }

  return info
}
