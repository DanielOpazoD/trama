import type { Config, Context } from '@netlify/functions'
import { z } from 'zod'
import { getSql, sqlTyped } from './_lib/db.js'
import { askLLMForJson } from './_lib/llm.js'
import { aiOffResponse, resolveAIInvocation } from './_lib/ai-mode.js'
import {
  buildSuggestRelationshipsPrompt,
  type EntityForSuggest,
  type ExistingRelationshipPair,
} from './_lib/suggest-relationships-prompt.js'
import { validateExtraction } from './_lib/extract-validate.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { logEvent } from './_lib/observability.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'
import { crossVerify, type VerifyVerdict } from './_lib/cross-verify.js'
import { parseJsonBody } from './_lib/zod-body.js'

const FALLBACK_RELATIONSHIP_TYPES = [
  'influye_en',
  'cita_a',
  'responde_a',
  'me_llego_por',
  'suena_como',
  'inspira',
  'contradice',
  'asociado_con',
]

// Cap on how many entities we send to the LLM in one call. Keeps tokens (and
// cost) bounded; beyond this the proposal quality also degrades because the
// model can't reason carefully about hundreds of items at once.
const MAX_ENTITIES = 80
// Per-entity quote cap before passing to the prompt.
const MAX_QUOTES_PER_ENTITY = 5

const SuggestRelationshipsBody = z.object({
  avoidPrevious: z
    .array(
      z.object({
        fromName: z.string().trim().min(1),
        toName: z.string().trim().min(1),
        type: z.string().trim().min(1),
      }),
    )
    .optional()
    .default([]),
})

