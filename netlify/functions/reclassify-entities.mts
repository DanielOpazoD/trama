import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { askLLMForJson } from './_lib/llm.js'
import { resolveTaskProvider } from './_lib/ai-tasks.js'
import {
  buildReclassifyPrompt,
  type EntityForReclassify,
  type ReclassifyTypeOption,
} from './_lib/reclassify-prompt.js'
import {
  validateReclassify,
  type EntityLookup,
} from './_lib/reclassify-validate.js'
import { withObservability } from './_lib/handler-wrap.js'
import { logEvent } from './_lib/observability.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'

const MAX_ENTITIES = 120
const MAX_QUOTES_PER_ENTITY = 3

export default withObservability(
  'reclassify-entities',
  async (req: Request, _context: Context) => {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const budgetExceeded = await checkMonthlyBudget()
    if (budgetExceeded) return budgetExceeded

    const sql = getSql()

    type EntityRow = {
      id: string
      name: string
      type: string
      year: number | null
      description: string | null
    }
    type QuoteRow = { entity_id: string; text: string }
    type TypeRow = { slug: string; label: string }

    const [entityRows, quoteRows, typeRows] = await Promise.all([
      sql`SELECT id, name, type, year, description
          FROM entities
          WHERE deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${MAX_ENTITIES}` as unknown as Promise<EntityRow[]>,
      sql`SELECT entity_id, text
          FROM quotes
          WHERE deleted_at IS NULL
          ORDER BY created_at DESC` as unknown as Promise<QuoteRow[]>,
      sql`SELECT slug, label FROM entity_types ORDER BY sort_order, slug` as unknown as Promise<TypeRow[]>,
    ])

    if (entityRows.length === 0 || typeRows.length === 0) {
      return Response.json({ reclassifications: [] })
    }

    const quotesByEntity = new Map<string, string[]>()
    for (const q of quoteRows) {
      const arr = quotesByEntity.get(q.entity_id) ?? []
      if (arr.length < MAX_QUOTES_PER_ENTITY) arr.push(q.text)
      quotesByEntity.set(q.entity_id, arr)
    }

    const entitiesForPrompt: EntityForReclassify[] = entityRows.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      year: e.year,
      description: e.description,
      quotes: quotesByEntity.get(e.id) ?? [],
    }))

    const typeOptions: ReclassifyTypeOption[] = typeRows.map((t) => ({
      slug: t.slug,
      label: t.label,
    }))

    const messages = buildReclassifyPrompt(entitiesForPrompt, typeOptions)

    try {
      const taskCfg = await resolveTaskProvider('reclassify')
      const { content, usage, fromCache } = await askLLMForJson(messages, {
        provider: taskCfg.provider || undefined,
        model: taskCfg.model,
      })
      const entityLookup: EntityLookup[] = entityRows.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
      }))
      const validTypes = new Set(typeRows.map((t) => t.slug))
      const reclassifications = validateReclassify(content, entityLookup, validTypes)

      logEvent({
        event: 'reclassify_entities_completed',
        provider: usage.provider,
        model: usage.model,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        costCents: usage.costCents,
        durationMs: usage.durationMs,
        fromCache,
        entitiesIn: entitiesForPrompt.length,
        proposed: reclassifications.length,
      })

      sql`
        INSERT INTO extraction_log (
          input_text, proposal, provider, model, tokens_in, tokens_out, cost_cents, duration_ms
        ) VALUES (
          ${'reclassify-entities'},
          ${JSON.stringify({ reclassifications })}::jsonb,
          ${usage.provider},
          ${usage.model},
          ${usage.tokensIn},
          ${usage.tokensOut},
          ${usage.costCents},
          ${usage.durationMs}
        )
      `.catch(() => {})

      return Response.json({ reclassifications })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sql`
        INSERT INTO extraction_log (input_text, proposal, provider, model, error)
        VALUES (${'reclassify-entities'}, '{}'::jsonb, ${'unknown'}, ${'unknown'}, ${message})
      `.catch(() => {})
      return new Response(`Error llamando al LLM: ${message}`, { status: 502 })
    }
  },
)

export const config: Config = {
  path: '/api/reclassify-entities',
}
