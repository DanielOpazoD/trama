/**
 * U-4: Crónicas — ensayos mensuales generados por IA que conectan las
 * entidades más tocadas del mes anterior.
 *
 * Endpoints:
 *   GET  /api/cronicas                  → lista todas las crónicas del usuario
 *   POST /api/cronicas/generate         → genera una crónica para (year, month)
 *                                          si todavía no existe. Body: { year, month }
 *
 * La generación es **idempotente**: el UNIQUE (user_id, year, month) blinda
 * el caso de dos requests concurrentes (segunda recibe la primera ya
 * guardada). Si la crónica ya existe, POST devuelve la existente sin
 * llamar al LLM (200 OK, no error).
 *
 * "Más tocadas" = entidades con quotes o relationships agregados/editados
 * en el mes. Score = quote_count * 2 + rel_count (las citas pesan más
 * porque señalan engagement profundo).
 *
 * Si no hay actividad suficiente en el mes (0 entidades tocadas),
 * devolvemos 422 con un message editorial. La UI muestra eso como
 * "este mes no hubo material para una crónica".
 */

import type { Config, Context } from '@netlify/functions'
import { z } from 'zod'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { aiOffResponse, resolveAIInvocation } from './_lib/ai-mode.js'
import { askLLMForText } from './_lib/llm.js'
import { logEvent } from './_lib/observability.js'
import {
  buildCronicaMessages,
  monthName,
  type CronicaEntity,
} from './_lib/cronica-prompt.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'
import { ensureUserRow } from './_lib/user-provisioning.js'

type CronicaRow = {
  id: string
  year: number
  month: number
  text: string
  source_entity_ids: string[]
  generated_at: string
  provider: string | null
  model: string | null
}

const GenerateBody = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
})

const TOP_ENTITIES_LIMIT = 7
const QUOTES_PER_ENTITY = 3

