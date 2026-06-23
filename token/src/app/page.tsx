'use client'

/**
 * token.starchild.software — written in the first person, by me (Kilian).
 * The companion is private, local and free; this is the commons around it.
 */
import { useCallback, useEffect, useState } from 'react'
import Navbar from '@/components/Navbar'
import VideoPlayer from '@/components/VideoPlayer'
import {
  fetchBurnStats, fetchTokenMeta, fetchStakeInfo, fetchTotalStaked, fetchStats,
  stakeTokens, unstakeTokens, fetchProposals, signAndPropose, signAndVote,
  getInjected, fmt, basescanTx, stakingDeployed, PROPOSE_MIN,
  ARTICLES, LINKS,
  type BurnStats, type ProposalView, type Stats,
} from '@/lib/burnGoals'
import { type Address } from 'viem'

const LAV = '#b8a0d8', GOLD = '#e8d8a8'

const card: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(26,21,37,0.6), rgba(12,10,20,0.6))',
  border: '1px solid rgba(184,160,216,0.16)', borderRadius: 24, padding: '26px 28px',
}
const inputStyle: React.CSSProperties = {
  flex: 1, borderRadius: 12, padding: '11px 14px', fontSize: 14, color: '#fff', width: '100%',
  background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(184,160,216,0.22)', outline: 'none',
}
const eyebrow: React.CSSProperties = {
  textAlign: 'center', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase',
  color: 'rgba(184,160,216,0.65)', marginBottom: 14, fontWeight: 600,
}
const h2: React.CSSProperties = {
  textAlign: 'center', fontSize: 'clamp(1.7rem,3.6vw,2.5rem)', fontWeight: 300, fontStyle: 'italic',
  lineHeight: 1.2, color: '#fff', marginBottom: 18,
}
const lead: React.CSSProperties = {
  textAlign: 'center', maxWidth: 540, margin: '0 auto', color: 'rgba(255,255,255,0.6)',
  lineHeight: 1.75, fontSize: '1rem',
}
const link = { color: LAV, textDecoration: 'underline', textUnderlineOffset: 3 } as const
const i = (s: React.ReactNode) => <em style={{ color: '#fff', fontStyle: 'normal' }}>{s}</em>

function Star() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '72px 0' }}>
      <span className="star-pulse" style={{ color: GOLD, fontSize: 22, filter: 'drop-shadow(0 0 14px rgba(232,216,168,0.6))' }}>✦</span>
    </div>
  )
}

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
  return n == null ? '—' : '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}
function priceFmt(p: string | null): string {
  const n = Number(p)
  if (!p || !isFinite(n) || n === 0) return '—'
  return '$' + n.toLocaleString(undefined, { maximumSignificantDigits: 3, maximumFractionDigits: 12 })
}

