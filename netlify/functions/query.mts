import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { logEvent } from './_lib/observability.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { QueryBody } from './_lib/query/ast.js'
import { runQuery } from './_lib/query/execute.js'
import { QueryCompileError } from './_lib/query/compile.js'

/**
 * Motor de queries componibles (Fase 1). `POST /api/query` recibe un AST
 * (validado por Zod), lo compila a SQL parametrizado + scopeado por RLS y
 * devuelve hits cross-tipo (entity/quote/momento/note) con paginación keyset.
 *
 * Es el endpoint base sobre el que se construirán las queries guardadas, los
 * bloques embebibles y el traductor lenguaje-natural→AST. El `/api/search`
 * híbrido y el recall de WhatsApp pueden converger a este motor más adelante.
 */
export default withObservability('query', async (req: Request, _ctx, { requestId }) => {
  if (req.method !== 'POST') {
    return ApiErrors.methodNotAllowed(requestId)
  }
  // getAuthedUser fija el contexto RLS (setCurrentRlsUser); getSql() lo lee.
  await getAuthedUser(req)
  const sql = getSql()

  const parsed = await parseJsonBody(req, QueryBody, requestId)
  if (!parsed.ok) return parsed.response

  try {
    const result = await runQuery(sql, parsed.data)
    logEvent({
      event: 'query_run',
      kinds: parsed.data.from.join(','),
      count: result.items.length,
    })
    return Response.json(result)
  } catch (err) {
    if (err instanceof QueryCompileError) {
      return ApiErrors.validation(requestId, err.message)
    }
    throw err
  }
})

export const config: Config = {
  path: '/api/query',
}
