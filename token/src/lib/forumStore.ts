/**
 * Forum — server store (Upstash Redis + signature verification). Mirrors the
 * governance patterns: verify the EIP-712 signature, guard against replay
 * (nonce) and spam (per-address rate limit), then store. On write we read the
 * author's balance ONCE and snapshot it onto the record (holdings-when-posted).
 *
 * Storage: UPSTASH_REDIS_REST_URL + _TOKEN.
 */
import { verifyTypedData, getAddress, type Address } from 'viem'
import { Redis } from '@upstash/redis'
import { publicClient, STARCHILD_TOKEN, erc20Abi } from './burnGoals'
import {
  FORUM_DOMAIN, COMMENT_TYPES, THREAD_TYPES, MODERATION_TYPES, MOD_ACTIONS, isForumAdmin,
  MAX_TITLE, MAX_BODY, MAX_COMMENT, type ThreadView, type CommentView,
} from './forumShared'

let _r: Redis | null = null
function redis(): Redis { if (!_r) _r = Redis.fromEnv(); return _r }

const THREADS_KEY = 'forum:threads'
const commentsKey = (id: string) => `forum:comments:${id}`
const NONCE_KEY = 'forum:nonce'                 // set of used "author(lc):nonce"
const rateKey = (a: string) => `forum:rate:${a}` // per-address comment rate counter
const RATE_MAX = 5, RATE_WINDOW = 60             // ≤ 5 comments / minute / address

type ThreadRec = Omit<ThreadView, 'commentCount'> & { signature: string }
type CommentRec = CommentView & { signature: string }

type Result = { ok: true } | { ok: false; error: string; status?: number }

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

async function balanceSnapshot(addr: Address): Promise<string> {
  try {
    const b = (await publicClient.readContract({ address: STARCHILD_TOKEN, abi: erc20Abi, functionName: 'balanceOf', args: [addr] })) as bigint
    return b.toString()
  } catch {
    return '0'
  }
}

async function nonceUsed(addr: Address, nonce: string): Promise<boolean> {
  return (await redis().sismember(NONCE_KEY, `${addr.toLowerCase()}:${nonce}`)) === 1
}
async function markNonce(addr: Address, nonce: string): Promise<void> {
  await redis().sadd(NONCE_KEY, `${addr.toLowerCase()}:${nonce}`)
}

function checkDeadline(deadline: string): bigint | null {
  let d: bigint
  try { d = BigInt(deadline) } catch { return null }
  if (d < BigInt(Math.floor(Date.now() / 1000))) return null
  return d
}

// ── Reads ──────────────────────────────────────────────────────────────────

async function rawThreads(): Promise<ThreadRec[]> {
  const raw = await redis().lrange<ThreadRec>(THREADS_KEY, 0, -1)
  return raw.map((t) => (typeof t === 'string' ? (JSON.parse(t) as ThreadRec) : t))
}

export async function getThreads(): Promise<ThreadView[]> {
  const threads = await rawThreads()
  const counts = await Promise.all(threads.map((t) => redis().llen(commentsKey(t.id)).catch(() => 0)))
  // Drop the signature; surface only the public view fields.
  return threads
    .map((t, i): ThreadView => ({
      id: t.id, title: t.title, body: t.body, author: t.author, balance: t.balance,
      createdAt: t.createdAt, pinned: t.pinned, closed: t.closed, commentCount: counts[i] ?? 0,
    }))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt - a.createdAt)
}

export async function getComments(threadId: string): Promise<CommentView[]> {
  const raw = await redis().lrange<CommentRec>(commentsKey(threadId), 0, -1)
  return raw
    .map((c) => (typeof c === 'string' ? (JSON.parse(c) as CommentRec) : c))
    .map((c): CommentView => ({ id: c.id, threadId: c.threadId, author: c.author, body: c.body, balance: c.balance, createdAt: c.createdAt }))
    .sort((a, b) => a.createdAt - b.createdAt)
}

// ── Writes ───────────────────────────────────────────────────────────────────

export async function createThread(input: {
  title?: string; body?: string; author?: string; nonce?: string; deadline?: string; signature?: `0x${string}`
}): Promise<Result> {
  let author: Address
  try { author = getAddress(input.author ?? '') } catch { return { ok: false, error: 'bad address', status: 400 } }
  if (!isForumAdmin(author)) return { ok: false, error: 'only the founder can open threads', status: 403 }

  const title = (input.title ?? '').trim(), body = (input.body ?? '').trim()
  if (!title || title.length > MAX_TITLE) return { ok: false, error: `title 1–${MAX_TITLE} chars`, status: 400 }
  if (body.length > MAX_BODY) return { ok: false, error: `body ≤ ${MAX_BODY} chars`, status: 400 }

  const deadline = checkDeadline(input.deadline ?? '')
  if (deadline === null) return { ok: false, error: 'signature expired — sign again', status: 400 }
  let nonce: bigint
  try { nonce = BigInt(input.nonce ?? '') } catch { return { ok: false, error: 'bad nonce', status: 400 } }

  const valid = await verifyTypedData({
    address: author, domain: FORUM_DOMAIN, types: THREAD_TYPES, primaryType: 'Thread',
    message: { title, body, author, nonce, deadline }, signature: input.signature ?? '0x',
  }).catch(() => false)
  if (!valid) return { ok: false, error: 'invalid signature', status: 400 }
  if (await nonceUsed(author, input.nonce!)) return { ok: false, error: 'signature already used', status: 409 }

  const rec: ThreadRec = {
    id: makeId(), title, body, author: author.toLowerCase(),
    balance: await balanceSnapshot(author), createdAt: Date.now(),
    signature: input.signature!,
  }
  await redis().rpush(THREADS_KEY, JSON.stringify(rec))
  await markNonce(author, input.nonce!)
  return { ok: true }
}

