'use client'

/**
 * $STARCHILD — the token world. Lore, live price, the founder's burns, and a
 * stake-to-govern DAO. Transparency-maxxed: every claim links to its receipt.
 * The companion app never touches any of this.
 */
import { useCallback, useEffect, useState } from 'react'
import Navbar from '@/components/Navbar'
import VideoPlayer from '@/components/VideoPlayer'
import {
  fetchBurnStats, fetchTokenMeta, fetchStakeInfo, fetchTotalStaked, fetchStats,
  stakeTokens, unstakeTokens, fetchProposals, signAndPropose, signAndVote,
  getInjected, fmt, basescanTx, stakingDeployed, PROPOSE_MIN,
  STARCHILD_TOKEN, ARTICLES, LINKS,
  type BurnStats, type ProposalView, type Stats,
} from '@/lib/burnGoals'
import { type Address } from 'viem'

const LAV = '#b8a0d8', GOLD = '#e8d8a8'

const card: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(26,21,37,0.7), rgba(14,11,22,0.7))',
  border: '1px solid rgba(184,160,216,0.18)', borderRadius: 24, padding: '26px 28px',
}
const inputStyle: React.CSSProperties = {
  flex: 1, borderRadius: 12, padding: '11px 14px', fontSize: 14, color: '#fff', width: '100%',
  background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(184,160,216,0.22)', outline: 'none',
}
const eyebrow: React.CSSProperties = {
  textAlign: 'center', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.4)', marginBottom: 8,
}
const link = { color: LAV, textDecoration: 'underline', textUnderlineOffset: 3 } as const

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

function usd(n: number | null): string {
  if (n == null) return '—'
  return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}
function priceFmt(p: string | null): string {
  if (!p) return '—'
  const n = Number(p)
  if (!isFinite(n) || n === 0) return '—'
  return '$' + n.toLocaleString(undefined, { maximumSignificantDigits: 3, maximumFractionDigits: 12 })
}

function Stat({ label, value, href }: { label: string; value: string; href?: string }) {
  const inner = (
    <>
      <div style={{ fontSize: 'clamp(1.1rem,2.4vw,1.5rem)', fontWeight: 700, color: GOLD }}>{value}</div>
      <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{label}</div>
    </>
  )
  return href
    ? <a href={href} target="_blank" rel="noreferrer" style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}>{inner}</a>
    : <div style={{ textAlign: 'center' }}>{inner}</div>
}

