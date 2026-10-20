/**
 * Forum — client helpers. Reads via the API, writes by signing a gasless
 * EIP-712 message with the connected wallet (no gas, no transaction). The
 * backend recovers the signer from the signature, so nobody can post as an
 * address they don't control.
 */
import { getWalletClient } from './burnGoals'
import { FORUM_DOMAIN, COMMENT_TYPES, THREAD_TYPES, type ThreadView, type CommentView } from './forumShared'

export async function fetchThreads(): Promise<ThreadView[]> {
  const r = await fetch('/api/forum/threads', { cache: 'no-store' })
  return (await r.json()).threads ?? []
}

export async function fetchComments(threadId: string): Promise<CommentView[]> {
  const r = await fetch(`/api/forum/comments?threadId=${encodeURIComponent(threadId)}`, { cache: 'no-store' })
  return (await r.json()).comments ?? []
}

export async function signAndComment(threadId: string, body: string): Promise<void> {
  const wallet = getWalletClient()
  const [account] = await wallet.requestAddresses()
  const nonce = BigInt(Date.now())
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)
  const signature = await wallet.signTypedData({
    account, domain: FORUM_DOMAIN, types: COMMENT_TYPES, primaryType: 'Comment',
    message: { threadId, body, author: account, nonce, deadline },
  })
  const r = await fetch('/api/forum/comments', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadId, body, author: account, nonce: nonce.toString(), deadline: deadline.toString(), signature }),
  })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'failed to comment')
}

export async function signAndPostThread(title: string, body: string): Promise<void> {
  const wallet = getWalletClient()
  const [account] = await wallet.requestAddresses()
  const nonce = BigInt(Date.now())
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)
  const signature = await wallet.signTypedData({
    account, domain: FORUM_DOMAIN, types: THREAD_TYPES, primaryType: 'Thread',
    message: { title, body, author: account, nonce, deadline },
  })
  const r = await fetch('/api/forum/threads', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, author: account, nonce: nonce.toString(), deadline: deadline.toString(), signature }),
  })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'failed to post')
}
