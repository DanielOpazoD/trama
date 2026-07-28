import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { askLLMForJson } from './_lib/llm.js'
import { aiOffResponse, resolveAIInvocation } from './_lib/ai-mode.js'
import {
  buildProactivePrompt,
  type DismissedSuggestion,
  type EntityForProactive,
  type ExistingRelPair,
} from './_lib/proactive-prompt.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors, ApiSuccess } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { ProactiveStatusPatchBody } from './_lib/momento-extra-schemas.js'
import { logEvent } from './_lib/observability.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'

const FALLBACK_ENTITY_TYPES = [
  'persona',
  'escritor',
  'filosofo',
  'musico',
  'banda',
  'director',
  'artista',
  'cientifico',
  'libro',
  'ensayo',
  'poema',
  'articulo',
  'cancion',
  'podcast',
  'album',
  'disco',
  'pelicula',
  'serie',
  'documental',
  'obra',
  'concepto',
  'idea',
  'lugar',
  'evento',
]
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

const MAX_ENTITIES_IN_PROMPT = 100
const MAX_QUOTES_PER_ENTITY = 3

type Suggestion = {
  id: string
  kind: string
  payload: unknown
  status: 'pending' | 'applied' | 'dismissed'
  provider: string | null
  model: string | null
  createdAt: string
  statusChangedAt: string | null
}

type SuggestionRow = {
  id: string
  kind: string
  payload: unknown
  status: 'pending' | 'applied' | 'dismissed'
  provider: string | null
  model: string | null
  created_at: string
  status_changed_at: string | null
}

function suggestionFromRow(row: SuggestionRow): Suggestion {
  return {
    id: row.id,
    kind: row.kind,
    payload: row.payload,
    status: row.status,
    provider: row.provider,
    model: row.model,
    createdAt: row.created_at,
    statusChangedAt: row.status_changed_at,
  }
}

