'use client'

/**
 * Shape the Starchild — stake-weighted, gasless governance.
 *
 * Stake $STARCHILD (locked, never burned) to earn voting weight. Vote on
 * proposals and — above a minimum stake — create them, all via free EIP-712
 * signatures. The companion app never touches any of this.
 */
import { useCallback, useEffect, useState } from 'react'
import Navbar from '@/components/Navbar'
import VideoPlayer from '@/components/VideoPlayer'
import {
  fetchBurnStats, fetchTokenMeta, fetchStakeInfo, fetchTotalStaked,
  stakeTokens, unstakeTokens, fetchProposals, signAndPropose, signAndVote,
  getInjected, fmt, stakingDeployed, PROPOSE_MIN,
  STAKING_ADDRESS, STARCHILD_TOKEN, DEAD_ADDRESS,
  type BurnStats, type ProposalView,
} from '@/lib/burnGoals'
import { type Address } from 'viem'

const LAV = '#b8a0d8', GOLD = '#e8d8a8', MINT = '#a8d8b8'

function Btn({ children, onClick, disabled, kind = 'solid' }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; kind?: 'solid' | 'ghost' }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        padding: '11px 18px', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap', transition: 'opacity .2s', opacity: disabled ? 0.4 : 1,
        border: kind === 'ghost' ? '1px solid rgba(184,160,216,0.35)' : 'none',
        background: kind === 'ghost' ? 'transparent' : `linear-gradient(90deg, ${LAV}, ${GOLD})`,
        color: kind === 'ghost' ? LAV : '#1a1525',
      }}>{children}</button>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, borderRadius: 12, padding: '11px 14px', fontSize: 14, color: '#fff',
  background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(184,160,216,0.22)', outline: 'none', width: '100%',
}
const cardStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(26,21,37,0.7), rgba(14,11,22,0.7))',
  border: '1px solid rgba(184,160,216,0.18)', borderRadius: 24, padding: '26px 28px',
}

