/**
 * Bloque #5: Atlas temático — agrupa las entidades de la trama por
 * cercanía semántica (embeddings) en "constelaciones" nombradas por IA.
 *
 * Endpoints:
 *   GET  /api/atlas            → lee el snapshot guardado y resuelve los
 *                                miembros vivos. Cero costo LLM.
 *   POST /api/atlas/generate   → re-clusteriza las entidades con embedding,
 *                                nombra las constelaciones en UNA llamada
 *                                al LLM, y persiste el snapshot.
 *
 * Es un artefacto generado con caché, igual que las Crónicas: el costo de
 * la IA se paga solo al regenerar; las cargas normales (GET) solo leen.
 * Single row por usuario — el atlas es una foto del estado actual, no un
 * historial. ON CONFLICT (user_id) pisa la foto anterior.
 *
 * El GET resuelve memberIds → entidades al vuelo (filtrando soft-deletes),
 * así el atlas no muestra entidades borradas aunque no se regenere.
 */

import type { Config, Context } from '@netlify/functions'
import { z } from 'zod'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { aiOffResponse, resolveAIInvocation } from './_lib/ai-mode.js'
import { askLLMForJson } from './_lib/llm.js'
import { logEvent } from './_lib/observability.js'
import { chooseK, kmeans, normalize, type Vec } from './_lib/cluster.js'
import { buildAtlasNamingMessages } from './_lib/atlas-prompt.js'

/** Mínimo de entidades-con-embedding para que un atlas tenga sentido. */
const MIN_ENTITIES = 6

type StoredCluster = {
  id: string
  name: string
  summary: string
  memberIds: string[]
}

type SnapshotRow = {
  entity_count: number
  clusters: StoredCluster[]
  generated_at: string
  provider: string | null
  model: string | null
}

type MemberRow = {
  id: string
  name: string
  type: string
  year: number | null
}

const NamingResponse = z.object({
  constelaciones: z.array(
    z.object({
      index: z.number().int(),
      name: z.string().trim().min(1),
      summary: z.string().trim().default(''),
    }),
  ),
})

/** pgvector vuelve como string "[0.1,0.2,…]" desde Neon; lo parseamos. */
function parseVec(raw: unknown): number[] | null {
  if (Array.isArray(raw)) return raw as number[]
  if (typeof raw === 'string') {
    try {
      const v = JSON.parse(raw)
      return Array.isArray(v) ? (v as number[]) : null
    } catch {
      return null
    }
  }
  return null
}