export default withObservability(
  'suggest-relationships',
  async (req: Request, _context: Context, { requestId }) => {
    if (req.method !== 'POST') {
      return ApiErrors.methodNotAllowed(requestId)
    }

    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()
    await ensureUserRow(sql, authedUser)

    const budgetExceeded = await checkMonthlyBudget(userId, requestId)
    if (budgetExceeded) return budgetExceeded

    // η2: body opcional. Si el usuario clickeó "descubrir IA" tras
    // descartar sugerencias, el cliente nos manda las descartadas
    // para que la IA proponga DIFERENTES.
    const rawBody = await req.text()
    const parsed = await parseJsonBody(
      new Request(req.url, {
        method: req.method,
        body: rawBody.trim() ? rawBody : '{}',
      }),
      SuggestRelationshipsBody,
      requestId,
    )
    if (!parsed.ok) return parsed.response
    const avoidPrevious = parsed.data.avoidPrevious

    type EntityRow = {
      id: string
      name: string
      type: string
      year: number | null
      description: string | null
    }
    type QuoteRow = { entity_id: string; text: string }
    type RelRow = { from_name: string; to_name: string; type: string }

    const [entityRows, quoteRows, relRows, relTypeRows] = await Promise.all([
      sqlTyped<EntityRow>(sql`SELECT id, name, type, year, description
          FROM entities
          WHERE deleted_at IS NULL AND user_id = ${userId}
          ORDER BY created_at DESC
          LIMIT ${MAX_ENTITIES}`),
      sqlTyped<QuoteRow>(sql`SELECT entity_id, text
          FROM quotes
          WHERE deleted_at IS NULL AND user_id = ${userId}
          ORDER BY created_at DESC`),
      sqlTyped<RelRow>(sql`SELECT ef.name AS from_name, et.name AS to_name, r.type
          FROM relationships r
          JOIN entities ef ON ef.id = r.from_id
            AND ef.deleted_at IS NULL
            AND ef.user_id = ${userId}
          JOIN entities et ON et.id = r.to_id
            AND et.deleted_at IS NULL
            AND et.user_id = ${userId}
          WHERE r.deleted_at IS NULL AND r.user_id = ${userId}`),
      sqlTyped<{ slug: string }>(
        sql`SELECT slug FROM relationship_types ORDER BY sort_order, slug`,
      ),
    ])

    if (entityRows.length < 2) {
      return Response.json({ entities: [], relationships: [], quotes: [] })
    }

    const quotesByEntity = new Map<string, string[]>()
    for (const q of quoteRows) {
      const arr = quotesByEntity.get(q.entity_id) ?? []
      if (arr.length < MAX_QUOTES_PER_ENTITY) arr.push(q.text)
      quotesByEntity.set(q.entity_id, arr)
    }

    const entitiesForPrompt: EntityForSuggest[] = entityRows.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      year: e.year,
      description: e.description,
      quotes: quotesByEntity.get(e.id) ?? [],
    }))

    const existingRels: ExistingRelationshipPair[] = relRows.map((r) => ({
      fromName: r.from_name,
      toName: r.to_name,
      type: r.type,
    }))

    const relationshipTypes =
      relTypeRows.length > 0
        ? relTypeRows.map((r) => r.slug)
        : FALLBACK_RELATIONSHIP_TYPES

    const messages = buildSuggestRelationshipsPrompt(
      entitiesForPrompt,
      existingRels,
      relationshipTypes,
      avoidPrevious,
    )

    const invocation = await resolveAIInvocation(req, 'suggest-relationships', userId)
    if (invocation.kind === 'off') return aiOffResponse(requestId)

    try {
      const { content, usage, fromCache } = await askLLMForJson(messages, {
        provider: invocation.provider,
        model: invocation.model,
        // η2: nonce por request — el usuario clickeó otra vez tras
        // descartar; queremos sugerencias nuevas. Si avoidPrevious tiene
        // elementos, el prompt ya cambió (cache bypass automático); si
        // no, el nonce fuerza fresh. Timestamp basta.
        freshNonce: Date.now(),
      })
      const existingEntitiesForValidator = entityRows.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
      }))

      // validateExtraction handles entities/relationships/quotes together; we
      // pass empty validEntityTypes so it filters out any rogue entities the
      // model invents, and a non-empty relationship-type set so relationships
      // pass through.
      const cleaned = validateExtraction(
        content,
        existingEntitiesForValidator,
        new Set<string>(), // no new entities allowed
        new Set(relationshipTypes),
      )

      // Belt-and-suspenders: drop any relationship that references a name not
      // in the existing-entities list. The prompt forbids this, but enforce it.
      const validNames = new Set(
        existingEntitiesForValidator.map((e) => e.name.trim().toLowerCase()),
      )
      const existingPairKey = new Set(
        existingRels.map(
          (r) =>
            `${r.fromName.trim().toLowerCase()}|${r.type}|${r.toName.trim().toLowerCase()}`,
        ),
      )
      const filteredRelationships = cleaned.relationships.filter((r) => {
        const fn = r.fromName.trim().toLowerCase()
        const tn = r.toName.trim().toLowerCase()
        if (!validNames.has(fn) || !validNames.has(tn)) return false
        if (fn === tn) return false
        // Dedupe against existing (same direction + type).
        if (existingPairKey.has(`${fn}|${r.type}|${tn}`)) return false
        return true
      })

      // Optional cross-verification with a second provider.
      let verifications: VerifyVerdict[] = []
      let verifierProvider: string | null = null
      let verifierUsage: typeof usage | null = null
      if (
        invocation.verifyWith &&
        invocation.verifyWith !== (invocation.provider || '') &&
        invocation.verifyWith !== usage.provider &&
        filteredRelationships.length > 0
      ) {
        const result = await crossVerify({
          items: filteredRelationships,
          describe: (r) =>
            `${r.fromName} → ${r.type} → ${r.toName}${r.notes ? ` (${r.notes})` : ''}`,
          context: 'nuevas relaciones propuestas entre entidades existentes',
          verifierProvider: invocation.verifyWith,
          primaryProviderName: usage.provider,
        })
        verifierProvider = invocation.verifyWith
        verifierUsage = result.usage
        verifications = filteredRelationships.map(
          (_, i) => result.verdictsByIndex.get(i) ?? { agreed: true },
        )
      }

      const relationshipsWithVerdicts = filteredRelationships.map((r, i) =>
        verifierProvider
          ? { ...r, verification: { ...verifications[i], verifier: verifierProvider } }
          : r,
      )

      const result = {
        entities: [],
        relationships: relationshipsWithVerdicts,
        quotes: [],
        verifierProvider,
        provider: usage.provider,
        model: usage.model,
      }

      logEvent({
        event: 'suggest_relationships_completed',
        provider: usage.provider,
        model: usage.model,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        costCents: usage.costCents,
        durationMs: usage.durationMs,
        fromCache,
        entitiesIn: entitiesForPrompt.length,
        existingRels: existingRels.length,
        proposedRelationships: filteredRelationships.length,
        verifier: verifierProvider,
        verifierCostCents: verifierUsage?.costCents ?? 0,
      })

      sql`
        INSERT INTO extraction_log (
          input_text, proposal, provider, model, tokens_in, tokens_out, cost_cents, duration_ms, user_id
        ) VALUES (
          ${'suggest-relationships'},
          ${JSON.stringify(result)}::jsonb,
          ${usage.provider},
          ${usage.model},
          ${usage.tokensIn + (verifierUsage?.tokensIn ?? 0)},
          ${usage.tokensOut + (verifierUsage?.tokensOut ?? 0)},
          ${usage.costCents + (verifierUsage?.costCents ?? 0)},
          ${usage.durationMs + (verifierUsage?.durationMs ?? 0)},
          ${userId}
        )
      `.catch(() => {})

      return Response.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sql`
        INSERT INTO extraction_log (input_text, proposal, provider, model, error, user_id)
        VALUES (${'suggest-relationships'}, '{}'::jsonb, ${'unknown'}, ${'unknown'}, ${message}, ${userId})
      `.catch(() => {})
      return ApiErrors.upstream(requestId, `Error llamando al LLM: ${message}`)
    }
  },
)

export const config: Config = {
  path: '/api/suggest-relationships',
}
