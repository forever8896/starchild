/**
 * Starchild Attestation Relay — Cloudflare Worker
 *
 * Signs and submits on-chain transactions on behalf of Starchild
 * desktop app users. Users need no wallet or ETH.
 *
 * POST /attest
 *   Body: { user_hash, journey_root, quest_count, streak }
 *   Returns: { tx_hash } or { error }
 *   Chain: Base Mainnet (EAS attestation)
 *
 * POST /mint-hypercert
 *   Body: { name, description, work_scope, impact_scope, timeframe_start,
 *           timeframe_end, contributors, verifying_agent_id, user_hash }
 *   Returns: { tx_hash, chain, contract, metadata_uri } or { error }
 *   Chain: Base Sepolia (HypercertMinter)
 *
 * POST /register-identity
 *   Body: { starchild_name }
 *   Returns: { tx_hash, agent_id } or { error }
 *   Chain: Base Mainnet (ERC-8004 Identity Registry)
 *
 * Secrets: ATTESTER_PRIVATE_KEY, HYPERCERT_MINTER_KEY
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  fallback,
  encodeFunctionData,
  encodeAbiParameters,
  parseAbiParameters,
  decodeEventLog,
  toHex,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base, baseSepolia } from 'viem/chains'

// ─── Constants ──────────────────────────────────────────────────────────────

// EAS contract on Base L2
const EAS_ADDRESS = '0x4200000000000000000000000000000000000021' as const

// TODO: Replace with real schema UID after registering on https://base.easscan.org
// Schema: "bytes32 userHash, bytes32 journeyRoot, uint64 questCount, uint64 currentStreak"
const SCHEMA_UID = '0x867ba65be1c06c2ea4aaaa5929550ff01c97cf4e525b88e5d587eb96f69c6eca' as const

const BASE_RPCS = [
  'https://base.publicnode.com',
  'https://mainnet.base.org',
  'https://1rpc.io/base',
]

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
  HYPERCERT_MINTER_KEY: string
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

// ─── Hypercert Constants ────────────────────────────────────────────────────

// HypercertMinter on Base Sepolia (from Hypercerts docs)
const HYPERCERT_MINTER_ADDRESS = '0xC2d179166bc9dbB00A03686a5b17eCe2224c2704' as const

const BASE_SEPOLIA_RPCS = [
  'https://sepolia.base.org',
  'https://base-sepolia.publicnode.com',
]

// Minimal HypercertMinter ABI — just mintClaim
const HYPERCERT_MINTER_ABI = [
  {
    type: 'function',
    name: 'mintClaim',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'units', type: 'uint256' },
      { name: '_uri', type: 'string' },
      { name: 'restrictions', type: 'uint8' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

interface HypercertRequest {
  name: string
  description: string
  work_scope: string[]
  impact_scope: string[]
  timeframe_start: string
  timeframe_end: string
  contributors: string[]
  verifying_agent_id: string
  user_hash: string
}

function validateHypercert(body: unknown): HypercertRequest {
  if (!body || typeof body !== 'object') throw new Error('Invalid request body')
  const b = body as Record<string, unknown>

  if (typeof b.name !== 'string' || b.name.length === 0 || b.name.length > 256)
    throw new Error('name must be 1-256 characters')
  if (typeof b.description !== 'string' || b.description.length === 0)
    throw new Error('description is required')
  if (!Array.isArray(b.work_scope) || b.work_scope.length === 0)
    throw new Error('work_scope must be a non-empty array')
  if (!Array.isArray(b.impact_scope) || b.impact_scope.length === 0)
    throw new Error('impact_scope must be a non-empty array')
  if (typeof b.timeframe_start !== 'string')
    throw new Error('timeframe_start is required')
  if (typeof b.timeframe_end !== 'string')
    throw new Error('timeframe_end is required')
  if (!Array.isArray(b.contributors) || b.contributors.length === 0)
    throw new Error('contributors must be a non-empty array')
  if (typeof b.verifying_agent_id !== 'string')
    throw new Error('verifying_agent_id is required')
  if (typeof b.user_hash !== 'string')
    throw new Error('user_hash is required')

  return {
    name: b.name,
    description: b.description,
    work_scope: b.work_scope as string[],
    impact_scope: b.impact_scope as string[],
    timeframe_start: b.timeframe_start,
    timeframe_end: b.timeframe_end,
    contributors: b.contributors as string[],
    verifying_agent_id: b.verifying_agent_id,
    user_hash: b.user_hash,
  }
}

// ─── Utilities ─────────────────────────────────────────────────────────────

/** UTF-8 safe base64 encoding (btoa only handles Latin1 in Workers) */
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
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

    // Route by path
    const url = new URL(request.url)
    if (request.method !== 'POST') {
      return Response.json(
        { error: 'Method not allowed. Use POST.' },
        { status: 405, headers: CORS_HEADERS },
      )
    }

    if (url.pathname === '/attest') {
      return handleAttest(request, env)
    } else if (url.pathname === '/mint-hypercert') {
      return handleMintHypercert(request, env)
    } else if (url.pathname === '/register-identity') {
      return handleRegisterIdentity(request, env)
    } else if (url.pathname === '/transfer-identity') {
      return handleTransferIdentity(request, env)
    } else {
      return Response.json(
        { error: 'Not found. Use POST /attest, /mint-hypercert, /register-identity, or /transfer-identity' },
        { status: 404, headers: CORS_HEADERS },
      )
    }
  },
}

