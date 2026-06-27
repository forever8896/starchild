'use client'

/**
 * token.starchild.software/access — lock $STARCHILD → claim a private Starchild
 * inference key (docs/inference-access-spec.md). The lock is on-chain; the claim
 * mints a capped, expiring Venice key the holder pastes into the Starchild app.
 * The app then talks to Venice directly (E2EE) — this site is never in the
 * conversation path. Locking never costs your vote (weight = balance + locked).
 */
import { useCallback, useEffect, useState } from 'react'
import Navbar from '@/components/Navbar'
import { LAV, GOLD, card, inputStyle, eyebrow, h2, lead, link, i, Star, Btn } from '@/components/ui'
import { getInjected, fmt } from '@/lib/burnGoals'
import {
  LOCK_LIVE, MIN_LOCK_TOKENS, DURATION_PRESETS, capUsdForAmount,
  approveAndLock, signClaim, claimKey,
} from '@/lib/access'
import { type Address, parseUnits } from 'viem'

type Status = { amount: bigint; unlockAt: number; dailyCapUsd: number; hasKey: boolean }

export default function AccessPage() {
  const [account, setAccount] = useState<Address | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [amount, setAmount] = useState('10000000')
  const [days, setDays] = useState<number>(30)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [claimedKey, setClaimedKey] = useState<string | null>(null)

  const loadStatus = useCallback(async (a: Address) => {
    try {
      const r = await fetch(`/api/access/status?wallet=${a}`)
      const j = await r.json()
      setStatus({ amount: BigInt(j.amount ?? '0'), unlockAt: j.unlockAt ?? 0, dailyCapUsd: j.dailyCapUsd ?? 0, hasKey: !!j.hasKey })
    } catch { /* leave status null */ }
  }, [])

  const connect = useCallback(async () => {
    const inj = getInjected()
    if (!inj) { setMsg("I couldn't find a wallet — install a Base-compatible one to lock."); return }
    const accts = (await inj.request({ method: 'eth_requestAccounts' })) as string[]
    const a = accts?.[0] as Address; setAccount(a); if (a) loadStatus(a)
  }, [loadStatus])

  useEffect(() => { if (account) loadStatus(account) }, [account, loadStatus])

  const run = useCallback(async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setMsg(null)
    try { await fn(); if (account) await loadStatus(account) }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setBusy(null) }
  }, [account, loadStatus])

  const doLock = () =>
    run('lock', async () => {
      if (!account) throw new Error('Connect a wallet first')
      const wei = parseUnits(amount || '0', 18)
      if (wei < MIN_LOCK_TOKENS * 10n ** 18n) throw new Error(`Minimum lock is ${MIN_LOCK_TOKENS.toLocaleString()} $STARCHILD`)
      await approveAndLock(account, wei, days)
      setMsg('Locked. You can claim your key below.')
    })

  const doClaim = () =>
    run('claim', async () => {
      if (!account) throw new Error('Connect a wallet first')
      const { nonce, deadline, signature } = await signClaim(account)
      const { key, dailyCapUsd, expiresAt } = await claimKey({ wallet: account, nonce, deadline, signature })
      setClaimedKey(key)
      setMsg(`Key minted — $${dailyCapUsd}/day, expires ${new Date(expiresAt).toLocaleDateString()}.`)
    })

  const now = Math.floor(Date.now() / 1000)
  const locked = status && status.amount > 0n && status.unlockAt > now
  const projectedCap = (() => { try { return capUsdForAmount(parseUnits(amount || '0', 18)) } catch { return 0 } })()

  return (
    <main style={{ background: '#000', color: '#fff', minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      <Navbar />
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 85% 55% at 50% -6%, rgba(120,80,180,0.30) 0%, transparent 66%)' }} />
      <div aria-hidden className="starfield slow" />
      <div aria-hidden className="starfield" />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 660, margin: '0 auto', padding: '0 24px 120px' }}>
        <section className="fade-up" style={{ paddingTop: 128, textAlign: 'center' }}>
          <p style={{ ...eyebrow, marginBottom: 16 }}>the commons · lock $STARCHILD, get a private key</p>
          <h1 style={{ fontSize: 'clamp(2rem,5vw,3.1rem)', fontWeight: 300, fontStyle: 'italic', lineHeight: 1.15 }}>
            free, private Starchild inference
          </h1>
          <p style={{ ...lead, marginTop: 18 }}>
            Lock $STARCHILD and receive a {i('Starchild access key')} — a Venice inference key, {i('capped and expiring with your lock')}.
            Paste it into the app and talk to your Starchild for free. Conversations stay {i('end-to-end encrypted')} between you and Venice;
            this site never sees them. The app is always free with your own key — this is a funded convenience, never a gate.
          </p>
        </section>

        <Star />

        {!LOCK_LIVE && (
          <div style={{ ...card, textAlign: 'center', borderColor: 'rgba(232,216,168,0.35)' }}>
            <p style={lead}>The lock contract isn&apos;t live yet. Check back soon — or use the app today with your own Venice key.</p>
          </div>
        )}

        {LOCK_LIVE && !account && (
          <div style={{ textAlign: 'center' }}>
            <Btn onClick={connect}>Connect wallet</Btn>
          </div>
        )}

        {LOCK_LIVE && account && (
          <div style={{ display: 'grid', gap: 20 }}>
            {/* Current lock */}
            <div style={card}>
              <p style={eyebrow}>your lock</p>
              {locked ? (
                <p style={{ ...lead, marginTop: 8 }}>
                  {fmt(status!.amount, 18)} $STARCHILD locked · unlocks {new Date(status!.unlockAt * 1000).toLocaleDateString()} ·
                  cap {i(`$${status!.dailyCapUsd}/day`)}{status!.hasKey ? ' · key issued' : ''}
                </p>
              ) : (
                <p style={{ ...lead, marginTop: 8, opacity: 0.8 }}>No active lock yet.</p>
              )}
            </div>

            {/* Lock form */}
            <div style={card}>
              <p style={h2}>{locked ? 'Add to / extend your lock' : 'Lock $STARCHILD'}</p>
              <label style={{ ...eyebrow, display: 'block', marginTop: 14 }}>amount ($STARCHILD)</label>
              <input style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric" placeholder={MIN_LOCK_TOKENS.toString()} />
              <label style={{ ...eyebrow, display: 'block', marginTop: 14 }}>duration</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                {DURATION_PRESETS.map((d) => (
                  <button key={d} onClick={() => setDays(d)} style={{
                    padding: '8px 14px', borderRadius: 10, fontSize: 13, cursor: 'pointer',
                    border: `1px solid ${days === d ? LAV : 'rgba(184,160,216,0.3)'}`,
                    background: days === d ? 'rgba(184,160,216,0.15)' : 'transparent', color: '#fff',
                  }}>{d} days</button>
                ))}
              </div>
              <p style={{ ...lead, fontSize: 14, marginTop: 14, opacity: 0.85 }}>
                Projected cap: {i(projectedCap > 0 ? `$${projectedCap}/day` : 'below minimum')} · the lock duration is the access duration.
              </p>
              <div style={{ marginTop: 16 }}>
                <Btn onClick={doLock} disabled={busy !== null}>{busy === 'lock' ? 'Locking…' : 'Approve & lock'}</Btn>
              </div>
            </div>

            {/* Claim */}
            {locked && (
              <div style={card}>
                <p style={h2}>Claim your access key</p>
                <p style={{ ...lead, fontSize: 14, marginTop: 8, opacity: 0.85 }}>
                  Sign a free message to prove this wallet, and we&apos;ll mint your key.
                </p>
                <div style={{ marginTop: 14 }}>
                  <Btn onClick={doClaim} disabled={busy !== null}>{busy === 'claim' ? 'Minting…' : 'Sign & claim key'}</Btn>
                </div>
                {claimedKey && (
                  <div style={{ marginTop: 16 }}>
                    <label style={{ ...eyebrow, display: 'block' }}>your Starchild access key (copy it now)</label>
                    <textarea readOnly value={claimedKey} onFocus={(e) => e.currentTarget.select()}
                      style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 13, height: 64, resize: 'none' }} />
                    <p style={{ ...lead, fontSize: 14, marginTop: 10 }}>
                      Paste it into Starchild → {i('Settings → Venice key')}. That&apos;s it — you&apos;re running on a funded, private key.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {msg && <p style={{ ...lead, fontSize: 14, marginTop: 20, textAlign: 'center', color: GOLD }}>{msg}</p>}

        <Star />
        <p style={{ ...lead, fontSize: 13, opacity: 0.7, textAlign: 'center' }}>
          Locking never costs your vote — governance weight counts locked tokens too. Withdraw your tokens any time after the lock
          expires (the key has already expired by then). See the <a href="/dao" style={link}>commons</a>.
        </p>
      </div>
    </main>
  )
}