/** Acepta el content del LLM como objeto ya parseado o como string JSON. */
function coerceJson(content: unknown): unknown {
  if (typeof content === 'string') {
    const cleaned = content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```$/, '')
    try {
      return JSON.parse(cleaned)
    } catch {
      return null
    }
  }
  return content
}

/**
 * Lee el snapshot del usuario y resuelve cada cluster a sus entidades
 * vivas. Clusters que quedan sin miembros (todos borrados) se omiten.
 * Forma de respuesta compartida por GET y por el POST tras regenerar.
 */
async function buildResponse(
  sql: ReturnType<typeof getSql>,
  userId: string,
): Promise<{
  generatedAt: string | null
  entityCount: number
  clusters: Array<{
    id: string
    name: string
    summary: string
    members: MemberRow[]
  }>
}> {
  const rows = await sqlTyped<SnapshotRow>(sql`
    SELECT entity_count, clusters, generated_at, provider, model
    FROM atlas_snapshots
    WHERE user_id = ${userId}
    LIMIT 1
  `)
  if (rows.length === 0) {
    return { generatedAt: null, entityCount: 0, clusters: [] }
  }
  const snap = rows[0]!
  const stored: StoredCluster[] = Array.isArray(snap.clusters) ? snap.clusters : []
  const allIds = [...new Set(stored.flatMap((c) => c.memberIds))]

  let entityById = new Map<string, MemberRow>()
  if (allIds.length > 0) {
    const ents = await sqlTyped<MemberRow>(sql`
      SELECT id, name, type, year
      FROM entities
      WHERE user_id = ${userId} AND deleted_at IS NULL
        AND id = ANY(${allIds}::uuid[])
    `)
    entityById = new Map(ents.map((e) => [e.id, e]))
  }

  const clusters = stored
    .map((c) => ({
      id: c.id,
      name: c.name,
      summary: c.summary ?? '',
      members: c.memberIds
        .map((id) => entityById.get(id))
        .filter((m): m is MemberRow => !!m),
    }))
    .filter((c) => c.members.length > 0)

  return { generatedAt: snap.generated_at, entityCount: snap.entity_count, clusters }
}

export default withObservability(
  'atlas',
  async (req: Request, _context: Context, { requestId }) => {
    const { id: userId } = await getAuthedUser(req)
    const sql = getSql()
    const url = new URL(req.url)

    if (req.method === 'GET' && url.pathname === '/api/atlas') {
      return Response.json(await buildResponse(sql, userId))
    }

    if (req.method === 'POST' && url.pathname === '/api/atlas/generate') {
      type EntityRow = {
        id: string
        name: string
        type: string
        embedding: unknown
      }
      const entities = await sqlTyped<EntityRow>(sql`
        SELECT id, name, type, embedding
        FROM entities
        WHERE user_id = ${userId}
          AND deleted_at IS NULL
          AND embedding IS NOT NULL
        ORDER BY id
      `)

      // Parsear embeddings y descartar filas con vector inválido.
      const points: Vec[] = []
      const meta: Array<{ id: string; name: string; type: string }> = []
      for (const e of entities) {
        const vec = parseVec(e.embedding)
        if (!vec) continue
        points.push(normalize(vec))
        meta.push({ id: e.id, name: e.name, type: e.type })
      }

      if (points.length < MIN_ENTITIES) {
        return ApiErrors.unprocessable(
          requestId,
          `El atlas necesita al menos ${MIN_ENTITIES} entidades con embedding; hay ${points.length}. Agrega más entidades (o espera a que se generen sus embeddings) y vuelve a intentar.`,
        )
      }

      // Clusterizar y agrupar índices por cluster, descartando vacíos.
      const k = chooseK(points.length)
      const assign = kmeans(points, k)
      const groups: number[][] = Array.from({ length: k }, () => [])
      assign.forEach((c, i) => groups[c]?.push(i))
      const nonEmpty = groups.filter((g) => g.length > 0)

      // Nombrar todas las constelaciones en UNA llamada al LLM.
      const namingInput = nonEmpty.map((g) => ({
        members: g.map((i) => ({ name: meta[i]!.name, type: meta[i]!.type })),
      }))
      const messages = buildAtlasNamingMessages(namingInput)

      const invocation = await resolveAIInvocation(req, 'reflect', userId)
      if (invocation.kind === 'off') return aiOffResponse()

      const { content, usage, fromCache } = await askLLMForJson(messages, {
        provider: invocation.provider,
        model: invocation.model,
      })

      // Mapear nombres por index; fallback genérico si el LLM falla o se
      // saltea un grupo (la generación no debe romperse por eso).
      const namesByIndex = new Map<number, { name: string; summary: string }>()
      const parsed = NamingResponse.safeParse(coerceJson(content))
      if (parsed.success) {
        for (const c of parsed.data.constelaciones) {
          namesByIndex.set(c.index, { name: c.name, summary: c.summary })
        }
      }

      const clusters: StoredCluster[] = nonEmpty.map((g, idx) => {
        const named = namesByIndex.get(idx)
        return {
          id: `c-${idx}`,
          name: named?.name || `Constelación ${idx + 1}`,
          summary: named?.summary ?? '',
          memberIds: g.map((i) => meta[i]!.id),
        }
      })

      logEvent({
        event: 'atlas_generated',
        entityCount: points.length,
        clusters: clusters.length,
        provider: usage.provider,
        model: usage.model,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        costCents: usage.costCents,
        durationMs: usage.durationMs,
        fromCache,
      })

      await sql`
        INSERT INTO atlas_snapshots (user_id, entity_count, clusters, provider, model)
        VALUES (
          ${userId},
          ${points.length},
          ${JSON.stringify(clusters)}::jsonb,
          ${usage.provider},
          ${usage.model}
        )
        ON CONFLICT (user_id) DO UPDATE SET
          entity_count = EXCLUDED.entity_count,
          clusters = EXCLUDED.clusters,
          provider = EXCLUDED.provider,
          model = EXCLUDED.model,
          generated_at = NOW()
      `

      return Response.json(await buildResponse(sql, userId))
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: ['/api/atlas', '/api/atlas/generate'],
}
