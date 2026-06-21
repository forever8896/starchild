'use client'

/**
 * Burn-to-Unlock — crowd-patronage of the Starchild commons.
 *
 * Supporters burn $STARCHILD toward public goals. When a goal is funded, the
 * work ships free and open-source to everyone. Tokens are destroyed, not
 * collected. This page is the only place a wallet ever appears — the companion
 * app stays wallet-free and private.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  fetchGoals,
  fetchTokenMeta,
  fetchTotalBurned,
  fetchBurnStats,
  burnToward,
  fmt,
  isDeployed,
  BURN_GOALS_ADDRESS,
  DEAD_ADDRESS,
  STARCHILD_TOKEN,
  type Goal,
  type BurnStats,
} from '@/lib/burnGoals'

const LAV = '#b8a0d8'
const GOLD = '#e8d8a8'

function pct(raised: bigint, target: bigint): number {
  if (target === 0n) return 0
  const p = Number((raised * 1000n) / target) / 10
  return Math.min(100, p)
}

function GoalCard({
  goal,
  index,
  decimals,
  symbol,
  onBurn,
  busy,
}: {
  goal: Goal
  index: number
  decimals: number
  symbol: string
  onBurn: (i: number, amount: string) => void
  busy: boolean
}) {
  const [amount, setAmount] = useState('')
  const funded = goal.raised >= goal.target
  const progress = pct(goal.raised, goal.target)
  const status = goal.shipped ? 'Shipped' : funded ? 'Funded' : 'Open'
  const statusColor = goal.shipped ? GOLD : funded ? '#a8d8b8' : LAV

  return (
    <div
      className="rounded-2xl p-6 flex flex-col gap-4"
      style={{ background: 'rgba(20,16,32,0.6)', border: '1px solid rgba(184,160,216,0.18)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium" style={{ color: '#fff' }}>{goal.title}</h3>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>{goal.detail}</p>
        </div>
        <span
          className="text-[11px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full whitespace-nowrap"
          style={{ color: statusColor, border: `1px solid ${statusColor}55`, background: `${statusColor}14` }}
        >
          {status}
        </span>
      </div>

      {/* Progress */}
      <div>
        <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${LAV}, ${GOLD})` }}
          />
        </div>
        <div className="flex justify-between text-xs mt-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
          <span>{fmt(goal.raised, decimals)} {symbol} burned</span>
          <span>{progress.toFixed(0)}% of {fmt(goal.target, decimals)}</span>
        </div>
      </div>

      {/* Contribute */}
      {!goal.shipped && (
        <div className="flex gap-2">
          <input
            inputMode="decimal"
            placeholder={`Amount of ${symbol}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(184,160,216,0.25)', color: '#fff' }}
          />
          <button
            disabled={busy || !amount || Number(amount) <= 0}
            onClick={() => onBurn(index, amount)}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
            style={{ background: LAV, color: '#1a1525' }}
          >
            {busy ? 'Burning…' : 'Burn 🔥'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [totalBurned, setTotalBurned] = useState<bigint>(0n)
  const [burn, setBurn] = useState<BurnStats | null>(null)
  const [meta, setMeta] = useState<{ decimals: number; symbol: string }>({ decimals: 18, symbol: 'STARCHILD' })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [g, t, b, m] = await Promise.all([
        fetchGoals(),
        fetchTotalBurned(),
        fetchBurnStats().catch(() => null),
        fetchTokenMeta().catch(() => null),
      ])
      setGoals(g)
      setTotalBurned(t)
      if (b) setBurn(b)
      if (m) setMeta(m)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const onBurn = useCallback(
    async (i: number, amount: string) => {
      setBusy(true)
      setMsg(null)
      try {
        const hash = await burnToward(i, amount, meta.decimals)
        setMsg(`Burned. tx ${hash.slice(0, 10)}… — thank you for funding the commons.`)
        await load()
      } catch (e) {
        setMsg(e instanceof Error ? e.message : 'Transaction failed')
      } finally {
        setBusy(false)
      }
    },
    [meta.decimals, load],
  )

  return (
    <main className="min-h-screen bg-black px-6 py-20" style={{ color: '#fff' }}>
      <div
        className="pointer-events-none fixed inset-0 z-0"
        aria-hidden
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(120,80,180,0.16) 0%, transparent 70%)' }}
      />
      <div className="relative z-10 mx-auto max-w-2xl">
        <h1 className="text-center" style={{ fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 300, fontStyle: 'italic' }}>
          Burn to unlock
        </h1>
        <p className="text-center mt-4 mx-auto max-w-xl" style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
          Burn $STARCHILD toward what gets built next. When a goal is funded, the work ships
          <em> free and open-source to everyone</em>. Tokens are destroyed — not collected.
          The founder profits nothing; the commons grows.
        </p>

        {/* All-time burn — read from chain (founder burns + every contract burn) */}
        <div className="mt-8 mb-10 text-center">
          <div style={{ fontSize: 'clamp(2rem,6vw,3.4rem)', fontWeight: 600, color: GOLD }}>
            {burn ? `${burn.pct.toFixed(2)}%` : '—'}
          </div>
          <div className="text-xs uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.5)' }}>
            of all ${meta.symbol} supply burned forever
          </div>
          {burn && (
            <div className="mt-3 text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {fmt(burn.burned, burn.decimals)} of {fmt(burn.supply, burn.decimals)} ${burn.symbol} sent to{' '}
              <a
                href={`https://basescan.org/token/${STARCHILD_TOKEN}?a=${DEAD_ADDRESS}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: LAV, textDecoration: 'underline' }}
              >
                the dead address
              </a>
              {isDeployed && totalBurned > 0n && (
                <> · {fmt(totalBurned, meta.decimals)} of it toward goals below</>
              )}
            </div>
          )}
        </div>

        {msg && (
          <p className="mb-6 text-center text-sm rounded-xl px-4 py-3" style={{ background: 'rgba(184,160,216,0.1)', color: LAV }}>
            {msg}
          </p>
        )}

        {!isDeployed ? (
          <p className="text-center text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
            The burn-goals contract isn’t deployed yet. Set <code>NEXT_PUBLIC_BURN_GOALS_ADDRESS</code> once it’s live.
          </p>
        ) : loading ? (
          <p className="text-center text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>Loading goals…</p>
        ) : goals.length === 0 ? (
          <p className="text-center text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>No goals yet — check back soon.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {goals.map((g, i) => (
              <GoalCard
                key={i}
                goal={g}
                index={i}
                decimals={meta.decimals}
                symbol={meta.symbol}
                onBurn={onBurn}
                busy={busy}
              />
            ))}
          </div>
        )}

        <p className="mt-12 text-center text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Contract burns straight to 0x…dEaD — it never holds your tokens.{' '}
          {isDeployed && (
            <a
              href={`https://basescan.org/address/${BURN_GOALS_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: LAV, textDecoration: 'underline' }}
            >
              View on BaseScan
            </a>
          )}
        </p>
      </div>
    </main>
  )
}
