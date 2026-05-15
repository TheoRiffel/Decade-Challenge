export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const API_URL = process.env.API_URL ?? 'http://localhost:3000'

export async function POST(req: Request) {
  const upstream = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: {
      'content-type': req.headers.get('content-type') ?? 'application/json',
    },
    body: req.body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })

  const headers = new Headers(upstream.headers)
  headers.set('cache-control', 'no-cache, no-transform')
  headers.set('x-accel-buffering', 'no')

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  })
}