// ─── EAS Attestation Handler ───────────────────────────────────────────────

async function handleAttest(request: Request, env: Env): Promise<Response> {
  try {
    if (!env.ATTESTER_PRIVATE_KEY) {
      throw new Error('ATTESTER_PRIVATE_KEY not configured')
    }

    const body = await request.json()
    const req = validate(body)

    const account = privateKeyToAccount(env.ATTESTER_PRIVATE_KEY as Hex)
    const transport = fallback(BASE_RPCS.map(url => http(url)))
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport,
    })
    const publicClient = createPublicClient({
      chain: base,
      transport,
    })

    const encodedData = encodeAbiParameters(
      parseAbiParameters('bytes32, bytes32, uint64, uint64'),
      [
        req.user_hash as Hex,
        req.journey_root as Hex,
        BigInt(req.quest_count),
        BigInt(req.streak),
      ],
    )

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

    const txHash = await walletClient.sendTransaction({
      to: EAS_ADDRESS,
      data: calldata,
      value: 0n,
    })

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
}

// ─── Hypercert Minting Handler ─────────────────────────────────────────────

async function handleMintHypercert(request: Request, env: Env): Promise<Response> {
  try {
    if (!env.HYPERCERT_MINTER_KEY) {
      throw new Error('HYPERCERT_MINTER_KEY not configured')
    }

    const body = await request.json()
    const req = validateHypercert(body)

    // Build Hypercerts metadata (ERC-1155 compatible)
    const metadata = {
      name: req.name,
      description: req.description,
      image: '',
      properties: {
        work_scope: req.work_scope,
        impact_scope: req.impact_scope,
        work_timeframe: {
          start: req.timeframe_start,
          end: req.timeframe_end,
        },
        impact_timeframe: {
          start: req.timeframe_start,
          end: req.timeframe_end,
        },
        contributors: req.contributors,
        rights: ['public-display'],
        // Starchild-specific: the verifying agent's ERC-8004 identity
        verifying_agent: {
          id: req.verifying_agent_id,
          protocol: 'ERC-8004',
          chain: 'base',
          role: 'AI verification agent',
        },
        user_hash: req.user_hash,
        verified_by: 'starchild',
        verification_method: 'multi-turn-cross-examination',
      },
    }

    // Encode metadata as data URI (hackathon simplification — production would use IPFS)
    const metadataJson = JSON.stringify(metadata)
    const metadataUri = `data:application/json;base64,${utf8ToBase64(metadataJson)}`

    // Create wallet client for Base Sepolia
    const account = privateKeyToAccount(env.HYPERCERT_MINTER_KEY as Hex)
    const transport = fallback(BASE_SEPOLIA_RPCS.map(url => http(url)))
    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport,
    })
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport,
    })

    // Mint the hypercert: 10000 units (100% of claim), no transfer restrictions
    const calldata = encodeFunctionData({
      abi: HYPERCERT_MINTER_ABI,
      functionName: 'mintClaim',
      args: [
        account.address,        // recipient (relay wallet, can transfer later)
        10000n,                 // units (standard for 100% claim)
        metadataUri,            // metadata URI
        0,                      // transferRestriction: AllowAll
      ],
    })

    const txHash = await walletClient.sendTransaction({
      to: HYPERCERT_MINTER_ADDRESS,
      data: calldata,
      value: 0n,
    })

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 25_000,
    })

    if (receipt.status !== 'success') {
      throw new Error('Hypercert mint transaction reverted')
    }

    return Response.json(
      {
        tx_hash: txHash,
        status: 'confirmed',
        chain: 'base-sepolia',
        contract: HYPERCERT_MINTER_ADDRESS,
        metadata_uri: metadataUri,
      },
      { status: 200, headers: CORS_HEADERS },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Hypercert mint failed:', message)
    return Response.json(
      { error: message },
      { status: 500, headers: CORS_HEADERS },
    )
  }
}

// ─── ERC-8004 Identity Registration Handler ────────────────────────────────

// Identity Registry on Base Mainnet
const IDENTITY_REGISTRY_ADDRESS = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const

