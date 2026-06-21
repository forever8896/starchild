/**
 * On-chain config + helpers for the Burn-to-Unlock goals page.
 *
 * This is the "commons" layer — it lives only on the website and only touches
 * a wallet here. The Starchild companion app never imports any of this.
 */
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  formatUnits,
  parseUnits,
  type Address,
  type EIP1193Provider,
} from 'viem'
import { base } from 'viem/chains'

/** $STARCHILD on Base. */
export const STARCHILD_TOKEN = '0x980e9f2061487376ab1438e965ad276a1d36fba3' as const

/** Live StarchildBurnGoals contract on Base (env var overrides for testing). */
export const BURN_GOALS_ADDRESS = (process.env.NEXT_PUBLIC_BURN_GOALS_ADDRESS ??
  '0x0c8D4Ad5f9e2211D0A57aBA9aF9Dbc8eb25Df879') as Address

export const isDeployed = BURN_GOALS_ADDRESS !== '0x0000000000000000000000000000000000000000'

const RPC = 'https://mainnet.base.org'

/** Canonical burn sink — every burn (past founder burns + contract burns) lands here. */
export const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD' as const

export const publicClient = createPublicClient({ chain: base, transport: http(RPC) })

export function getInjected(): EIP1193Provider | null {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).ethereum ?? null
}

export function getWalletClient() {
  const injected = getInjected()
  if (!injected) throw new Error('No wallet found. Install a Base-compatible wallet.')
  return createWalletClient({ chain: base, transport: custom(injected) })
}

// ─── ABIs (minimal) ───────────────────────────────────────────────────────────

export const burnGoalsAbi = [
  { type: 'function', name: 'totalBurned', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'goalCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'allGoals',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'tuple[]',
        components: [
          { name: 'title', type: 'string' },
          { name: 'detail', type: 'string' },
          { name: 'target', type: 'uint256' },
          { name: 'raised', type: 'uint256' },
          { name: 'shipped', type: 'bool' },
          { name: 'createdAt', type: 'uint64' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'contributed',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }, { type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'contribute',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'goalId', type: 'uint256' }, { name: 'amount', type: 'uint256' }],
    outputs: [],
  },
] as const

export const erc20Abi = [
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }, { type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
] as const

export type Goal = {
  title: string
  detail: string
  target: bigint
  raised: bigint
  shipped: boolean
  createdAt: bigint
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function fetchTokenMeta() {
  const [decimals, symbol] = await Promise.all([
    publicClient.readContract({ address: STARCHILD_TOKEN, abi: erc20Abi, functionName: 'decimals' }),
    publicClient.readContract({ address: STARCHILD_TOKEN, abi: erc20Abi, functionName: 'symbol' }),
  ])
  return { decimals: Number(decimals), symbol }
}

export async function fetchGoals(): Promise<Goal[]> {
  if (!isDeployed) return []
  const goals = (await publicClient.readContract({
    address: BURN_GOALS_ADDRESS,
    abi: burnGoalsAbi,
    functionName: 'allGoals',
  })) as readonly Goal[]
  return goals.map((g) => ({ ...g }))
}

export async function fetchTotalBurned(): Promise<bigint> {
  if (!isDeployed) return 0n
  return publicClient.readContract({ address: BURN_GOALS_ADDRESS, abi: burnGoalsAbi, functionName: 'totalBurned' })
}

export type BurnStats = { burned: bigint; supply: bigint; pct: number; decimals: number; symbol: string }

/**
 * All-time burn, read straight from chain: balanceOf(0x…dEaD) ÷ totalSupply.
 * Captures every burn — the founder's existing burns AND every contract burn,
 * since they all land at the dead address. Works before the goals contract exists.
 */
export async function fetchBurnStats(): Promise<BurnStats> {
  const [supply, burned, decimals, symbol] = await Promise.all([
    publicClient.readContract({ address: STARCHILD_TOKEN, abi: erc20Abi, functionName: 'totalSupply' }) as Promise<bigint>,
    publicClient.readContract({ address: STARCHILD_TOKEN, abi: erc20Abi, functionName: 'balanceOf', args: [DEAD_ADDRESS] }) as Promise<bigint>,
    publicClient.readContract({ address: STARCHILD_TOKEN, abi: erc20Abi, functionName: 'decimals' }) as Promise<number>,
    publicClient.readContract({ address: STARCHILD_TOKEN, abi: erc20Abi, functionName: 'symbol' }) as Promise<string>,
  ])
  const pct = supply === 0n ? 0 : Number((burned * 1000000n) / supply) / 10000
  return { burned, supply, pct, decimals: Number(decimals), symbol }
}

// ─── Write: approve (if needed) then contribute ───────────────────────────────

export async function burnToward(goalId: number, amountHuman: string, decimals: number): Promise<`0x${string}`> {
  const wallet = getWalletClient()
  const [account] = await wallet.requestAddresses()
  const amount = parseUnits(amountHuman, decimals)

  const allowance = (await publicClient.readContract({
    address: STARCHILD_TOKEN,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account, BURN_GOALS_ADDRESS],
  })) as bigint

  if (allowance < amount) {
    const approveHash = await wallet.writeContract({
      account,
      address: STARCHILD_TOKEN,
      abi: erc20Abi,
      functionName: 'approve',
      args: [BURN_GOALS_ADDRESS, amount],
    })
    await publicClient.waitForTransactionReceipt({ hash: approveHash })
  }

  const hash = await wallet.writeContract({
    account,
    address: BURN_GOALS_ADDRESS,
    abi: burnGoalsAbi,
    functionName: 'contribute',
    args: [BigInt(goalId), amount],
  })
  await publicClient.waitForTransactionReceipt({ hash })
  return hash
}

export function fmt(amount: bigint, decimals: number, maxFrac = 0): string {
  const n = Number(formatUnits(amount, decimals))
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFrac })
}