export default withObservability(
  'cronicas',
  async (req: Request, _context: Context, { requestId }) => {
    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()
    const url = new URL(req.url)

    if (req.method === 'GET' && url.pathname === '/api/cronicas') {
      const rows = await sqlTyped<CronicaRow>(sql`
        SELECT id, year, month, text, source_entity_ids,
               generated_at, provider, model
        FROM cronicas
        WHERE user_id = ${userId}
        ORDER BY year DESC, month DESC
      `)
      return Response.json(
        rows.map((r) => ({
          id: r.id,
          year: r.year,
          month: r.month,
          text: r.text,
          sourceEntityIds: r.source_entity_ids ?? [],
          generatedAt: r.generated_at,
          provider: r.provider,
          model: r.model,
        })),
      )
    }

    if (req.method === 'POST' && url.pathname === '/api/cronicas/generate') {
      const parsed = await parseJsonBody(req, GenerateBody, requestId)
      if (!parsed.ok) return parsed.response
      await ensureUserRow(sql, authedUser)
      const { year, month } = parsed.data

      // Idempotencia: si ya existe, devolverla sin llamar al LLM.
      const existing = await sqlTyped<CronicaRow>(sql`
        SELECT id, year, month, text, source_entity_ids,
               generated_at, provider, model
        FROM cronicas
        WHERE user_id = ${userId} AND year = ${year} AND month = ${month}
        LIMIT 1
      `)
      if (existing.length > 0) {
        const r = existing[0]!
        return Response.json({
          id: r.id,
          year: r.year,
          month: r.month,
          text: r.text,
          sourceEntityIds: r.source_entity_ids ?? [],
          generatedAt: r.generated_at,
          provider: r.provider,
          model: r.model,
          alreadyExisted: true,
        })
      }

      // Ventana del mes: [primer día 00:00, primer día del mes siguiente 00:00).
      // Usar UTC para no depender de timezone del runtime.
      const startTs = new Date(Date.UTC(year, month - 1, 1)).toISOString()
      const endTs = new Date(Date.UTC(year, month, 1)).toISOString()

      // Top-N entidades por actividad del mes.
      type ActivityRow = {
        id: string
        name: string
        type: string
        description: string | null
        year: number | null
        quote_count: number
        rel_count: number
      }
      const activity = await sqlTyped<ActivityRow>(sql`
        WITH q AS (
          SELECT entity_id, COUNT(*)::int AS c
          FROM quotes
          WHERE user_id = ${userId} AND deleted_at IS NULL
            AND created_at >= ${startTs} AND created_at < ${endTs}
          GROUP BY entity_id
        ),
        r AS (
          SELECT entity_id, COUNT(*)::int AS c FROM (
            SELECT from_id AS entity_id FROM relationships
              WHERE user_id = ${userId} AND deleted_at IS NULL
                AND created_at >= ${startTs} AND created_at < ${endTs}
            UNION ALL
            SELECT to_id AS entity_id FROM relationships
              WHERE user_id = ${userId} AND deleted_at IS NULL
                AND created_at >= ${startTs} AND created_at < ${endTs}
          ) u GROUP BY entity_id
        )
        SELECT e.id, e.name, e.type, e.description, e.year,
               COALESCE(q.c, 0) AS quote_count,
               COALESCE(r.c, 0) AS rel_count
        FROM entities e
        LEFT JOIN q ON q.entity_id = e.id
        LEFT JOIN r ON r.entity_id = e.id
        WHERE e.deleted_at IS NULL AND e.user_id = ${userId}
          AND (COALESCE(q.c, 0) + COALESCE(r.c, 0)) > 0
        ORDER BY (COALESCE(q.c, 0) * 2 + COALESCE(r.c, 0)) DESC,
                 e.name ASC
        LIMIT ${TOP_ENTITIES_LIMIT}
      `)

      if (activity.length === 0) {
        return ApiErrors.unprocessable(
          requestId,
          `No hay actividad suficiente en ${monthName(month)} de ${year} para escribir una crónica.`,
        )
      }

      const entityIds = activity.map((a) => a.id)

      // Citas recientes de cada entidad (del mes en curso, no de su
      // historia entera — la crónica habla del MES).
      type QuoteRow = {
        entity_id: string
        text: string
        source: string | null
      }
      const quotes = await sqlTyped<QuoteRow>(sql`
        SELECT entity_id, text, source
        FROM quotes
        WHERE user_id = ${userId}
          AND deleted_at IS NULL
          AND entity_id = ANY(${entityIds}::uuid[])
          AND created_at >= ${startTs}
          AND created_at < ${endTs}
        ORDER BY created_at DESC
      `)

      const quotesByEntity = new Map<string, QuoteRow[]>()
      for (const q of quotes) {
        const arr = quotesByEntity.get(q.entity_id) ?? []
        if (arr.length < QUOTES_PER_ENTITY) arr.push(q)
        quotesByEntity.set(q.entity_id, arr)
      }

      const cronicaEntities: CronicaEntity[] = activity.map((a) => ({
        name: a.name,
        type: a.type,
        description: a.description,
        year: a.year,
        quoteCount: a.quote_count,
        relCount: a.rel_count,
        recentQuotes: (quotesByEntity.get(a.id) ?? []).map((q) => ({
          text: q.text,
          source: q.source,
        })),
      }))

      const messages = buildCronicaMessages({ year, month, entities: cronicaEntities })
      const budgetExceeded = await checkMonthlyBudget(userId, requestId)
      if (budgetExceeded) return budgetExceeded

      const invocation = await resolveAIInvocation(req, 'reflect', userId)
      if (invocation.kind === 'off') return aiOffResponse(requestId)

      const { content, usage, fromCache } = await askLLMForText(messages, {
        provider: invocation.provider,
        model: invocation.model,
      })
      const text = typeof content === 'string' ? content.trim() : String(content).trim()

      logEvent({
        event: 'cronica_generated',
        year,
        month,
        topEntities: activity.length,
        provider: usage.provider,
        model: usage.model,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        costCents: usage.costCents,
        durationMs: usage.durationMs,
        fromCache,
      })

      sql`
        INSERT INTO extraction_log (
          input_text, proposal, provider, model, tokens_in, tokens_out, cost_cents, duration_ms, user_id
        ) VALUES (
          ${`cronicas:${year}-${String(month).padStart(2, '0')}`},
          ${JSON.stringify({ sourceEntityIds: entityIds, preview: text.slice(0, 280) })}::jsonb,
          ${usage.provider},
          ${usage.model},
          ${usage.tokensIn},
          ${usage.tokensOut},
          ${usage.costCents},
          ${usage.durationMs},
          ${userId}
        )
      `.catch(() => {})

      const inserted = await sqlTyped<CronicaRow>(sql`
        INSERT INTO cronicas (user_id, year, month, text, source_entity_ids, provider, model)
        VALUES (
          ${userId},
          ${year},
          ${month},
          ${text},
          ${JSON.stringify(entityIds)}::jsonb,
          ${usage.provider},
          ${usage.model}
        )
        ON CONFLICT (user_id, year, month) DO UPDATE SET
          text = EXCLUDED.text,
          source_entity_ids = EXCLUDED.source_entity_ids,
          provider = EXCLUDED.provider,
          model = EXCLUDED.model,
          generated_at = NOW()
        RETURNING id, year, month, text, source_entity_ids,
                  generated_at, provider, model
      `)
      const row = inserted[0]!
      return Response.json({
        id: row.id,
        year: row.year,
        month: row.month,
        text: row.text,
        sourceEntityIds: row.source_entity_ids ?? [],
        generatedAt: row.generated_at,
        provider: row.provider,
        model: row.model,
        alreadyExisted: false,
      })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: ['/api/cronicas', '/api/cronicas/generate'],
}
