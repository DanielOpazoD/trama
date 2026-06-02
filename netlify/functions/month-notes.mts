import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { parseJsonBody } from './_lib/zod-body.js'

/**
 * Trama Notas — notas globales del mes (sección Tareas). Texto libre por mes,
 * al lado del navegador de meses. Una fila por (usuario, mes 'YYYY-MM'); el PUT
 * hace upsert. Scope por usuario.
 */
const monthKey = z.string().regex(/^\d{4}-\d{2}$/, 'Mes inválido (esperado YYYY-MM)')

const MonthNoteBody = z.object({
  month: monthKey,
  content: z.string().max(50000),
})

type MonthNoteRow = { month_key: string; content: string }

export default withObservability(
  'month-notes',
  async (req: Request, _context, { requestId }) => {
    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()

    if (req.method === 'GET') {
      const month = new URL(req.url).searchParams.get('month')?.trim()
      if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        return ApiErrors.validation(requestId, 'month debe ser YYYY-MM')
      }
      const rows = await sqlTyped<MonthNoteRow>(sql`
        SELECT month_key, content FROM month_notes
        WHERE user_id = ${userId} AND month_key = ${month} AND deleted_at IS NULL
      `)
      return Response.json({ monthKey: month, content: rows[0]?.content ?? '' })
    }

    if (req.method === 'PUT') {
      const parsed = await parseJsonBody(req, MonthNoteBody, requestId)
      if (!parsed.ok) return parsed.response
      await ensureUserRow(sql, authedUser)
      const { month, content } = parsed.data
      const rows = await sqlTyped<MonthNoteRow>(sql`
        INSERT INTO month_notes (user_id, month_key, content)
        VALUES (${userId}, ${month}, ${content})
        ON CONFLICT (user_id, month_key) WHERE deleted_at IS NULL
        DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
        RETURNING month_key, content
      `)
      const row = rows[0]
      return Response.json({ monthKey: row?.month_key ?? month, content: row?.content ?? content })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: '/api/month-notes',
}