export default withObservability(
  'proactive-suggestions',
  async (req: Request, context: Context, { requestId }) => {
    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()
    const id = context.params.id

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const status = url.searchParams.get('status') ?? 'pending'
      const rows = await sqlTyped<SuggestionRow>(sql`
        SELECT id, kind, payload, status, provider, model, created_at, status_changed_at
        FROM proactive_suggestions
        WHERE status = ${status}
          AND user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 200
      `)
      return Response.json(rows.map(suggestionFromRow))
    }

    if (req.method === 'POST') {
      await ensureUserRow(sql, authedUser)
      // Generate a fresh round of suggestions.
      const budgetExceeded = await checkMonthlyBudget(userId, requestId)
      if (budgetExceeded) return budgetExceeded

      type EntityRow = {
        id: string
        name: string
        type: string
        year: number | null
        description: string | null
      }
      type QuoteRow = { entity_id: string; text: string }
      type RelRow = { from_name: string; to_name: string; type: string }
      type TypeRow = { slug: string }
      type DismissedRow = { kind: string; payload: Record<string, unknown> }

      const [entityRows, quoteRows, relRows, entityTypeRows, relTypeRows, dismissedRows] =
        await Promise.all([
          sqlTyped<EntityRow>(sql`SELECT id, name, type, year, description
            FROM entities WHERE deleted_at IS NULL AND user_id = ${userId}
            ORDER BY created_at DESC LIMIT ${MAX_ENTITIES_IN_PROMPT}`),
          sqlTyped<QuoteRow>(sql`SELECT entity_id, text FROM quotes
            WHERE deleted_at IS NULL AND user_id = ${userId} ORDER BY created_at DESC`),
          sqlTyped<RelRow>(sql`SELECT ef.name AS from_name, et.name AS to_name, r.type
            FROM relationships r
            JOIN entities ef ON ef.id = r.from_id
              AND ef.deleted_at IS NULL
              AND ef.user_id = ${userId}
            JOIN entities et ON et.id = r.to_id
              AND et.deleted_at IS NULL
              AND et.user_id = ${userId}
            WHERE r.deleted_at IS NULL AND r.user_id = ${userId}`),
          sqlTyped<TypeRow>(sql`SELECT slug FROM entity_types ORDER BY sort_order, slug`),
          sqlTyped<TypeRow>(
            sql`SELECT slug FROM relationship_types ORDER BY sort_order, slug`,
          ),
          // Sugerencias previamente descartadas — para que el LLM NO las
          // vuelva a proponer en esta ronda.
          sqlTyped<DismissedRow>(sql`SELECT kind, payload FROM proactive_suggestions
            WHERE status = 'dismissed' AND user_id = ${userId}
            ORDER BY status_changed_at DESC NULLS LAST, created_at DESC
            LIMIT 60`),
        ])

      if (entityRows.length === 0) {
        return Response.json({ inserted: 0, suggestions: [] })
      }

      const quotesByEntity = new Map<string, string[]>()
      for (const q of quoteRows) {
        const arr = quotesByEntity.get(q.entity_id) ?? []
        if (arr.length < MAX_QUOTES_PER_ENTITY) arr.push(q.text)
        quotesByEntity.set(q.entity_id, arr)
      }
      const entities: EntityForProactive[] = entityRows.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        year: e.year,
        description: e.description,
        quotes: quotesByEntity.get(e.id) ?? [],
      }))
      const existingRels: ExistingRelPair[] = relRows.map((r) => ({
        fromName: r.from_name,
        toName: r.to_name,
        type: r.type,
      }))
      const entityTypes =
        entityTypeRows.length > 0
          ? entityTypeRows.map((r) => r.slug)
          : FALLBACK_ENTITY_TYPES
      const relationshipTypes =
        relTypeRows.length > 0
          ? relTypeRows.map((r) => r.slug)
          : FALLBACK_RELATIONSHIP_TYPES

      // Convertimos los payloads descartados en summaries legibles para que
      // el LLM entienda QUÉ se le pidió no proponer (no le pasamos el JSON
      // crudo — gastaría tokens sin agregar información).
      const dismissed: DismissedSuggestion[] = dismissedRows.map((row) => {
        const p = row.payload as Record<string, unknown>
        let summary = ''
        if (row.kind === 'relationship') {
          summary = `${p.fromName ?? '?'} → ${p.type ?? '?'} → ${p.toName ?? '?'}`
        } else if (row.kind === 'reclassification') {
          summary = `${p.name ?? '?'}: ${p.oldType ?? '?'} → ${p.newType ?? '?'}`
        } else if (row.kind === 'description') {
          summary = `descripción para "${p.name ?? '?'}"`
        } else {
          summary = JSON.stringify(p).slice(0, 80)
        }
        return { kind: row.kind, summary }
      })

      const messages = buildProactivePrompt(
        entities,
        existingRels,
        entityTypes,
        relationshipTypes,
        dismissed,
      )
      const entityIds = new Set(entityRows.map((e) => e.id))
      const validEntityTypes = new Set(entityTypes)
      const validRelTypes = new Set(relationshipTypes)
      const entityNamesLower = new Map(
        entityRows.map((e) => [e.name.trim().toLowerCase(), e]),
      )
      const existingPairKey = new Set(
        existingRels.map(
          (r) =>
            `${r.fromName.trim().toLowerCase()}|${r.type}|${r.toName.trim().toLowerCase()}`,
        ),
      )

      const invocation = await resolveAIInvocation(req, 'suggest-relationships', userId)
      if (invocation.kind === 'off') return aiOffResponse(requestId)

      try {
        const { content, usage } = await askLLMForJson(messages, {
          provider: invocation.provider,
          model: invocation.model,
        })

        const raw = (content ?? {}) as { suggestions?: unknown }
        type CleanSuggestion = { kind: string; payload: Record<string, unknown> }
        const accepted: CleanSuggestion[] = []

        if (Array.isArray(raw.suggestions)) {
          for (const item of raw.suggestions as Array<Record<string, unknown>>) {
            if (typeof item !== 'object' || item === null) continue
            const kind = String(item.kind ?? '')

            if (kind === 'relationship') {
              const fromName =
                typeof item.fromName === 'string' ? item.fromName.trim() : ''
              const toName = typeof item.toName === 'string' ? item.toName.trim() : ''
              const type = typeof item.type === 'string' ? item.type.trim() : ''
              const reason = typeof item.reason === 'string' ? item.reason.trim() : ''
              if (!fromName || !toName || !type || !reason) continue
              if (!validRelTypes.has(type)) continue
              if (!entityNamesLower.has(fromName.toLowerCase())) continue
              if (!entityNamesLower.has(toName.toLowerCase())) continue
              if (fromName.toLowerCase() === toName.toLowerCase()) continue
              const key = `${fromName.toLowerCase()}|${type}|${toName.toLowerCase()}`
              if (existingPairKey.has(key)) continue
              accepted.push({
                kind,
                payload: { fromName, toName, type, reason },
              })
              continue
            }

            if (kind === 'reclassification') {
              const entityId =
                typeof item.entityId === 'string' ? item.entityId.trim() : ''
              const newType = typeof item.newType === 'string' ? item.newType.trim() : ''
              const name = typeof item.name === 'string' ? item.name.trim() : ''
              const reason = typeof item.reason === 'string' ? item.reason.trim() : ''
              if (!entityId || !newType || !name || !reason) continue
              if (!entityIds.has(entityId)) continue
              if (!validEntityTypes.has(newType)) continue
              const row = entityRows.find((e) => e.id === entityId)
              if (!row || row.type === newType) continue
              accepted.push({
                kind,
                payload: { entityId, name, oldType: row.type, newType, reason },
              })
              continue
            }

            if (kind === 'description') {
              const entityId =
                typeof item.entityId === 'string' ? item.entityId.trim() : ''
              const description =
                typeof item.description === 'string' ? item.description.trim() : ''
              const name = typeof item.name === 'string' ? item.name.trim() : ''
              const reason = typeof item.reason === 'string' ? item.reason.trim() : ''
              if (!entityId || !description || !name || !reason) continue
              if (!entityIds.has(entityId)) continue
              const row = entityRows.find((e) => e.id === entityId)
              // Skip if entity already has a description — proactive shouldn't overwrite.
              if (!row || (row.description ?? '').trim() !== '') continue
              accepted.push({
                kind,
                payload: { entityId, name, description, reason },
              })
              continue
            }
          }
        }

        // Persist each. Earlier pending duplicates of the same payload are kept;
        // we don't dedupe across rounds aggressively — the UI can clear.
        const inserted: Suggestion[] = []
        for (const s of accepted) {
          const rows = await sqlTyped<SuggestionRow>(sql`
            INSERT INTO proactive_suggestions (kind, payload, provider, model, user_id)
            VALUES (${s.kind}, ${JSON.stringify(s.payload)}::jsonb, ${usage.provider}, ${usage.model}, ${userId})
            RETURNING id, kind, payload, status, provider, model, created_at, status_changed_at
          `)
          const r = rows[0]
          if (!r) continue
          inserted.push(suggestionFromRow(r))
        }

        logEvent({
          event: 'proactive_suggestions_generated',
          provider: usage.provider,
          model: usage.model,
          tokensIn: usage.tokensIn,
          tokensOut: usage.tokensOut,
          costCents: usage.costCents,
          durationMs: usage.durationMs,
          entitiesIn: entities.length,
          inserted: inserted.length,
        })

        sql`
          INSERT INTO extraction_log (
            input_text, proposal, provider, model, tokens_in, tokens_out, cost_cents, duration_ms, user_id
          ) VALUES (
            ${'proactive-suggestions'},
            ${JSON.stringify({ inserted: inserted.length })}::jsonb,
            ${usage.provider},
            ${usage.model},
            ${usage.tokensIn},
            ${usage.tokensOut},
            ${usage.costCents},
            ${usage.durationMs},
            ${userId}
          )
        `.catch(() => {})

        return Response.json({ inserted: inserted.length, suggestions: inserted })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return ApiErrors.upstream(requestId, `Error generando sugerencias: ${message}`)
      }
    }

    if (req.method === 'PATCH' && id) {
      const parsed = await parseJsonBody(req, ProactiveStatusPatchBody, requestId)
      if (!parsed.ok) return parsed.response
      const { status: nextStatus } = parsed.data
      await sql`
        UPDATE proactive_suggestions
        SET status = ${nextStatus}, status_changed_at = NOW()
        WHERE id = ${id} AND user_id = ${userId}
      `
      return ApiSuccess.noContent()
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: ['/api/proactive-suggestions', '/api/proactive-suggestions/:id'],
}