export default function TokenPage() {
  const [account, setAccount] = useState<Address | null>(null)
  const [meta, setMeta] = useState({ decimals: 18, symbol: 'STARCHILD' })
  const [burn, setBurn] = useState<BurnStats | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [totalStaked, setTotalStaked] = useState<bigint>(0n)
  const [mine, setMine] = useState<{ amount: bigint; conviction: bigint } | null>(null)
  const [proposals, setProposals] = useState<ProposalView[]>([])
  const [stakeAmt, setStakeAmt] = useState('')
  const [pTitle, setPTitle] = useState(''); const [pDetail, setPDetail] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    const [b, m, ts, ps, st] = await Promise.all([
      fetchBurnStats().catch(() => null), fetchTokenMeta().catch(() => null),
      stakingDeployed ? fetchTotalStaked().catch(() => 0n) : Promise.resolve(0n),
      fetchProposals().catch(() => [] as ProposalView[]),
      fetchStats().catch(() => null),
    ])
    if (b) setBurn(b); if (m) setMeta(m); setTotalStaked(ts); setProposals(ps); if (st) setStats(st)
  }, [])
  const loadMine = useCallback(async (a: Address) => { if (stakingDeployed) setMine(await fetchStakeInfo(a).catch(() => null)) }, [])

  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => { // live feel — refresh price + burns every 30s
    const id = setInterval(() => { fetchStats().then(setStats).catch(() => {}) }, 30000)
    return () => clearInterval(id)
  }, [])

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

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 660, margin: '0 auto', padding: '0 24px' }}>

        {/* ── Hero ── */}
        <section style={{ paddingTop: 140, textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
            <VideoPlayer src="/videos/starchild5.webm" className="glow-lavender" style={{ width: 'clamp(140px, 20vw, 210px)', height: 'auto' }} />
          </div>
          <h1 style={{ fontSize: 'clamp(2rem,5vw,3.2rem)', fontWeight: 300, fontStyle: 'italic' }}>$STARCHILD</h1>
          <p style={{ margin: '14px auto 0', maxWidth: 520, lineHeight: 1.6, color: 'rgba(255,255,255,0.6)' }}>
            The token funds the mission — <em style={{ color: '#fff' }}>never the product</em>. The companion stays private,
            local & free. This is the commons around it: the burns, the lore, and the DAO that steers what gets built next.
          </p>
          <div style={{ marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderRadius: 999,
            border: '1px solid rgba(184,160,216,0.25)', background: 'rgba(184,160,216,0.08)' }}>
            <span style={{ fontWeight: 700, color: GOLD }}>{priceFmt(stats?.price ?? null)}</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>per ${meta.symbol}</span>
            {stats?.chartUrl && <a href={stats.chartUrl} target="_blank" rel="noreferrer" style={{ ...link, fontSize: 12 }}>chart ↗</a>}
          </div>
        </section>

        {/* ── Live stats ── */}
        <section style={{ marginTop: 44 }}>
          <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 22, padding: '22px 24px' }}>
            <Stat label="market cap" value={usd(stats?.marketCap ?? null)} href={stats?.chartUrl ?? undefined} />
            <Stat label="liquidity" value={usd(stats?.liquidity ?? null)} />
            <Stat label="24h volume" value={usd(stats?.volume24h ?? null)} />
            <Stat label="supply burned" value={burn ? `${burn.pct.toFixed(2)}%` : '—'} href={LINKS.token} />
          </div>
        </section>

        {msg && <p style={{ marginTop: 22, textAlign: 'center', fontSize: 14, borderRadius: 12, padding: '12px 16px', background: 'rgba(184,160,216,0.1)', color: LAV }}>{msg}</p>}

        {/* ── Lore / the founder's articles ── */}
        <section style={{ marginTop: 64 }}>
          <p style={eyebrow}>the story, in his own words</p>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.4rem,3vw,2rem)', fontWeight: 300, fontStyle: 'italic', marginBottom: 10 }}>an opinion that changed in public</h2>
          <p style={{ textAlign: 'center', maxWidth: 520, margin: '0 auto 26px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, fontSize: '0.95rem' }}>
            Someone minted a token for the Starchild. The founder first refused the fees — he wanted the product and the
            market kept apart. 80 days later his mind changed: he claimed, burned <em style={{ color: '#fff' }}>every token he owned</em>,
            kept only the ETH to keep building, and built this. The whole arc is public.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ARTICLES.map((a) => (
              <a key={a.url} href={a.url} target="_blank" rel="noreferrer"
                style={{ ...card, padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, textDecoration: 'none', color: '#fff' }}>
                <div>
                  <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: LAV, marginBottom: 4 }}>{a.tag}</div>
                  <div style={{ fontSize: '1.02rem', fontWeight: 500 }}>{a.title}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{a.blurb}</div>
                </div>
                <span style={{ ...link, fontSize: 13, whiteSpace: 'nowrap' }}>read on X ↗</span>
              </a>
            ))}
          </div>
        </section>

        {/* ── The burns ── */}
        <section style={{ marginTop: 64 }}>
          <p style={eyebrow}>the receipts</p>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.4rem,3vw,2rem)', fontWeight: 300, fontStyle: 'italic', marginBottom: 6 }}>every token the founder burned</h2>
          <p style={{ textAlign: 'center', maxWidth: 500, margin: '0 auto 24px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, fontSize: '0.95rem' }}>
            He holds <em style={{ color: '#fff' }}>zero</em>, and never sells. {burn ? `${fmt(burn.burned, burn.decimals)} ${meta.symbol} — ${burn.pct.toFixed(2)}% of supply — gone forever.` : ''} Don&apos;t trust it; check the chain.
          </p>
          <div style={card}>
            {!stats || stats.burns.length === 0 ? (
              <p style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Loading burns…</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {stats.burns.map((b, i) => (
                  <a key={b.hash} href={basescanTx(b.hash)} target="_blank" rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 4px',
                      borderTop: i ? '1px solid rgba(255,255,255,0.06)' : 'none', textDecoration: 'none', color: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span>🔥</span>
                      <div>
                        <div style={{ fontWeight: 600, color: GOLD }}>{fmt(BigInt(b.amount), meta.decimals)} {meta.symbol}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{b.timestamp?.slice(0, 10)}</div>
                      </div>
                    </div>
                    <span style={{ ...link, fontSize: 12, fontFamily: 'monospace' }}>{b.hash.slice(0, 10)}… ↗</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── How the DAO works ── */}
        <section style={{ marginTop: 64 }}>
          <p style={eyebrow}>how this works — and how to verify it</p>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.4rem,3vw,2rem)', fontWeight: 300, fontStyle: 'italic', marginBottom: 24 }}>stake to govern. nothing burns.</h2>
          <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 18, lineHeight: 1.6, color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem' }}>
            <p><strong style={{ color: '#fff' }}>1. Stake.</strong> Lock $STARCHILD in the staking contract — it&apos;s <em style={{ color: '#fff' }}>never burned</em>, and you can withdraw the full amount any time. Your stake is your voting weight; the longer you hold it, the more conviction it earns.</p>
            <p><strong style={{ color: '#fff' }}>2. Propose.</strong> Stake at least {minHuman} {meta.symbol} and you can submit an idea by <em style={{ color: '#fff' }}>signing a message</em> — no gas, nothing spent. The signature is verified and weighted against your live on-chain stake.</p>
            <p><strong style={{ color: '#fff' }}>3. Vote.</strong> Any staker supports proposals with a gasless signature, weighted by their current stake. Unstake and your weight leaves with you — votes can&apos;t be cast then withdrawn for free.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 4, fontSize: 13 }}>
              <a href={LINKS.stakingContract} target="_blank" rel="noreferrer" style={link}>staking contract ↗</a>
              <a href={LINKS.stakingSource} target="_blank" rel="noreferrer" style={link}>staking source ↗</a>
              <a href={LINKS.govSource} target="_blank" rel="noreferrer" style={link}>governance code ↗</a>
              <a href={LINKS.burnContract} target="_blank" rel="noreferrer" style={link}>burn contract ↗</a>
              <a href={LINKS.repo} target="_blank" rel="noreferrer" style={link}>full repo ↗</a>
            </div>
          </div>
        </section>

        {/* ── Your stake ── */}
        <section style={{ marginTop: 64 }}>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 500 }}>Your stake</h2>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{stakingDeployed ? `${fmt(totalStaked, meta.decimals)} ${meta.symbol} staked total` : 'staking soon'}</span>
            </div>
            {!stakingDeployed ? <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>Not live yet.</p>
              : !account ? <Btn onClick={connect}>Connect wallet</Btn>
              : (
                <>
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 700, color: GOLD }}>{fmt(staked, meta.decimals)}</div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)' }}>${meta.symbol} staked = your weight</div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input inputMode="decimal" placeholder="Amount" value={stakeAmt} onChange={(e) => setStakeAmt(e.target.value.replace(/[^0-9.]/g, ''))} style={inputStyle} />
                    <Btn onClick={() => run('stake', () => stakeTokens(stakeAmt, meta.decimals), 'Staked.')} disabled={!!busy || !stakeAmt}>{busy === 'stake' ? 'Staking…' : 'Stake'}</Btn>
                    <Btn kind="ghost" onClick={() => run('unstake', () => unstakeTokens(stakeAmt, meta.decimals), 'Unstaked.')} disabled={!!busy || !stakeAmt || staked === 0n}>{busy === 'unstake' ? '…' : 'Unstake'}</Btn>
                  </div>
                </>
              )}
          </div>
        </section>

        {/* ── Proposals ── */}
        <section style={{ marginTop: 56 }}>
          <p style={eyebrow}>what gets built next</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {proposals.length === 0 ? (
              <p style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>No proposals yet — be the first.</p>
            ) : proposals.map((p) => (
              <div key={p.id} style={card}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 500 }}>{p.title}</h3>
                {p.detail && <p style={{ marginTop: 8, fontSize: '0.92rem', lineHeight: 1.55, color: 'rgba(255,255,255,0.6)' }}>{p.detail}</p>}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, gap: 12 }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                    <span style={{ color: GOLD, fontWeight: 600 }}>{fmt(BigInt(p.support), meta.decimals)}</span> {meta.symbol} · {p.voters} voter{p.voters === 1 ? '' : 's'}
                  </div>
                  <Btn onClick={() => run(`vote-${p.id}`, () => signAndVote(p.id, true), 'Vote signed — thank you.')} disabled={!!busy || !account || staked === 0n}>
                    {busy === `vote-${p.id}` ? 'Signing…' : 'Support'}
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Propose (with the disclaimer) ── */}
        <section style={{ marginTop: 28, marginBottom: 100 }}>
          <div style={{ ...card, opacity: account && canPropose ? 1 : 0.85 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 500, marginBottom: 12 }}>Propose an idea</h2>
            <div style={{ borderRadius: 14, padding: '14px 16px', marginBottom: 16, background: 'rgba(232,216,168,0.07)', border: '1px solid rgba(232,216,168,0.25)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: GOLD, marginBottom: 6 }}>before you propose ✦</div>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,0.7)' }}>
                Make sure your idea is a <em style={{ color: '#fff' }}>utility for the commons</em>, not a change to the core product.
                The companion stays private, local, free, and <em style={{ color: '#fff' }}>never token-gated</em>. Good proposals fund or
                extend the open-source mission from the <em style={{ color: '#fff' }}>outside</em> — they never make the app depend on the token.
              </p>
            </div>
            {!account ? <Btn onClick={connect}>Connect wallet to propose</Btn> : (
              <>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 14 }}>
                  {canPropose ? 'Sign to submit — gasless.' : `Stake at least ${minHuman} ${meta.symbol} to propose (you have ${fmt(staked, meta.decimals)}).`}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input placeholder="Title" maxLength={100} value={pTitle} onChange={(e) => setPTitle(e.target.value)} style={inputStyle} disabled={!canPropose} />
                  <textarea placeholder="What it is, and why it doesn't touch the core product (optional)" maxLength={500} value={pDetail} onChange={(e) => setPDetail(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} disabled={!canPropose} />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Btn onClick={() => run('propose', async () => { await signAndPropose(pTitle.trim(), pDetail.trim()); setPTitle(''); setPDetail('') }, 'Proposal submitted.')} disabled={!!busy || !canPropose || !pTitle.trim()}>
                      {busy === 'propose' ? 'Submitting…' : 'Sign & propose'}
                    </Btn>
                  </div>
                </div>
              </>
            )}
            <p style={{ marginTop: 18, fontSize: 12, color: 'rgba(255,255,255,0.35)', textAlign: 'center', lineHeight: 1.6 }}>
              Staking locks tokens (never burns them), withdrawable any time ·{' '}
              <a href={LINKS.stakingContract} target="_blank" rel="noreferrer" style={link}>verify the contract</a>
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