export default function GovernancePage() {
  const [account, setAccount] = useState<Address | null>(null)
  const [meta, setMeta] = useState({ decimals: 18, symbol: 'STARCHILD' })
  const [burn, setBurn] = useState<BurnStats | null>(null)
  const [totalStaked, setTotalStaked] = useState<bigint>(0n)
  const [mine, setMine] = useState<{ amount: bigint; conviction: bigint } | null>(null)
  const [proposals, setProposals] = useState<ProposalView[]>([])
  const [stakeAmt, setStakeAmt] = useState('')
  const [pTitle, setPTitle] = useState(''); const [pDetail, setPDetail] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    const [b, m, ts, ps] = await Promise.all([
      fetchBurnStats().catch(() => null), fetchTokenMeta().catch(() => null),
      stakingDeployed ? fetchTotalStaked().catch(() => 0n) : Promise.resolve(0n),
      fetchProposals().catch(() => [] as ProposalView[]),
    ])
    if (b) setBurn(b); if (m) setMeta(m); setTotalStaked(ts); setProposals(ps)
  }, [])

  const loadMine = useCallback(async (a: Address) => {
    if (!stakingDeployed) return
    setMine(await fetchStakeInfo(a).catch(() => null))
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const connect = useCallback(async () => {
    const inj = getInjected()
    if (!inj) { setMsg('No wallet found — install a Base-compatible wallet.'); return }
    const accts = (await inj.request({ method: 'eth_requestAccounts' })) as string[]
    const a = accts?.[0] as Address; setAccount(a); if (a) loadMine(a)
  }, [loadMine])

  const run = useCallback(async (key: string, fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(key); setMsg(null)
    try { await fn(); if (okMsg) setMsg(okMsg); await loadAll(); if (account) await loadMine(account) }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Failed') }
    finally { setBusy(null) }
  }, [account, loadAll, loadMine])

  const staked = mine?.amount ?? 0n
  const canPropose = staked >= PROPOSE_MIN
  const minHuman = fmt(PROPOSE_MIN, meta.decimals)

  return (
    <main style={{ background: '#000', color: '#fff', minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      <Navbar />
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 70% 50% at 50% -5%, rgba(120,80,180,0.22) 0%, transparent 70%)' }} />

      {/* Hero */}
      <section style={{ position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto', padding: '150px 24px 24px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <VideoPlayer src="/videos/starchild5.webm" className="glow-lavender" style={{ width: 'clamp(150px, 22vw, 230px)', height: 'auto' }} />
        </div>
        <h1 style={{ fontSize: 'clamp(2.1rem, 5vw, 3.4rem)', fontWeight: 300, fontStyle: 'italic', letterSpacing: '-0.01em' }}>Shape what gets built</h1>
        <p style={{ margin: '18px auto 0', maxWidth: 580, lineHeight: 1.65, color: 'rgba(255,255,255,0.62)', fontSize: '1.02rem' }}>
          Stake $STARCHILD to steer the roadmap. Your stake is <em style={{ color: 'rgba(255,255,255,0.85)' }}>locked, never burned</em> — withdraw any time.
          It becomes your weight to vote on what gets built next, and to propose ideas. All votes are free, gasless signatures.
        </p>

        {/* founder burn trust stat */}
        {burn && (
          <p style={{ marginTop: 26, fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
            And the founder has burned{' '}
            <a href={`https://basescan.org/token/${STARCHILD_TOKEN}?a=${DEAD_ADDRESS}`} target="_blank" rel="noreferrer" style={{ color: GOLD, textDecoration: 'underline', textUnderlineOffset: 3 }}>
              {burn.pct.toFixed(2)}% of supply forever
            </a> — and never sells.
          </p>
        )}
      </section>

      <section style={{ position: 'relative', zIndex: 1, maxWidth: 620, margin: '0 auto', padding: '12px 24px 120px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {msg && <p style={{ textAlign: 'center', fontSize: 14, borderRadius: 12, padding: '12px 16px', background: 'rgba(184,160,216,0.1)', color: LAV }}>{msg}</p>}

        {/* Stake panel */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 500 }}>Your stake</h2>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
              {stakingDeployed ? `${fmt(totalStaked, meta.decimals)} ${meta.symbol} staked total` : 'staking goes live soon'}
            </span>
          </div>
          {!stakingDeployed ? (
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>The staking contract isn’t live yet.</p>
          ) : !account ? (
            <Btn onClick={connect}>Connect wallet</Btn>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 24, marginBottom: 18 }}>
                <div><div style={{ fontSize: '1.6rem', fontWeight: 700, color: GOLD }}>{fmt(staked, meta.decimals)}</div>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)' }}>${meta.symbol} staked = your weight</div></div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <input inputMode="decimal" placeholder="Amount" value={stakeAmt} onChange={(e) => setStakeAmt(e.target.value.replace(/[^0-9.]/g, ''))} style={inputStyle} />
                <Btn onClick={() => run('stake', () => stakeTokens(stakeAmt, meta.decimals), 'Staked.')} disabled={!!busy || !stakeAmt}>{busy === 'stake' ? 'Staking…' : 'Stake'}</Btn>
                <Btn kind="ghost" onClick={() => run('unstake', () => unstakeTokens(stakeAmt, meta.decimals), 'Unstaked.')} disabled={!!busy || !stakeAmt || staked === 0n}>{busy === 'unstake' ? 'Unstaking…' : 'Unstake'}</Btn>
              </div>
            </>
          )}
        </div>

        {/* Proposals */}
        <h2 style={{ textAlign: 'center', fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', margin: '10px 0 4px' }}>What gets built next</h2>

        {proposals.length === 0 ? (
          <p style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>No proposals yet — be the first to propose.</p>
        ) : proposals.map((p) => {
          const support = BigInt(p.support)
          return (
            <div key={p.id} style={cardStyle}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 500 }}>{p.title}</h3>
              {p.detail && <p style={{ marginTop: 8, fontSize: '0.92rem', lineHeight: 1.55, color: 'rgba(255,255,255,0.6)' }}>{p.detail}</p>}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                  <span style={{ color: GOLD, fontWeight: 600 }}>{fmt(support, meta.decimals)}</span> {meta.symbol} behind it · {p.voters} voter{p.voters === 1 ? '' : 's'}
                </div>
                <Btn onClick={() => run(`vote-${p.id}`, () => signAndVote(p.id, true), 'Vote signed — thank you.')} disabled={!!busy || !account || staked === 0n}>
                  {busy === `vote-${p.id}` ? 'Signing…' : 'Support'}
                </Btn>
              </div>
            </div>
          )
        })}

        {/* Create proposal */}
        {account && stakingDeployed && (
          <div style={{ ...cardStyle, opacity: canPropose ? 1 : 0.6 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 500, marginBottom: 4 }}>Propose an idea</h2>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 16 }}>
              {canPropose ? 'Sign to submit — gasless.' : `Stake at least ${minHuman} ${meta.symbol} to propose (you have ${fmt(staked, meta.decimals)}).`}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input placeholder="Title" maxLength={100} value={pTitle} onChange={(e) => setPTitle(e.target.value)} style={inputStyle} disabled={!canPropose} />
              <textarea placeholder="What ships when it's funded? (optional)" maxLength={500} value={pDetail} onChange={(e) => setPDetail(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} disabled={!canPropose} />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Btn onClick={() => run('propose', async () => { await signAndPropose(pTitle.trim(), pDetail.trim()); setPTitle(''); setPDetail('') }, 'Proposal submitted.')} disabled={!!busy || !canPropose || !pTitle.trim()}>
                  {busy === 'propose' ? 'Submitting…' : 'Sign & propose'}
                </Btn>
              </div>
            </div>
          </div>
        )}

        <p style={{ marginTop: 16, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>
          Staking locks your tokens (never burns them) and they’re withdrawable any time.{' '}
          {stakingDeployed && <a href={`https://basescan.org/address/${STAKING_ADDRESS}`} target="_blank" rel="noreferrer" style={{ color: LAV, textDecoration: 'underline' }}>Staking contract</a>}
        </p>
      </section>
    </main>
  )
}
