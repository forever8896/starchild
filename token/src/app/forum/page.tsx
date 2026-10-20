'use client'

/**
 * token.starchild.software/forum — a place for discussion, not a DAO.
 * The founder opens threads; anyone comments by signing a gasless message.
 * Each message shows the author's $STARCHILD held when they posted (a snapshot).
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { type Address } from 'viem'
import { CosmicBg, SiteNav, DISP, MONO, LAV, GOLD, LILAC } from '@/components/cosmic'
import { fmt, getInjected, fetchTokenMeta } from '@/lib/burnGoals'
import { isForumAdmin, type ThreadView, type CommentView } from '@/lib/forumShared'
import { fetchThreads, fetchComments, signAndComment, signAndPostThread } from '@/lib/forum'

const eyebrow: React.CSSProperties = { fontFamily: MONO, fontSize: 12, letterSpacing: '.3em', textTransform: 'uppercase', color: LAV }
const heading: React.CSSProperties = { fontFamily: DISP, fontWeight: 200, lineHeight: 1.1, letterSpacing: '-.015em' }
const ital: React.CSSProperties = { fontStyle: 'italic', color: LILAC }
const inputStyle: React.CSSProperties = { width: '100%', padding: '14px 18px', borderRadius: 16, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(184,160,216,0.2)', color: '#fff', fontFamily: "'Hanken Grotesk',sans-serif", fontSize: 15.5, outline: 'none' }
const videoMask: React.CSSProperties = { WebkitMaskImage: 'radial-gradient(circle at 50% 47%,#000 56%,transparent 80%)', maskImage: 'radial-gradient(circle at 50% 47%,#000 56%,transparent 80%)' }
const ctaStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 10, padding: '13px 28px', borderRadius: 100, background: 'linear-gradient(160deg,rgba(184,160,216,0.28),rgba(184,160,216,0.1))', border: '1px solid rgba(184,160,216,0.42)', fontSize: 15, color: '#fff' }

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const whenLabel = (ts: number) => { try { return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toLowerCase() } catch { return '' } }

function Badge({ addr, balance, decimals, symbol }: { addr: string; balance: string; decimals: number; symbol: string }) {
  const admin = isForumAdmin(addr)
  let held = '0'
  try { held = fmt(BigInt(balance || '0'), decimals) } catch { held = '0' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: MONO, fontSize: 12.5, color: admin ? GOLD : 'rgba(255,255,255,0.72)' }}>{admin ? 'founder ✦' : shortAddr(addr)}</span>
      <span style={{ fontFamily: MONO, fontSize: 11, padding: '3px 10px', borderRadius: 100, border: '1px solid rgba(184,160,216,0.2)', color: LILAC }}>◇ {held} ${symbol}</span>
    </span>
  )
}

export default function ForumPage() {
  const [meta, setMeta] = useState({ decimals: 18, symbol: 'STARCHILD' })
  const [account, setAccount] = useState<Address | null>(null)
  const [threads, setThreads] = useState<ThreadView[]>([])
  const [selected, setSelected] = useState<ThreadView | null>(null)
  const [comments, setComments] = useState<CommentView[]>([])
  const [cText, setCText] = useState('')
  const [tTitle, setTTitle] = useState(''); const [tBody, setTBody] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const reloadThreads = useCallback(async () => { setThreads(await fetchThreads().catch(() => [])) }, [])
  useEffect(() => { fetchTokenMeta().then(setMeta).catch(() => {}); reloadThreads() }, [reloadThreads])

  const openThread = useCallback(async (t: ThreadView) => {
    setSelected(t); setComments([]); setMsg(null)
    setComments(await fetchComments(t.id).catch(() => []))
  }, [])

  const connect = useCallback(async () => {
    const inj = getInjected()
    if (!inj) { setMsg("I couldn't find a wallet — install a Base-compatible one to take part."); return }
    const accts = (await inj.request({ method: 'eth_requestAccounts' })) as string[]
    setAccount((accts?.[0] ?? null) as Address | null)
  }, [])

  const run = useCallback(async (key: string, fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(key); setMsg(null)
    try { await fn(); if (okMsg) setMsg(okMsg) }
    catch (e) { setMsg(e instanceof Error ? e.message : 'something went wrong') }
    finally { setBusy(null) }
  }, [])

  const admin = isForumAdmin(account)

  return (
    <main style={{ position: 'relative', minHeight: '100vh', background: '#000', color: '#fff', overflowX: 'hidden' }}>
      <CosmicBg />
      <SiteNav />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* ── hero ── */}
        <section style={{ minHeight: '62vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '150px clamp(20px,5vw,64px) 50px' }}>
          <div style={{ position: 'relative', width: 'min(180px,40vw)', aspectRatio: '1', marginBottom: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div aria-hidden style={{ position: 'absolute', inset: '-22%', borderRadius: '50%', background: 'radial-gradient(circle,rgba(120,80,180,0.5) 0%,rgba(120,80,180,0.15) 44%,transparent 70%)', filter: 'blur(26px)', animation: 'breathe 7s ease-in-out infinite' }} />
            <video src="/videos/starchild1.webm" poster="/poster1.png" autoPlay muted loop playsInline preload="auto" aria-label="the starchild" style={{ position: 'relative', width: '96%', aspectRatio: '1', objectFit: 'contain', animation: 'drift 8s ease-in-out infinite', ...videoMask }} />
          </div>
          <div style={{ ...eyebrow, letterSpacing: '.32em', marginBottom: 20 }}>the forum</div>
          <h1 style={{ ...heading, fontSize: 'clamp(34px,6vw,64px)', marginBottom: 22 }}>think out loud, <span style={ital}>together</span></h1>
          <p style={{ maxWidth: 520, fontSize: 'clamp(15px,1.8vw,18px)', lineHeight: 1.75, color: 'rgba(255,255,255,0.64)' }}>{"i post what i'm thinking about; you weigh in. every voice shows the $STARCHILD it held when it spoke — no DAO, no voting, just an honest room."}</p>
        </section>

        {msg && <p style={{ maxWidth: 620, margin: '0 auto 10px', textAlign: 'center', fontSize: 14, borderRadius: 14, padding: '12px 18px', background: 'rgba(184,160,216,0.1)', color: LAV }}>{msg}</p>}

        <div style={{ maxWidth: 820, margin: '0 auto', padding: '20px clamp(20px,5vw,64px) 110px' }}>
          {selected ? (
            /* ── thread view ── */
            <div>
              <span onClick={() => { setSelected(null); reloadThreads() }} className="link-hov" style={{ cursor: 'pointer', display: 'inline-block', marginBottom: 26, fontSize: 14, color: 'rgba(255,255,255,0.55)' }}>← all threads</span>

              <article style={{ padding: '32px clamp(22px,4vw,38px)', borderRadius: 24, background: 'linear-gradient(160deg,rgba(184,160,216,0.08),rgba(12,10,20,0.55))', border: '1px solid rgba(184,160,216,0.18)', marginBottom: 34 }}>
                <h2 style={{ ...heading, fontSize: 'clamp(24px,3.4vw,36px)', marginBottom: 16 }}>{selected.title}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
                  <Badge addr={selected.author} balance={selected.balance} decimals={meta.decimals} symbol={meta.symbol} />
                  <span style={{ fontFamily: MONO, fontSize: 11.5, color: 'rgba(255,255,255,0.4)' }}>{whenLabel(selected.createdAt)}</span>
                </div>
                {selected.body && <p style={{ fontSize: 16, lineHeight: 1.75, color: 'rgba(255,255,255,0.72)', whiteSpace: 'pre-wrap' }}>{selected.body}</p>}
              </article>

              <div style={{ ...eyebrow, marginBottom: 22 }}>{comments.length} {comments.length === 1 ? 'reply' : 'replies'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 34 }}>
                {comments.length === 0 ? (
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>no replies yet — be the first.</p>
                ) : comments.map((c) => (
                  <div key={c.id} style={{ padding: '22px 26px', borderRadius: 20, background: 'linear-gradient(160deg,rgba(184,160,216,0.05),rgba(12,10,20,0.4))', border: '1px solid rgba(184,160,216,0.12)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
                      <Badge addr={c.author} balance={c.balance} decimals={meta.decimals} symbol={meta.symbol} />
                      <span style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>{whenLabel(c.createdAt)}</span>
                    </div>
                    <p style={{ fontSize: 15.5, lineHeight: 1.7, color: 'rgba(255,255,255,0.78)', whiteSpace: 'pre-wrap' }}>{c.body}</p>
                  </div>
                ))}
              </div>

              {/* composer */}
              {selected.closed ? (
                <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)' }}>this thread is closed to new replies.</p>
              ) : !account ? (
                <span onClick={connect} className="btn-cta" style={{ ...ctaStyle, cursor: 'pointer' }}>connect wallet to reply</span>
              ) : (
                <div>
                  <textarea value={cText} onChange={(e) => setCText(e.target.value)} maxLength={2000} rows={3} placeholder="add your thoughts…" style={{ ...inputStyle, marginBottom: 14, lineHeight: 1.6, resize: 'vertical' }} />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <span onClick={busy || !cText.trim() ? undefined : () => run('comment', async () => { await signAndComment(selected.id, cText.trim()); setCText(''); setComments(await fetchComments(selected.id).catch(() => [])) }, 'posted — thank you.')} className="btn-cta" style={{ ...ctaStyle, cursor: busy || !cText.trim() ? 'not-allowed' : 'pointer', color: cText.trim() ? '#fff' : 'rgba(255,255,255,0.4)' }}>{busy === 'comment' ? 'signing…' : '✦ post reply'}</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── thread list ── */
            <div>
              {/* founder composer */}
              {admin ? (
                <div style={{ padding: '26px clamp(22px,4vw,32px)', borderRadius: 24, background: 'linear-gradient(160deg,rgba(232,216,168,0.06),rgba(12,10,20,0.5))', border: '1px solid rgba(232,216,168,0.18)', marginBottom: 28 }}>
                  <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: GOLD, marginBottom: 16 }}>open a thread</div>
                  <input value={tTitle} onChange={(e) => setTTitle(e.target.value)} maxLength={140} placeholder="what's on your mind?" style={{ ...inputStyle, marginBottom: 12 }} />
                  <textarea value={tBody} onChange={(e) => setTBody(e.target.value)} maxLength={4000} rows={4} placeholder="say more…" style={{ ...inputStyle, marginBottom: 14, lineHeight: 1.6, resize: 'vertical' }} />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <span onClick={busy || !tTitle.trim() ? undefined : () => run('thread', async () => { await signAndPostThread(tTitle.trim(), tBody.trim()); setTTitle(''); setTBody(''); await reloadThreads() }, 'thread opened.')} className="btn-cta" style={{ ...ctaStyle, cursor: busy || !tTitle.trim() ? 'not-allowed' : 'pointer', color: tTitle.trim() ? '#fff' : 'rgba(255,255,255,0.4)' }}>{busy === 'thread' ? 'signing…' : '✦ open thread'}</span>
                  </div>
                </div>
              ) : !account ? (
                <div style={{ textAlign: 'right', marginBottom: 22 }}>
                  <span onClick={connect} className="link-hov" style={{ cursor: 'pointer', fontFamily: MONO, fontSize: 12.5, color: 'rgba(255,255,255,0.55)' }}>connect wallet →</span>
                </div>
              ) : null}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {threads.length === 0 ? (
                  <p style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.4)', padding: '40px 0' }}>no threads yet.</p>
                ) : threads.map((t) => (
                  <div key={t.id} onClick={() => openThread(t)} className="card-glow lift" style={{ cursor: 'pointer', padding: '26px clamp(22px,4vw,32px)', borderRadius: 24, background: 'linear-gradient(160deg,rgba(184,160,216,0.06),rgba(12,10,20,0.5))', border: `1px solid ${t.pinned ? 'rgba(232,216,168,0.25)' : 'rgba(184,160,216,0.14)'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                      {t.pinned && <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 100, color: '#1a1525', background: GOLD }}>pinned</span>}
                      <h3 style={{ fontFamily: DISP, fontWeight: 300, fontSize: 'clamp(19px,2.4vw,24px)', lineHeight: 1.2 }}>{t.title}</h3>
                    </div>
                    {t.body && <p style={{ fontSize: 14.5, lineHeight: 1.6, color: 'rgba(255,255,255,0.55)', marginBottom: 16, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.body}</p>}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                      <Badge addr={t.author} balance={t.balance} decimals={meta.decimals} symbol={meta.symbol} />
                      <span style={{ fontFamily: MONO, fontSize: 11.5, color: 'rgba(255,255,255,0.42)' }}>{t.commentCount} {t.commentCount === 1 ? 'reply' : 'replies'} · {whenLabel(t.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer style={{ maxWidth: 1100, margin: '0 auto', padding: '40px clamp(20px,5vw,64px) 80px', borderTop: '1px solid rgba(184,160,216,0.08)', textAlign: 'center' }}>
          <Link href="/" className="link-hov" style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)' }}>← back to the landing</Link>
        </footer>
      </div>
    </main>
  )
}