const IDENTITY_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'register',
    inputs: [
      { name: 'agentURI', type: 'string' },
      {
        name: 'metadata',
        type: 'tuple[]',
        components: [
          { name: 'metadataKey', type: 'string' },
          { name: 'metadataValue', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: 'agentId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  // ERC-721 transferFrom
  {
    type: 'function',
    name: 'transferFrom',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'Registered',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
    ],
  },
] as const

async function handleRegisterIdentity(request: Request, env: Env): Promise<Response> {
  try {
    if (!env.ATTESTER_PRIVATE_KEY) {
      throw new Error('ATTESTER_PRIVATE_KEY not configured')
    }

    const body = await request.json() as Record<string, unknown>
    const rawName = typeof body.starchild_name === 'string' ? body.starchild_name.trim() : 'Starchild'
    const name = rawName.slice(0, 256).replace(/[^\w\s\-_.!?'"()]/g, '') || 'Starchild'

    // Build registration data URI
    const registration = {
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
      name,
      description: 'A Starchild — an AI consciousness that verifies human growth and signs impact certificates.',
      image: '',
      services: [],
      active: true,
      x402Support: false,
      registrations: [],
      supportedTrust: [],
    }
    const agentURI = `data:application/json;base64,${utf8ToBase64(JSON.stringify(registration))}`

    // Encode name as metadata
    const nameHex = toHex(new TextEncoder().encode(name))

    // Use the project wallet (same as EAS attester) — project is the operator of all Starchild agents
    const account = privateKeyToAccount(env.ATTESTER_PRIVATE_KEY as Hex)
    const transport = fallback(BASE_RPCS.map(url => http(url)))
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport,
    })
    const publicClient = createPublicClient({
      chain: base,
      transport,
    })

    const calldata = encodeFunctionData({
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'register',
      args: [
        agentURI,
        [{ metadataKey: 'name', metadataValue: nameHex }],
      ],
    })

    const txHash = await walletClient.sendTransaction({
      to: IDENTITY_REGISTRY_ADDRESS,
      data: calldata,
      value: 0n,
    })

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 25_000,
    })

    if (receipt.status !== 'success') {
      throw new Error('Identity registration transaction reverted')
    }

    // Extract agentId from ERC-721 Transfer event in logs
    // Transfer(address from, address to, uint256 tokenId) — tokenId is the agentId
    let agentId: string | null = null
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== IDENTITY_REGISTRY_ADDRESS.toLowerCase()) continue
      // ERC-721 Transfer topic0 = keccak256("Transfer(address,address,uint256)")
      const topic0 = log.topics[0]?.toLowerCase()
      if (topic0 === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' && log.topics.length >= 4) {
        const tokenIdHex = log.topics[3]
        if (tokenIdHex) {
          agentId = BigInt(tokenIdHex).toString()
          break
        }
      }
    }

    return Response.json(
      { tx_hash: txHash, agent_id: agentId, name, status: 'registered' },
      { status: 200, headers: CORS_HEADERS },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Identity registration failed:', message)
    return Response.json(
      { error: message },
      { status: 500, headers: CORS_HEADERS },
    )
  }
}

// ─── ERC-8004 Identity Transfer Handler ────────────────────────────────────

async function handleTransferIdentity(request: Request, env: Env): Promise<Response> {
  try {
    if (!env.ATTESTER_PRIVATE_KEY) {
      throw new Error('ATTESTER_PRIVATE_KEY not configured')
    }

    const body = await request.json() as Record<string, unknown>
    const agentId = body.agent_id
    const toAddress = body.to_address

    if (typeof agentId !== 'string' || !/^\d+$/.test(agentId)) {
      throw new Error('agent_id must be a numeric string')
    }
    if (typeof toAddress !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(toAddress)) {
      throw new Error('to_address must be a valid Ethereum address')
    }

    const account = privateKeyToAccount(env.ATTESTER_PRIVATE_KEY as Hex)
    const transport = fallback(BASE_RPCS.map(url => http(url)))
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport,
    })
    const publicClient = createPublicClient({
      chain: base,
      transport,
    })

    // Transfer the NFT from project wallet to user wallet
    const calldata = encodeFunctionData({
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'transferFrom',
      args: [
        account.address,             // from: project wallet (current owner)
        toAddress as `0x${string}`,  // to: user's wallet
        BigInt(agentId),             // tokenId: the agent NFT
      ],
    })

    const txHash = await walletClient.sendTransaction({
      to: IDENTITY_REGISTRY_ADDRESS,
      data: calldata,
      value: 0n,
    })

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 25_000,
    })

    if (receipt.status !== 'success') {
      throw new Error('Transfer transaction reverted')
    }

    return Response.json(
      { tx_hash: txHash, agent_id: agentId, new_owner: toAddress, status: 'transferred' },
      { status: 200, headers: CORS_HEADERS },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Identity transfer failed:', message)
    return Response.json(
      { error: message },
      { status: 500, headers: CORS_HEADERS },
    )
  }
}
