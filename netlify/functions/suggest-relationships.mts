import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { askLLMForJson } from './_lib/llm.js'
import { aiOffResponse, resolveAIInvocation } from './_lib/ai-mode.js'
import {
  buildSuggestRelationshipsPrompt,
  type EntityForSuggest,
  type ExistingRelationshipPair,
} from './_lib/suggest-relationships-prompt.js'
import { validateExtraction } from './_lib/extract-validate.js'
import { withObservability } from './_lib/handler-wrap.js'
import { logEvent } from './_lib/observability.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'
import { crossVerify, type VerifyVerdict } from './_lib/cross-verify.js'

const FALLBACK_RELATIONSHIP_TYPES = [
  'influye_en', 'cita_a', 'responde_a', 'me_llego_por',
  'suena_como', 'inspira', 'contradice', 'asociado_con',
]

// Cap on how many entities we send to the LLM in one call. Keeps tokens (and
// cost) bounded; beyond this the proposal quality also degrades because the
// model can't reason carefully about hundreds of items at once.
const MAX_ENTITIES = 80
// Per-entity quote cap before passing to the prompt.
const MAX_QUOTES_PER_ENTITY = 5

export default withObservability(
  'suggest-relationships',
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
    type RelRow = { from_name: string; to_name: string; type: string }

    const [entityRows, quoteRows, relRows, relTypeRows] = await Promise.all([
      sql`SELECT id, name, type, year, description
          FROM entities
          WHERE deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${MAX_ENTITIES}` as unknown as Promise<EntityRow[]>,
      sql`SELECT entity_id, text
          FROM quotes
          WHERE deleted_at IS NULL
          ORDER BY created_at DESC` as unknown as Promise<QuoteRow[]>,
      sql`SELECT ef.name AS from_name, et.name AS to_name, r.type
          FROM relationships r
          JOIN entities ef ON ef.id = r.from_id
          JOIN entities et ON et.id = r.to_id
          WHERE r.deleted_at IS NULL` as unknown as Promise<RelRow[]>,
      sql`SELECT slug FROM relationship_types ORDER BY sort_order, slug` as unknown as Promise<Array<{ slug: string }>>,
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
    )

    const invocation = await resolveAIInvocation(req, 'suggest-relationships')
    if (invocation.kind === 'off') return aiOffResponse()

    try {
      const { content, usage, fromCache } = await askLLMForJson(messages, {
        provider: invocation.provider,
        model: invocation.model,
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
          input_text, proposal, provider, model, tokens_in, tokens_out, cost_cents, duration_ms
        ) VALUES (
          ${'suggest-relationships'},
          ${JSON.stringify(result)}::jsonb,
          ${usage.provider},
          ${usage.model},
          ${usage.tokensIn},
          ${usage.tokensOut},
          ${usage.costCents},
          ${usage.durationMs}
        )
      `.catch(() => {})

      return Response.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sql`
        INSERT INTO extraction_log (input_text, proposal, provider, model, error)
        VALUES (${'suggest-relationships'}, '{}'::jsonb, ${'unknown'}, ${'unknown'}, ${message})
      `.catch(() => {})
      return new Response(`Error llamando al LLM: ${message}`, { status: 502 })
    }
  },
)

export const config: Config = {
  path: '/api/suggest-relationships',
}
