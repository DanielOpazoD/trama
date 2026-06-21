import { aiOffResponse, resolveAIInvocation } from './ai-mode.js'
import { ApiErrors } from './api-error.js'
import { checkMonthlyBudget } from './cost-cap.js'
import { getSql, sqlTyped } from './db.js'
import { askLLMForJson } from './llm.js'
import {
  buildRecorteSuggestPrompt,
  sanitizeSuggestion,
  type EntityLite,
} from './recorte-suggest-prompt.js'
import { buildRecorteSuggestionResponse } from './recortes-service.js'

type Sql = ReturnType<typeof getSql>

export async function suggestRecorte(
  req: Request,
  sql: Sql,
  id: string,
  userId: string,
  requestId: string,
): Promise<Response> {
  const recRows = await sqlTyped<{
    text: string
    source_url: string | null
    source_title: string | null
    source_author: string | null
  }>(sql`
    SELECT text, source_url, source_title, source_author
    FROM recortes
    WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
  `)
  const rec = recRows[0]
  if (!rec) return ApiErrors.notFound(requestId, 'Recorte no encontrado')

  const budgetExceeded = await checkMonthlyBudget(userId, requestId)
  if (budgetExceeded) return budgetExceeded

  const invocation = await resolveAIInvocation(req, 'classify', userId)
  if (invocation.kind === 'off') return aiOffResponse(requestId)

  const [typeRows, entityRows] = await Promise.all([
    sqlTyped<{ slug: string }>(
      sql`SELECT slug FROM entity_types ORDER BY sort_order, slug`,
    ),
    sqlTyped<EntityLite>(sql`
      SELECT id, name, type FROM entities
      WHERE deleted_at IS NULL AND user_id = ${userId}
      ORDER BY created_at DESC LIMIT 200
    `),
  ])
  const entityTypes = typeRows.map((r) => r.slug)
  const messages = buildRecorteSuggestPrompt(
    rec.text,
    {
      title: rec.source_title,
      url: rec.source_url,
      author: rec.source_author,
    },
    entityRows,
    entityTypes,
  )
  try {
    const { content } = await askLLMForJson(messages, {
      provider: invocation.provider,
      model: invocation.model,
    })
    const suggestion = sanitizeSuggestion(
      content,
      new Set(entityRows.map((e) => e.id)),
      new Set(entityTypes),
    )
    return Response.json(buildRecorteSuggestionResponse(suggestion, entityRows))
  } catch {
    return ApiErrors.internal(requestId, 'La IA no pudo sugerir ahora')
  }
}
