import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { parseSearchParams } from './_lib/request-contracts.js'
import {
  BibliotecaListQuery,
  buildLibraryListParams,
  fetchLibraryRows,
  sortAndPaginate,
} from './_lib/library-read-model.js'

/**
 * GET /api/biblioteca — read-model unificado de archivos del usuario.
 *
 * `getAuthedUser` fija el contexto RLS; igual pasamos `user_id = ${userId}`
 * explícito en cada rama del UNION (defensa en profundidad). Los filtros se
 * aplican en SQL; el orden y la paginación (cursor = offset) en TS para mantener
 * la query simple y testeable. Devuelve filas snake_case — el cliente las mapea,
 * igual que notas-attachments.
 */
export default withObservability(
  'biblioteca',
  async (req: Request, _context: Context, { requestId }) => {
    if (req.method !== 'GET') return ApiErrors.methodNotAllowed(requestId)

    const { id: userId } = await getAuthedUser(req)
    const sql = getSql()

    const parsedQuery = parseSearchParams(req, BibliotecaListQuery, requestId)
    if (!parsedQuery.ok) return parsedQuery.response

    const { fetch, page } = buildLibraryListParams(parsedQuery.data)
    const rows = await fetchLibraryRows(sql, userId, fetch)
    const { items, nextCursor } = sortAndPaginate(rows, page)

    return Response.json({ items, nextCursor })
  },
)

export const config: Config = {
  path: ['/api/biblioteca'],
}
