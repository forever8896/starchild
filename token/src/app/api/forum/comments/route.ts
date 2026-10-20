import { getComments, createComment } from '@/lib/forumStore'

// GET /api/forum/comments?threadId=… — comments for a thread (oldest first).
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('threadId')
  if (!id) return Response.json({ comments: [] })
  try {
    return Response.json({ comments: await getComments(id) })
  } catch {
    return Response.json({ comments: [] })
  }
}

// POST /api/forum/comments — leave a comment (any wallet; signature verified).
export async function POST(req: Request) {
  let body: Parameters<typeof createComment>[0]
  try { body = await req.json() } catch { return Response.json({ error: 'invalid json' }, { status: 400 }) }
  const res = await createComment(body)
  if (!res.ok) return Response.json({ error: res.error }, { status: res.status ?? 400 })
  return Response.json({ ok: true })
}
