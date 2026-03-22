/**
 * Register EAS schema on Base Mainnet.
 * Run: node register-schema.mjs
 */

import { createWalletClient, createPublicClient, http, encodeFunctionData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import 'dotenv/config'

const SCHEMA_REGISTRY = '0x4200000000000000000000000000000000000020'

const SCHEMA_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'register',
    inputs: [
      { name: 'schema', type: 'string' },
      { name: 'resolver', type: 'address' },
      { name: 'revocable', type: 'bool' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'nonpayable',
  },
]

const key = process.env.ATTESTER_PRIVATE_KEY
if (!key) { console.error('Set ATTESTER_PRIVATE_KEY in .env'); process.exit(1) }

const account = privateKeyToAccount(key)
const walletClient = createWalletClient({ account, chain: base, transport: http('https://mainnet.base.org') })
const publicClient = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') })

console.log('Registering schema from:', account.address)

const txHash = await walletClient.writeContract({
  address: SCHEMA_REGISTRY,
  abi: SCHEMA_REGISTRY_ABI,
  functionName: 'register',
  args: [
    'bytes32 userHash, bytes32 journeyRoot, uint64 questCount, uint64 currentStreak',
    '0x0000000000000000000000000000000000000000',
    false,
  ],
})

console.log('Tx submitted:', txHash)
console.log('Waiting for confirmation...')

const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
console.log('Status:', receipt.status)

// Schema UID is in the logs
const schemaLog = receipt.logs[0]
if (schemaLog) {
  console.log('\n✦ Schema UID:', schemaLog.topics[1])
  console.log('\nUpdate SCHEMA_UID in relay/src/index.ts with this value.')
}
