/**
 * Starchild Attestation Relay — Cloudflare Worker
 *
 * Signs and submits EAS attestations on Base Mainnet on behalf of
 * Starchild desktop app users. Users need no wallet or ETH.
 *
 * POST /attest
 *   Body: { user_hash, journey_root, quest_count, streak }
 *   Returns: { tx_hash } or { error }
 *
 * Secret: ATTESTER_PRIVATE_KEY (set via wrangler secret)
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  encodeFunctionData,
  encodeAbiParameters,
  parseAbiParameters,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'

// ─── Constants ──────────────────────────────────────────────────────────────

// EAS contract on Base L2
const EAS_ADDRESS = '0x4200000000000000000000000000000000000021' as const

// TODO: Replace with real schema UID after registering on https://base.easscan.org
// Schema: "bytes32 userHash, bytes32 journeyRoot, uint64 questCount, uint64 currentStreak"
const SCHEMA_UID = '0x0000000000000000000000000000000000000000000000000000000000000000' as const

const BASE_RPC = 'https://mainnet.base.org'

// EAS attest function ABI (minimal)
const EAS_ABI = [
  {
    type: 'function',
    name: 'attest',
    inputs: [
      {
        name: 'request',
        type: 'tuple',
        components: [
          { name: 'schema', type: 'bytes32' },
          {
            name: 'data',
            type: 'tuple',
            components: [
              { name: 'recipient', type: 'address' },
              { name: 'expirationTime', type: 'uint64' },
              { name: 'revocable', type: 'bool' },
              { name: 'refUID', type: 'bytes32' },
              { name: 'data', type: 'bytes' },
              { name: 'value', type: 'uint256' },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'payable',
  },
] as const

// ─── Types ──────────────────────────────────────────────────────────────────

interface Env {
  ATTESTER_PRIVATE_KEY: string
}

interface AttestRequest {
  user_hash: string
  journey_root: string
  quest_count: number
  streak: number
}

// ─── Validation ─────────────────────────────────────────────────────────────

function isHex32(s: string): s is Hex {
  return /^0x[0-9a-fA-F]{64}$/.test(s)
}

function validate(body: unknown): AttestRequest {
  if (!body || typeof body !== 'object') throw new Error('Invalid request body')

  const b = body as Record<string, unknown>

  if (typeof b.user_hash !== 'string' || !isHex32(b.user_hash))
    throw new Error('user_hash must be 0x-prefixed 32-byte hex')
  if (typeof b.journey_root !== 'string' || !isHex32(b.journey_root))
    throw new Error('journey_root must be 0x-prefixed 32-byte hex')
  if (typeof b.quest_count !== 'number' || b.quest_count < 0 || b.quest_count > 1_000_000)
    throw new Error('quest_count must be 0-1000000')
  if (typeof b.streak !== 'number' || b.streak < 0 || b.streak > 100_000)
    throw new Error('streak must be 0-100000')

  return {
    user_hash: b.user_hash,
    journey_root: b.journey_root,
    quest_count: Math.floor(b.quest_count),
    streak: Math.floor(b.streak),
  }
}

// ─── CORS ───────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// ─── Handler ────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    // Only POST /attest
    const url = new URL(request.url)
    if (request.method !== 'POST' || url.pathname !== '/attest') {
      return Response.json(
        { error: 'Not found. Use POST /attest' },
        { status: 404, headers: CORS_HEADERS },
      )
    }

    try {
      // Validate secret
      if (!env.ATTESTER_PRIVATE_KEY) {
        throw new Error('ATTESTER_PRIVATE_KEY not configured')
      }

      // Parse and validate request
      const body = await request.json()
      const req = validate(body)

      // Create wallet client from project's private key
      const account = privateKeyToAccount(env.ATTESTER_PRIVATE_KEY as Hex)
      const walletClient = createWalletClient({
        account,
        chain: base,
        transport: http(BASE_RPC),
      })
      const publicClient = createPublicClient({
        chain: base,
        transport: http(BASE_RPC),
      })

      // Encode the attestation data (schema fields)
      const encodedData = encodeAbiParameters(
        parseAbiParameters('bytes32, bytes32, uint64, uint64'),
        [
          req.user_hash as Hex,
          req.journey_root as Hex,
          BigInt(req.quest_count),
          BigInt(req.streak),
        ],
      )

      // Build the EAS attest calldata
      const calldata = encodeFunctionData({
        abi: EAS_ABI,
        functionName: 'attest',
        args: [
          {
            schema: SCHEMA_UID,
            data: {
              recipient: '0x0000000000000000000000000000000000000000' as const,
              expirationTime: 0n,
              revocable: false,
              refUID: '0x0000000000000000000000000000000000000000000000000000000000000000' as const,
              data: encodedData,
              value: 0n,
            },
          },
        ],
      })

      // Submit transaction
      const txHash = await walletClient.sendTransaction({
        to: EAS_ADDRESS,
        data: calldata,
        value: 0n,
      })

      // Wait for receipt (30s timeout for worker)
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 25_000,
      })

      if (receipt.status !== 'success') {
        throw new Error('Transaction reverted')
      }

      return Response.json(
        { tx_hash: txHash, status: 'confirmed' },
        { status: 200, headers: CORS_HEADERS },
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('Attestation failed:', message)
      return Response.json(
        { error: message },
        { status: 500, headers: CORS_HEADERS },
      )
    }
  },
}
