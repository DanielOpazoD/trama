import { neon } from '@neondatabase/serverless'
import type { Config } from '@netlify/functions'
import { withObservability } from './_lib/handler-wrap.js'

export default withObservability('error-log', async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }
  const connectionString = Netlify.env.get('NETLIFY_DATABASE_URL')
  if (!connectionString) {
    return new Response('NETLIFY_DATABASE_URL no está configurada', { status: 500 })
  }
  const sql = neon(connectionString)
  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10), 500)

  type Row = {
    id: string
    function_name: string
    http_method: string | null
    http_path: string | null
    status_code: number | null
    message: string
    stack: string | null
    context: unknown
    created_at: string
  }

  const rows = (await sql`
    SELECT id, function_name, http_method, http_path, status_code, message, stack, context, created_at
    FROM error_log
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as Row[]

  return Response.json(
    rows.map((r) => ({
      id: r.id,
      functionName: r.function_name,
      httpMethod: r.http_method,
      httpPath: r.http_path,
      statusCode: r.status_code,
      message: r.message,
      stack: r.stack,
      context: r.context,
      createdAt: r.created_at,
    })),
  )
})

export const config: Config = {
  path: '/api/error-log',
}
