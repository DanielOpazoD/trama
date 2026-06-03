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
const category = z.enum(['trabajo', 'personal'])

const MonthNoteBody = z.object({
  month: monthKey,
  content: z.string().max(50000),
  // Compat: clientes viejos sin categoría caen en 'trabajo' (la nota histórica).
  category: category.default('trabajo'),
})

type MonthNoteRow = { month_key: string; content: string; category: string }

/** Normaliza el ?category= del GET (lenient: cualquier cosa que no sea personal
 *  cae en 'trabajo', la categoría por defecto de las notas existentes). */
function parseCategory(raw: string | null): 'trabajo' | 'personal' {
  return raw === 'personal' ? 'personal' : 'trabajo'
}

export default withObservability(
  'month-notes',
  async (req: Request, _context, { requestId }) => {
    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const month = url.searchParams.get('month')?.trim()
      if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        return ApiErrors.validation(requestId, 'month debe ser YYYY-MM')
      }
      const cat = parseCategory(url.searchParams.get('category'))
      const rows = await sqlTyped<MonthNoteRow>(sql`
        SELECT month_key, content, category FROM month_notes
        WHERE user_id = ${userId} AND month_key = ${month}
          AND category = ${cat} AND deleted_at IS NULL
      `)
      return Response.json({ monthKey: month, content: rows[0]?.content ?? '', category: cat })
    }

    if (req.method === 'PUT') {
      const parsed = await parseJsonBody(req, MonthNoteBody, requestId)
      if (!parsed.ok) return parsed.response
      await ensureUserRow(sql, authedUser)
      const { month, content, category: cat } = parsed.data
      const rows = await sqlTyped<MonthNoteRow>(sql`
        INSERT INTO month_notes (user_id, month_key, content, category)
        VALUES (${userId}, ${month}, ${content}, ${cat})
        ON CONFLICT (user_id, month_key, category) WHERE deleted_at IS NULL
        DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
        RETURNING month_key, content, category
      `)
      const row = rows[0]
      return Response.json({
        monthKey: row?.month_key ?? month,
        content: row?.content ?? content,
        category: (row?.category as 'trabajo' | 'personal') ?? cat,
      })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: '/api/month-notes',
}
