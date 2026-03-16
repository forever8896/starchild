/**
 * Wallet management for Starchild on-chain identity.
 *
 * Generates a random wallet, stores the private key in the OS keychain
 * via Tauri's keyring integration, and provides helpers to retrieve
 * the wallet client for signing transactions.
 */

import { invoke } from '@tauri-apps/api/core'
import {
  createWalletClient,
  createPublicClient,
  http,
  fallback,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'

const KEYRING_SERVICE = 'starchild'
const KEYRING_WALLET_KEY = 'wallet_private_key'
const WALLET_ADDRESS_SETTING = 'starchild_wallet_address'

// Base Mainnet RPC (public, with fallback)
const BASE_RPC_PRIMARY = 'https://mainnet.base.org'
const BASE_RPC_FALLBACK = 'https://base.publicnode.com'

/** Generate a random private key (32 bytes hex) */
function generatePrivateKey(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `0x${hex}`
}

/** Check if a wallet already exists */
export async function hasWallet(): Promise<boolean> {
  const key = await invoke<string | null>('get_secret', {
    service: KEYRING_SERVICE,
    key: KEYRING_WALLET_KEY,
  })
  return !!key && key.length > 0
}

/** Get the stored wallet address (without loading the private key) */
export async function getWalletAddress(): Promise<string | null> {
  return invoke<string | null>('get_setting', { key: WALLET_ADDRESS_SETTING })
}

/** Generate a new wallet and store the private key in OS keychain */
export async function createWallet(): Promise<string> {
  const privateKey = generatePrivateKey()
  const account = privateKeyToAccount(privateKey)

  // Store private key in OS keychain (secure)
  await invoke('store_secret', {
    service: KEYRING_SERVICE,
    key: KEYRING_WALLET_KEY,
    value: privateKey,
  })

  // Store address in settings (not sensitive)
  await invoke('save_settings', {
    key: WALLET_ADDRESS_SETTING,
    value: account.address,
  })

  return account.address
}

/** Load the private key from OS keychain and create a wallet client */
export async function getWalletClient() {
  const privateKey = await invoke<string | null>('get_secret', {
    service: KEYRING_SERVICE,
    key: KEYRING_WALLET_KEY,
  })
  if (!privateKey) throw new Error('No wallet found. Generate one first.')

  const account = privateKeyToAccount(privateKey as `0x${string}`)

  return createWalletClient({
    account,
    chain: base,
    transport: fallback([http(BASE_RPC_PRIMARY), http(BASE_RPC_FALLBACK)]),
  })
}

/** Create a public client for reading on-chain data */
export function getPublicClient() {
  return createPublicClient({
    chain: base,
    transport: fallback([http(BASE_RPC_PRIMARY), http(BASE_RPC_FALLBACK)]),
  })
}
