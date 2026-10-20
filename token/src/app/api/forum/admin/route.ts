import { moderate } from '@/lib/forumStore'

// POST /api/forum/admin — moderation (delete a comment, pin/unpin/close/open a
// thread). Requires a founder-wallet EIP-712 signature (Moderation type).
export async function POST(req: Request) {
  let body: Parameters<typeof moderate>[0]
  try { body = await req.json() } catch { return Response.json({ error: 'invalid json' }, { status: 400 }) }
  const res = await moderate(body)
  if (!res.ok) return Response.json({ error: res.error }, { status: res.status ?? 400 })
  return Response.json({ ok: true })
}