export async function createComment(input: {
  threadId?: string; body?: string; author?: string; nonce?: string; deadline?: string; signature?: `0x${string}`
}): Promise<Result> {
  let author: Address
  try { author = getAddress(input.author ?? '') } catch { return { ok: false, error: 'bad address', status: 400 } }

  const threadId = (input.threadId ?? '').trim()
  const body = (input.body ?? '').trim()
  if (!threadId) return { ok: false, error: 'missing thread', status: 400 }
  if (!body || body.length > MAX_COMMENT) return { ok: false, error: `comment 1–${MAX_COMMENT} chars`, status: 400 }

  const deadline = checkDeadline(input.deadline ?? '')
  if (deadline === null) return { ok: false, error: 'signature expired — sign again', status: 400 }
  let nonce: bigint
  try { nonce = BigInt(input.nonce ?? '') } catch { return { ok: false, error: 'bad nonce', status: 400 } }

  const valid = await verifyTypedData({
    address: author, domain: FORUM_DOMAIN, types: COMMENT_TYPES, primaryType: 'Comment',
    message: { threadId, body, author, nonce, deadline }, signature: input.signature ?? '0x',
  }).catch(() => false)
  if (!valid) return { ok: false, error: 'invalid signature', status: 400 }
  if (await nonceUsed(author, input.nonce!)) return { ok: false, error: 'signature already used', status: 409 }

  // Thread must exist and be open.
  const thread = (await rawThreads()).find((t) => t.id === threadId)
  if (!thread) return { ok: false, error: 'thread not found', status: 404 }
  if (thread.closed) return { ok: false, error: 'this thread is closed', status: 403 }

  // Per-address rate limit.
  const k = rateKey(author.toLowerCase())
  const n = await redis().incr(k)
  if (n === 1) await redis().expire(k, RATE_WINDOW)
  if (n > RATE_MAX) return { ok: false, error: "you're posting too fast — give it a minute", status: 429 }

  const rec: CommentRec = {
    id: makeId(), threadId, author: author.toLowerCase(), body,
    balance: await balanceSnapshot(author), createdAt: Date.now(),
    signature: input.signature!,
  }
  await redis().rpush(commentsKey(threadId), JSON.stringify(rec))
  await markNonce(author, input.nonce!)
  return { ok: true }
}

// ── Moderation (admin only) — delete a comment, pin/close a thread ───────────

export async function moderate(input: {
  action?: string; threadId?: string; commentId?: string; author?: string; nonce?: string; deadline?: string; signature?: `0x${string}`
}): Promise<Result> {
  let admin: Address
  try { admin = getAddress(input.author ?? '') } catch { return { ok: false, error: 'bad address', status: 400 } }
  if (!isForumAdmin(admin)) return { ok: false, error: 'not an admin', status: 403 }

  const action = input.action ?? ''
  if (!(MOD_ACTIONS as readonly string[]).includes(action)) return { ok: false, error: 'bad action', status: 400 }
  const threadId = (input.threadId ?? '').trim()
  const commentId = (input.commentId ?? '').trim()
  if (!threadId) return { ok: false, error: 'missing threadId', status: 400 }

  const deadline = checkDeadline(input.deadline ?? '')
  if (deadline === null) return { ok: false, error: 'signature expired — sign again', status: 400 }
  let nonce: bigint
  try { nonce = BigInt(input.nonce ?? '') } catch { return { ok: false, error: 'bad nonce', status: 400 } }

  const valid = await verifyTypedData({
    address: admin, domain: FORUM_DOMAIN, types: MODERATION_TYPES, primaryType: 'Moderation',
    message: { action, threadId, commentId, nonce, deadline }, signature: input.signature ?? '0x',
  }).catch(() => false)
  if (!valid) return { ok: false, error: 'invalid signature', status: 400 }
  if (await nonceUsed(admin, input.nonce!)) return { ok: false, error: 'signature already used', status: 409 }

  if (action === 'delete') {
    if (!commentId) return { ok: false, error: 'missing commentId', status: 400 }
    const raw = await redis().lrange<CommentRec>(commentsKey(threadId), 0, -1)
    const comments = raw.map((c) => (typeof c === 'string' ? (JSON.parse(c) as CommentRec) : c))
    const kept = comments.filter((c) => c.id !== commentId)
    if (kept.length === comments.length) return { ok: false, error: 'comment not found', status: 404 }
    await redis().del(commentsKey(threadId))
    if (kept.length) await redis().rpush(commentsKey(threadId), ...kept.map((c) => JSON.stringify(c)))
  } else {
    const threads = await rawThreads()
    const t = threads.find((x) => x.id === threadId)
    if (!t) return { ok: false, error: 'thread not found', status: 404 }
    if (action === 'pin') t.pinned = true
    else if (action === 'unpin') t.pinned = false
    else if (action === 'close') t.closed = true
    else if (action === 'open') t.closed = false
    await redis().del(THREADS_KEY)
    if (threads.length) await redis().rpush(THREADS_KEY, ...threads.map((x) => JSON.stringify(x)))
  }
  await markNonce(admin, input.nonce!)
  return { ok: true }
}
