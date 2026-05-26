import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { askLLMForJson } from './_lib/llm.js'
import { aiOffResponse, resolveAIInvocation } from './_lib/ai-mode.js'
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
import { ApiErrors } from './_lib/api-error.js'
import { logEvent } from './_lib/observability.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'
import { crossVerify, type VerifyVerdict } from './_lib/cross-verify.js'

const MAX_ENTITIES = 120
const MAX_QUOTES_PER_ENTITY = 3

export default withObservability(
  'reclassify-entities',
  async (req: Request, _context: Context, { requestId }) => {
    if (req.method !== 'POST') {
      return ApiErrors.methodNotAllowed(requestId)
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

    const invocation = await resolveAIInvocation(req, 'reclassify')
    if (invocation.kind === 'off') return aiOffResponse()

    try {
      const { content, usage, fromCache } = await askLLMForJson(messages, {
        provider: invocation.provider,
        model: invocation.model,
      })
      const entityLookup: EntityLookup[] = entityRows.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
      }))
      const validTypes = new Set(typeRows.map((t) => t.slug))
      const reclassifications = validateReclassify(content, entityLookup, validTypes)

      // Optional cross-verification. Only fires if (a) the user configured a
      // verifier for this task, (b) it's a different provider than the
      // primary, and (c) we actually have proposals worth reviewing.
      let verifications: VerifyVerdict[] = []
      let verifierProvider: string | null = null
      let verifierUsage: typeof usage | null = null
      if (
        invocation.verifyWith &&
        invocation.verifyWith !== (invocation.provider || '') &&
        invocation.verifyWith !== usage.provider &&
        reclassifications.length > 0
      ) {
        const result = await crossVerify({
          items: reclassifications,
          describe: (r) =>
            `"${r.name}" — actualmente "${r.oldType}", propuesto "${r.newType}"${
              r.reason ? ` (razón: ${r.reason})` : ''
            }`,
          context: 'cambios de tipo (reclasificación de entidades)',
          verifierProvider: invocation.verifyWith,
          primaryProviderName: usage.provider,
        })
        verifierProvider = invocation.verifyWith
        verifierUsage = result.usage
        verifications = reclassifications.map(
          (_, i) => result.verdictsByIndex.get(i) ?? { agreed: true },
        )
      }

      const responseBody = {
        reclassifications: reclassifications.map((r, i) => ({
          ...r,
          ...(verifierProvider
            ? { verification: { ...verifications[i], verifier: verifierProvider } }
            : {}),
        })),
        verifierProvider,
      }

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
        verifier: verifierProvider,
        verifierCostCents: verifierUsage?.costCents ?? 0,
      })

      sql`
        INSERT INTO extraction_log (
          input_text, proposal, provider, model, tokens_in, tokens_out, cost_cents, duration_ms
        ) VALUES (
          ${'reclassify-entities'},
          ${JSON.stringify(responseBody)}::jsonb,
          ${usage.provider},
          ${usage.model},
          ${usage.tokensIn + (verifierUsage?.tokensIn ?? 0)},
          ${usage.tokensOut + (verifierUsage?.tokensOut ?? 0)},
          ${usage.costCents + (verifierUsage?.costCents ?? 0)},
          ${usage.durationMs + (verifierUsage?.durationMs ?? 0)}
        )
      `.catch(() => {})

      return Response.json(responseBody)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sql`
        INSERT INTO extraction_log (input_text, proposal, provider, model, error)
        VALUES (${'reclassify-entities'}, '{}'::jsonb, ${'unknown'}, ${'unknown'}, ${message})
      `.catch(() => {})
      return ApiErrors.upstream(requestId, `Error llamando al LLM: ${message}`)
    }
  },
)

export const config: Config = {
  path: '/api/reclassify-entities',
}
