/**
 * ERC-8004 Identity Registry ABI (subset for registration)
 *
 * Contract: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 (Base Mainnet)
 * Spec: https://github.com/erc-8004/erc-8004-contracts
 */

export const IDENTITY_REGISTRY_ADDRESS = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const

export const IDENTITY_REGISTRY_ABI = [
  // Register with URI and metadata
  {
    type: 'function',
    name: 'register',
    inputs: [
      { name: 'agentURI', type: 'string', internalType: 'string' },
      {
        name: 'metadata',
        type: 'tuple[]',
        internalType: 'struct MetadataEntry[]',
        components: [
          { name: 'metadataKey', type: 'string', internalType: 'string' },
          { name: 'metadataValue', type: 'bytes', internalType: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: 'agentId', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  // Register with URI only
  {
    type: 'function',
    name: 'register',
    inputs: [{ name: 'agentURI', type: 'string', internalType: 'string' }],
    outputs: [{ name: 'agentId', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  // Register with no params
  {
    type: 'function',
    name: 'register',
    inputs: [],
    outputs: [{ name: 'agentId', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  // Set agent URI
  {
    type: 'function',
    name: 'setAgentURI',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'newURI', type: 'string', internalType: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Set metadata
  {
    type: 'function',
    name: 'setMetadata',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'metadataKey', type: 'string', internalType: 'string' },
      { name: 'metadataValue', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Get metadata
  {
    type: 'function',
    name: 'getMetadata',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'metadataKey', type: 'string', internalType: 'string' },
    ],
    outputs: [{ name: '', type: 'bytes', internalType: 'bytes' }],
    stateMutability: 'view',
  },
  // Get agent wallet
  {
    type: 'function',
    name: 'getAgentWallet',
    inputs: [{ name: 'agentId', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  // ownerOf (ERC-721)
  {
    type: 'function',
    name: 'ownerOf',
    inputs: [{ name: 'tokenId', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  // tokenURI (ERC-721)
  {
    type: 'function',
    name: 'tokenURI',
    inputs: [{ name: 'tokenId', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'string', internalType: 'string' }],
    stateMutability: 'view',
  },
  // balanceOf (ERC-721)
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'owner', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  // Events
  {
    type: 'event',
    name: 'Registered',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'owner', type: 'address', indexed: true, internalType: 'address' },
    ],
  },
  {
    type: 'event',
    name: 'URIUpdated',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'updater', type: 'address', indexed: true, internalType: 'address' },
    ],
  },
] as const
