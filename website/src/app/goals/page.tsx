'use client'

/**
 * Burn-to-Unlock — crowd-patronage of the Starchild commons.
 * Supporters burn $STARCHILD toward public goals; when funded, the work ships
 * free + open-source to everyone. Tokens are destroyed, not collected.
 * A wallet only ever appears here — the companion app stays wallet-free.
 */
import { useCallback, useEffect, useState } from 'react'
import Navbar from '@/components/Navbar'
import VideoPlayer from '@/components/VideoPlayer'
import {
  fetchGoals,
  fetchTokenMeta,
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
const MINT = '#a8d8b8'

function pct(raised: bigint, target: bigint): number {
  if (target === 0n) return 0
  return Math.min(100, Number((raised * 10000n) / target) / 100)
}

function GoalCard({
  goal, index, decimals, symbol, onBurn, busyIndex,
}: {
  goal: Goal; index: number; decimals: number; symbol: string
  onBurn: (i: number, amount: string) => void; busyIndex: number | null
}) {
  const [amount, setAmount] = useState('')
  const [hover, setHover] = useState(false)
  const funded = goal.raised >= goal.target
  const progress = pct(goal.raised, goal.target)
  const status = goal.shipped ? 'Shipped' : funded ? 'Funded' : 'Open'
  const sColor = goal.shipped ? GOLD : funded ? MINT : LAV
  const busy = busyIndex === index

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'linear-gradient(180deg, rgba(26,21,37,0.7), rgba(14,11,22,0.7))',
        border: `1px solid ${hover ? 'rgba(184,160,216,0.45)' : 'rgba(184,160,216,0.18)'}`,
        borderRadius: 24,
        padding: '28px 30px',
        transition: 'border-color .25s, transform .25s',
        transform: hover ? 'translateY(-2px)' : 'none',
        boxShadow: hover ? '0 20px 60px rgba(120,80,180,0.18)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 500, lineHeight: 1.2 }}>{goal.title}</h3>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: sColor, border: `1px solid ${sColor}55`, background: `${sColor}14`,
          borderRadius: 999, padding: '5px 11px', whiteSpace: 'nowrap',
        }}>{status}</span>
      </div>
      <p style={{ marginTop: 8, fontSize: '0.92rem', lineHeight: 1.55, color: 'rgba(255,255,255,0.6)' }}>{goal.detail}</p>

      {/* progress */}
      <div style={{ marginTop: 22 }}>
        <div style={{ height: 10, width: '100%', borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${Math.max(progress, 1.5)}%`, borderRadius: 999,
            background: `linear-gradient(90deg, ${LAV}, ${GOLD})`,
            boxShadow: `0 0 14px ${LAV}80`, transition: 'width .6s ease',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
          <span style={{ color: GOLD }}>{fmt(goal.raised, decimals)} {symbol}</span>
          <span>{progress.toFixed(progress < 1 ? 2 : 0)}% of {fmt(goal.target, decimals)}</span>
        </div>
      </div>

      {/* contribute */}
      {!goal.shipped && (
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <input
            inputMode="decimal" placeholder={`Amount of ${symbol}`} value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            style={{
              flex: 1, borderRadius: 12, padding: '11px 14px', fontSize: 14, color: '#fff',
              background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(184,160,216,0.22)', outline: 'none',
            }}
          />
          <button
            disabled={busy || !amount || Number(amount) <= 0}
            onClick={() => onBurn(index, amount)}
            style={{
              padding: '11px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600, border: 'none',
              cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap',
              background: `linear-gradient(90deg, ${LAV}, ${GOLD})`, color: '#1a1525',
              opacity: busy || !amount || Number(amount) <= 0 ? 0.4 : 1, transition: 'opacity .2s',
            }}
          >{busy ? 'Burning…' : 'Burn 🔥'}</button>
        </div>
      )}
    </div>
  )
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [burn, setBurn] = useState<BurnStats | null>(null)
  const [meta, setMeta] = useState<{ decimals: number; symbol: string }>({ decimals: 18, symbol: 'STARCHILD' })
  const [loading, setLoading] = useState(true)
  const [busyIndex, setBusyIndex] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [g, b, m] = await Promise.all([
      fetchGoals().catch(() => [] as Goal[]),
      fetchBurnStats().catch(() => null),
      fetchTokenMeta().catch(() => null),
    ])
    setGoals(g)
    if (b) setBurn(b)
    if (m) setMeta(m)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const onBurn = useCallback(async (i: number, amount: string) => {
    setBusyIndex(i); setMsg(null)
    try {
      const hash = await burnToward(i, amount, meta.decimals)
      setMsg(`Burned. tx ${hash.slice(0, 12)}… — thank you for funding the commons.`)
      await load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Transaction failed')
    } finally { setBusyIndex(null) }
  }, [meta.decimals, load])

  return (
    <main style={{ background: '#000', color: '#fff', minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      <Navbar />
      <div aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 70% 50% at 50% -5%, rgba(120,80,180,0.22) 0%, transparent 70%)',
      }} />

      {/* ── Hero ── */}
      <section style={{
        position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto',
        padding: '150px 24px 40px', textAlign: 'center',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <VideoPlayer src="/videos/starchild5.webm" className="glow-lavender"
            style={{ width: 'clamp(150px, 22vw, 230px)', height: 'auto' }} />
        </div>

        <h1 style={{ fontSize: 'clamp(2.1rem, 5vw, 3.4rem)', fontWeight: 300, fontStyle: 'italic', letterSpacing: '-0.01em' }}>
          Burn to unlock
        </h1>
        <p style={{ margin: '18px auto 0', maxWidth: 560, lineHeight: 1.65, color: 'rgba(255,255,255,0.62)', fontSize: '1.02rem' }}>
          Burn $STARCHILD toward what gets built next. When a goal is funded, the work ships{' '}
          <em style={{ color: 'rgba(255,255,255,0.85)' }}>free and open-source to everyone</em>. Tokens are
          destroyed — never collected. The founder profits nothing; the commons grows.
        </p>

        {/* big burn stat */}
        <div style={{ marginTop: 56 }}>
          <div style={{
            fontSize: 'clamp(3.4rem, 11vw, 6.5rem)', fontWeight: 700, lineHeight: 1, color: GOLD,
            textShadow: `0 0 50px ${GOLD}66`,
          }}>
            {burn ? `${burn.pct.toFixed(2)}%` : <span style={{ opacity: 0.35 }}>···</span>}
          </div>
          <div style={{ marginTop: 14, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>
            of all ${meta.symbol} supply burned forever
          </div>
          {burn && (
            <div style={{ marginTop: 12, fontSize: 14, color: 'rgba(255,255,255,0.55)' }}>
              {fmt(burn.burned, burn.decimals)} of {fmt(burn.supply, burn.decimals)} ${burn.symbol} ·{' '}
              <a href={`https://basescan.org/token/${STARCHILD_TOKEN}?a=${DEAD_ADDRESS}`} target="_blank" rel="noreferrer"
                style={{ color: LAV, textDecoration: 'underline', textUnderlineOffset: 3 }}>proof on BaseScan</a>
            </div>
          )}
        </div>
      </section>

      {/* ── Goals ── */}
      <section style={{ position: 'relative', zIndex: 1, maxWidth: 620, margin: '0 auto', padding: '24px 24px 120px' }}>
        <h2 style={{ textAlign: 'center', fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 28 }}>
          Fund what gets built next
        </h2>

        {msg && (
          <p style={{ marginBottom: 22, textAlign: 'center', fontSize: 14, borderRadius: 12, padding: '12px 16px', background: 'rgba(184,160,216,0.1)', color: LAV }}>{msg}</p>
        )}

        {loading ? (
          <p style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Loading goals…</p>
        ) : goals.length === 0 ? (
          <p style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>No goals yet — check back soon.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {goals.map((g, i) => (
              <GoalCard key={i} goal={g} index={i} decimals={meta.decimals} symbol={meta.symbol} onBurn={onBurn} busyIndex={busyIndex} />
            ))}
          </div>
        )}

        <p style={{ marginTop: 40, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>
          Contributions burn straight to <span style={{ fontFamily: 'monospace' }}>0x…dEaD</span> — the contract never holds your tokens.{' '}
          {isDeployed && (
            <a href={`https://basescan.org/address/${BURN_GOALS_ADDRESS}`} target="_blank" rel="noreferrer"
              style={{ color: LAV, textDecoration: 'underline', textUnderlineOffset: 3 }}>View contract</a>
          )}
        </p>
      </section>
    </main>
  )
}
