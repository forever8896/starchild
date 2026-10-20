/**
 * Forum — client-safe shared config (no server imports), so the browser (which
 * SIGNS) and the API route (which VERIFIES) share one EIP-712 definition.
 *
 * The forum is a place for discussion, not a DAO: the founder opens threads,
 * anyone can comment by signing a gasless message, and each message carries a
 * snapshot of the author's $STARCHILD balance at the moment they posted.
 */
import { keccak256, stringToBytes } from 'viem'

// Binds signatures to THIS app (unique domain separator). Computed, not magic.
export const FORUM_SALT = keccak256(stringToBytes('starchild-forum:v1:token.starchild.software'))
export const FORUM_DOMAIN = { name: 'Starchild Forum', version: '1', chainId: 8453, salt: FORUM_SALT } as const

export const COMMENT_TYPES = {
  Comment: [
    { name: 'threadId', type: 'string' },
    { name: 'body', type: 'string' },
    { name: 'author', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

export const THREAD_TYPES = {
  Thread: [
    { name: 'title', type: 'string' },
    { name: 'body', type: 'string' },
    { name: 'author', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

export const MODERATION_TYPES = {
  Moderation: [
    { name: 'action', type: 'string' },
    { name: 'threadId', type: 'string' },
    { name: 'commentId', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const
export const MOD_ACTIONS = ['delete', 'pin', 'unpin', 'close', 'open'] as const
export type ModAction = (typeof MOD_ACTIONS)[number]

// Who may open threads + moderate. Verified by signature, not a shared secret.
// (kiliansolutions.eth + the founder/proposer address.)
export const FORUM_ADMINS = [
  '0xE8f1B462BBf419315c14FBBd69689D9f163f36B2',
  '0x1f44d8655727Bb26532C657BeC8882154A01E170',
].map((a) => a.toLowerCase())
export const isForumAdmin = (a?: string | null): boolean => !!a && FORUM_ADMINS.includes(a.toLowerCase())

export const MAX_TITLE = 140
export const MAX_BODY = 4000
export const MAX_COMMENT = 2000

export type ThreadView = {
  id: string
  title: string
  body: string
  author: string
  balance: string // snapshot of author's $STARCHILD (base units) when posted
  createdAt: number
  commentCount: number
  pinned?: boolean
  closed?: boolean
}
export type CommentView = {
  id: string
  threadId: string
  author: string
  body: string
  balance: string // snapshot when posted
  createdAt: number
}