function Stat({ label, value, href }: { label: string; value: string; href?: string }) {
  const inner = (
    <>
      <div style={{ fontSize: 'clamp(1.1rem,2.4vw,1.45rem)', fontWeight: 700, color: GOLD }}>{value}</div>
      <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginTop: 5 }}>{label}</div>
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
  useEffect(() => {
    const id = setInterval(() => { fetchStats().then(setStats).catch(() => {}) }, 30000)
    return () => clearInterval(id)
  }, [])

  const connect = useCallback(async () => {
    const inj = getInjected()
    if (!inj) { setMsg('I couldn\'t find a wallet — install a Base-compatible one to take part.'); return }
    const accts = (await inj.request({ method: 'eth_requestAccounts' })) as string[]
    const a = accts?.[0] as Address; setAccount(a); if (a) loadMine(a)
  }, [loadMine])

  const run = useCallback(async (key: string, fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(key); setMsg(null)
    try { await fn(); if (okMsg) setMsg(okMsg); await loadAll(); if (account) await loadMine(account) }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setBusy(null) }
  }, [account, loadAll, loadMine])

  const staked = mine?.amount ?? 0n
  const canPropose = staked >= PROPOSE_MIN
  const minHuman = fmt(PROPOSE_MIN, meta.decimals)

  return (
    <main style={{ background: '#000', color: '#fff', minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      <Navbar />
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 80% 50% at 50% -8%, rgba(120,80,180,0.26) 0%, transparent 68%)' }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 660, margin: '0 auto', padding: '0 24px' }}>

        {/* ── Hero ── */}
        <section className="fade-up" style={{ paddingTop: 132, textAlign: 'center' }}>
          <div className="drift" style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
            <VideoPlayer src="/videos/starchild5.webm" className="glow-lavender" style={{ width: 'clamp(150px, 22vw, 230px)', height: 'auto' }} />
          </div>
          <p style={{ ...eyebrow, marginBottom: 16 }}>the commons around the starchild</p>
          <h1 style={{ fontSize: 'clamp(2.2rem,5.2vw,3.4rem)', fontWeight: 300, fontStyle: 'italic', letterSpacing: '-0.01em' }}>$STARCHILD</h1>
          <p style={{ ...lead, marginTop: 18 }}>
            I&apos;ll be honest with you first: this token is {i('not')} the product. The companion is private, local,
            and free, and it always will be. What lives here is everything that grew up {i('around')} it — the burns,
            the things I&apos;ve written, and a real say in what I build next. None of it can ever reach into the app.
          </p>
          <div style={{ marginTop: 22, display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderRadius: 999,
            border: '1px solid rgba(184,160,216,0.25)', background: 'rgba(184,160,216,0.07)' }}>
            <span style={{ fontWeight: 700, color: GOLD }}>{priceFmt(stats?.price ?? null)}</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>per ${meta.symbol}</span>
            {stats?.chartUrl && <a href={stats.chartUrl} target="_blank" rel="noreferrer" style={{ ...link, fontSize: 12 }}>chart ↗</a>}
          </div>

          <div style={{ ...card, marginTop: 40, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 22, padding: '22px 24px' }}>
            <Stat label="market cap" value={usd(stats?.marketCap ?? null)} href={stats?.chartUrl ?? undefined} />
            <Stat label="liquidity" value={usd(stats?.liquidity ?? null)} />
            <Stat label="24h volume" value={usd(stats?.volume24h ?? null)} />
          </div>
        </section>

        {msg && <p style={{ marginTop: 24, textAlign: 'center', fontSize: 14, borderRadius: 12, padding: '12px 16px', background: 'rgba(184,160,216,0.1)', color: LAV }}>{msg}</p>}

        <Star />

        {/* ── Lore: the real posts, embedded ── */}
        <section>
          <p style={eyebrow}>i&apos;ve changed my mind in public</p>
          <h2 style={h2}>everything I&apos;ve said about this token</h2>
          <p style={lead}>
            I didn&apos;t make this token — someone else did. I spent weeks certain I shouldn&apos;t touch it. Then I
            changed my mind, claimed it, and burned all of it. I never edited any of that. Here it is, in order, in my
            own words:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 38 }}>
            {ARTICLES.map((a, idx) => (
              <a key={a.id} href={a.url} target="_blank" rel="noreferrer"
                style={{ ...card, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20, textDecoration: 'none', color: '#fff' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 600, fontStyle: 'italic', color: LAV, opacity: 0.45, minWidth: 32, textAlign: 'center' }}>{['I', 'II', 'III', 'IV'][idx]}</span>
                <span style={{ flex: 1, fontSize: '1.05rem', color: 'rgba(255,255,255,0.92)' }}>{a.label}</span>
                <span style={{ color: LAV, fontSize: 13, whiteSpace: 'nowrap' }}>read on X ↗</span>
              </a>
            ))}
          </div>
        </section>

        <Star />

        {/* ── The burns ── */}
        <section>
          <p style={eyebrow}>the burns</p>
          <h2 style={h2}>what I was given, I burned</h2>
          <p style={{ ...lead, marginBottom: 28 }}>
            I didn&apos;t make this token and I don&apos;t hold any of it. Whatever I was handed went to a dead address;
            I keep only the ETH from fees, to keep the work going. Nothing here needs to be taken on faith — every line
            is a transaction you can open:
          </p>
          <div style={card}>
            {!stats || stats.burns.length === 0 ? (
              <p style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Loading burns…</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {stats.burns.map((b, idx) => (
                  <a key={b.hash} href={basescanTx(b.hash)} target="_blank" rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 4px',
                      borderTop: idx ? '1px solid rgba(255,255,255,0.06)' : 'none', textDecoration: 'none', color: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{ opacity: 0.7 }}>🔥</span>
                      <div>
                        <div style={{ fontWeight: 500 }}>{fmt(BigInt(b.amount), meta.decimals)} {meta.symbol}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.42)' }}>{b.timestamp?.slice(0, 10)}</div>
                      </div>
                    </div>
                    <span style={{ ...link, fontSize: 12, fontFamily: 'monospace' }}>{b.hash.slice(0, 10)}… ↗</span>
                  </a>
                ))}
              </div>
            )}
          </div>
          {burn && (
            <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
              {fmt(burn.burned, burn.decimals)} {meta.symbol} burned so far · {burn.pct.toFixed(2)}% of supply
            </p>
          )}
        </section>

        <Star />

        {/* ── How the DAO works ── */}
        <section>
          <p style={eyebrow}>have a say</p>
          <h2 style={h2}>stake to steer. nothing burns.</h2>
          <p style={{ ...lead, marginBottom: 26 }}>
            If you&apos;re holding, you can help decide what I build next. You stake — which just {i('locks')} your
            tokens, never burns them, and you can pull them back whenever you like — and that stake becomes your voice.
          </p>
          <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 18, lineHeight: 1.7, color: 'rgba(255,255,255,0.72)', fontSize: '0.96rem' }}>
            <p><strong style={{ color: '#fff' }}>1 · Stake.</strong> Lock $STARCHILD in the staking contract. It&apos;s never burned, and it&apos;s yours to withdraw anytime. The longer you hold it staked, the more conviction it gathers.</p>
            <p><strong style={{ color: '#fff' }}>2 · Propose.</strong> With {minHuman} {meta.symbol} staked you can put an idea forward — by {i('signing a message')}. No gas, nothing spent. I check the signature against your live stake.</p>
            <p><strong style={{ color: '#fff' }}>3 · Vote.</strong> Any staker backs a proposal with a gasless signature, weighted by their stake. Unstake and your weight leaves with you — so you can&apos;t vote and then quietly pull out for free.</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
              I&apos;d honestly rather you didn&apos;t trust me. Read it:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 13 }}>
              <a href={LINKS.stakingContract} target="_blank" rel="noreferrer" style={link}>staking contract ↗</a>
              <a href={LINKS.stakingSource} target="_blank" rel="noreferrer" style={link}>its source ↗</a>
              <a href={LINKS.govSource} target="_blank" rel="noreferrer" style={link}>the voting code ↗</a>
              <a href={LINKS.burnContract} target="_blank" rel="noreferrer" style={link}>burn contract ↗</a>
              <a href={LINKS.repo} target="_blank" rel="noreferrer" style={link}>everything ↗</a>
            </div>
          </div>
        </section>

        {/* ── Your stake ── */}
        <section style={{ marginTop: 30 }}>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 500 }}>Your stake</h3>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{stakingDeployed ? `${fmt(totalStaked, meta.decimals)} ${meta.symbol} staked in total` : 'staking soon'}</span>
            </div>
            {!stakingDeployed ? <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>Not live yet.</p>
              : !account ? <Btn onClick={connect}>Connect wallet</Btn>
              : (
                <>
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 700, color: GOLD }}>{fmt(staked, meta.decimals)}</div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)' }}>${meta.symbol} staked — your voice</div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input inputMode="decimal" placeholder="Amount" value={stakeAmt} onChange={(e) => setStakeAmt(e.target.value.replace(/[^0-9.]/g, ''))} style={inputStyle} />
                    <Btn onClick={() => run('stake', () => stakeTokens(stakeAmt, meta.decimals), 'Staked. Your voice counts now.')} disabled={!!busy || !stakeAmt}>{busy === 'stake' ? 'Staking…' : 'Stake'}</Btn>
                    <Btn kind="ghost" onClick={() => run('unstake', () => unstakeTokens(stakeAmt, meta.decimals), 'Unstaked.')} disabled={!!busy || !stakeAmt || staked === 0n}>{busy === 'unstake' ? '…' : 'Unstake'}</Btn>
                  </div>
                </>
              )}
          </div>
        </section>

        {/* ── Proposals ── */}
        <section style={{ marginTop: 52 }}>
          <p style={eyebrow}>what I build next</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {proposals.length === 0 ? (
              <p style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Nothing proposed yet — you could be first.</p>
            ) : proposals.map((p) => (
              <div key={p.id} style={card}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 500 }}>{p.title}</h3>
                {p.detail && <p style={{ marginTop: 8, fontSize: '0.92rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.6)' }}>{p.detail}</p>}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, gap: 12 }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                    <span style={{ color: GOLD, fontWeight: 600 }}>{fmt(BigInt(p.support), meta.decimals)}</span> {meta.symbol} · {p.voters} voter{p.voters === 1 ? '' : 's'}
                  </div>
                  <Btn onClick={() => run(`vote-${p.id}`, () => signAndVote(p.id, true), 'Signed — thank you.')} disabled={!!busy || !account || staked === 0n}>
                    {busy === `vote-${p.id}` ? 'Signing…' : 'Back it'}
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Propose (with the disclaimer) ── */}
        <section style={{ marginTop: 26, marginBottom: 110 }}>
          <div style={{ ...card, opacity: account && canPropose ? 1 : 0.9 }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 500, marginBottom: 14 }}>Put an idea forward</h3>
            <div style={{ borderRadius: 14, padding: '15px 17px', marginBottom: 18, background: 'rgba(232,216,168,0.06)', border: '1px solid rgba(232,216,168,0.25)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: GOLD, marginBottom: 7 }}>one thing I ask ✦</div>
              <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'rgba(255,255,255,0.72)' }}>
                Before you propose, make sure your idea couldn&apos;t quietly become a {i('leash on the product')}. The
                companion stays private, local, free, and never needs the token. The best ideas extend the mission from
                the {i('outside')} — they fund it, grow it, give back to the people building with me. They never make the
                app depend on this.
              </p>
            </div>
            {!account ? <Btn onClick={connect}>Connect wallet to propose</Btn> : (
              <>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 14 }}>
                  {canPropose ? 'Sign to put it forward — gasless.' : `You need ${minHuman} ${meta.symbol} staked to propose (you have ${fmt(staked, meta.decimals)}).`}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input placeholder="Your idea, in a line" maxLength={100} value={pTitle} onChange={(e) => setPTitle(e.target.value)} style={inputStyle} disabled={!canPropose} />
                  <textarea placeholder="How it works — and why it never touches the core product (optional)" maxLength={500} value={pDetail} onChange={(e) => setPDetail(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} disabled={!canPropose} />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Btn onClick={() => run('propose', async () => { await signAndPropose(pTitle.trim(), pDetail.trim()); setPTitle(''); setPDetail('') }, 'It\'s up. Thank you for thinking with me.')} disabled={!!busy || !canPropose || !pTitle.trim()}>
                      {busy === 'propose' ? 'Submitting…' : 'Sign & propose'}
                    </Btn>
                  </div>
                </div>
              </>
            )}
          </div>
          <p style={{ marginTop: 28, fontSize: 12, color: 'rgba(255,255,255,0.35)', textAlign: 'center', lineHeight: 1.7 }}>
            the companion lives at <a href="https://starchild.software" style={link}>starchild.software</a> — private, local, free.<br />
            this is only the commons around it. ✦
          </p>
        </section>
      </div>
    </main>
  )
}
