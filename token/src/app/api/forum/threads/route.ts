import { getThreads, createThread } from '@/lib/forumStore'

// GET /api/forum/threads — list threads (newest first, pinned on top).
export async function GET() {
  try {
    return Response.json({ threads: await getThreads() })
  } catch {
    return Response.json({ threads: [] })
  }
}

// POST /api/forum/threads — open a thread (founder wallet signature required).
export async function POST(req: Request) {
  let body: Parameters<typeof createThread>[0]
  try { body = await req.json() } catch { return Response.json({ error: 'invalid json' }, { status: 400 }) }
  const res = await createThread(body)
  if (!res.ok) return Response.json({ error: res.error }, { status: res.status ?? 400 })
  return Response.json({ ok: true })
}
