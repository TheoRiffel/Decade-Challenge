export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const API_URL = process.env.API_URL ?? 'http://localhost:3000'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ traceId: string }> },
) {
  const { traceId } = await params
  const upstream = await fetch(`${API_URL}/sources/${traceId}`)

  const headers = new Headers(upstream.headers)
  headers.set('cache-control', 'no-store')

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  })
}
