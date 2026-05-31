import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { ErrorLogBody } from './_lib/admin-schemas.js'
import { getAuthedUser, UnauthenticatedError } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { logEvent } from './_lib/observability.js'

export default withObservability('error-log', async (req, _ctx, { requestId }) => {
  const sql = getSql()

  if (req.method === 'GET') {
    // GET requiere auth — los stacks pueden contener info sensible
    // (paths, mensajes con valores del user). Filtramos por user_id
    // así un usuario no ve los crashes del resto.
    const { id: userId } = await getAuthedUser(req)
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
      WHERE user_id = ${userId}
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
  }

  // POST: el cliente reporta un error capturado por ErrorBoundary.
  // Lo persistimos en la misma tabla que los errores del backend, con
  // function_name='client' y http_path = la ruta donde explotó. El cap
  // de tamaño es defensivo (algunos browsers serializan stacks muy
  // largos en componentes async; no queremos un payload de 1MB).
  //
  // Auth: intentamos asociar el log al user_id si hay Bearer válido. En modo
  // single-user sin Clerk, getAuthedUser() devuelve legacy-single-user y se
  // persiste como antes. En modo multi-user estricto, si no hay token válido,
  // aceptamos el reporte pero NO lo persistimos bajo legacy: evitar contaminar
  // la cuenta histórica es más importante que guardar un crash anónimo.
  if (req.method === 'POST') {
    const parsed = await parseJsonBody(req, ErrorLogBody, requestId)
    if (!parsed.ok) return parsed.response
    const body = parsed.data

    let userId: string | null = null
    try {
      const authed = await getAuthedUser(req)
      await ensureUserRow(sql, authed)
      userId = authed.id
    } catch (err) {
      // UnauthenticatedError es esperable cuando el ErrorBoundary se
      // dispara antes del login. Cualquier otro error lo dejamos
      // burbujear porque indicaría algo raro en la verificación.
      if (!(err instanceof UnauthenticatedError)) throw err
    }

    if (!userId) {
      logEvent({
        event: 'client_error_log_skipped',
        reason: 'unauthenticated',
        path: body.path,
        scope: body.scope,
      })
      return new Response(null, { status: 204 })
    }

    const message = body.message.slice(0, 2000)
    const stack = body.stack ? body.stack.slice(0, 8000) : null
    const path = body.path ? body.path.slice(0, 500) : null
    const context = {
      componentStack: body.componentStack
        ? body.componentStack.slice(0, 8000)
        : null,
      userAgent: body.userAgent ? body.userAgent.slice(0, 500) : null,
      scope: body.scope ? body.scope.slice(0, 100) : null,
    }
    await sql`
      INSERT INTO error_log (function_name, http_method, http_path, message, stack, context, user_id)
      VALUES ('client', NULL, ${path}, ${message}, ${stack}, ${JSON.stringify(context)}::jsonb, ${userId})
    `
    return new Response(null, { status: 204 })
  }

  return ApiErrors.methodNotAllowed(requestId)
})

export const config: Config = {
  path: '/api/error-log',
}
