import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { embedSafe, toPgVector } from './_lib/embeddings.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { MomentosMergeBody } from './_lib/momento-extra-schemas.js'
import { momentoEmbedText } from './_lib/momento-embed.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'

/**
 * EE: fusionar N momentos foto en uno solo ("eventos").
 *
 * Caso de uso primario: las fotos rescatadas del deploy preview se
 * recuperaron como N momentos individuales (un blob por momento), pero
 * el usuario las tenía agrupadas. Este endpoint vuelve a juntarlas.
 *
 * También útil en general: al subir fotos por error como múltiples
 * eventos cuando eran uno solo (cumpleaños, viaje, sesión de trabajo).
 *
 *   POST /api/momentos-merge
 *   body: {
 *     primaryId: string             // el momento que sobrevive
 *     otherIds: string[]            // los que se fusionan adentro
 *     note?: string | null          // sobrescribe note del primary
 *     capturedAt?: string           // sobrescribe capturedAt del primary
 *   }
 *
 * Comportamiento:
 *   - Solo aplica a kind='foto'. Si alguno de los ids no es foto, 400.
 *   - Junta payload.items[] de todos en el primary (dedupe por storageKey).
 *   - Une los entity_ids: primary ∪ others (sin duplicados).
 *   - Soft-delete los otros (UPDATE deleted_at = NOW()).
 *   - Re-embedea el primary si cambia note o capturedAt o items.
 *
 * Devuelve el primary actualizado con shape Momento normal.
 */

type FotoPayload = {
  storageKey?: string
  width?: number
  height?: number
  caption?: string
  exifDate?: string
  items?: Array<{ storageKey: string; width?: number; height?: number }>
  photos?: Array<{ storageKey: string; width?: number; height?: number }>
  primaryStorageKey?: string | null
  audioKey?: string
}

/**
 * Extrae las items del payload de un momento foto. Maneja los formatos
 * nuevo (items[]), legacy multi (photos[] + primaryStorageKey) y legacy
 * single (storageKey/width/height).
 */
function payloadToItems(payload: FotoPayload): Array<{
  storageKey: string
  width?: number
  height?: number
}> {
  const fromArray = Array.isArray(payload.items) && payload.items.length > 0
    ? payload.items
    : Array.isArray(payload.photos) && payload.photos.length > 0
      ? payload.photos
      : null

  if (fromArray) {
    const items = fromArray.filter(
      (it): it is { storageKey: string; width?: number; height?: number } =>
        !!it && typeof it.storageKey === 'string' && it.storageKey.trim().length > 0,
    )
    const primaryStorageKey =
      typeof payload.primaryStorageKey === 'string' ? payload.primaryStorageKey.trim() : ''
    if (!primaryStorageKey) return items
    const primaryIndex = items.findIndex((it) => it.storageKey === primaryStorageKey)
    if (primaryIndex <= 0) return items
    const primary = items[primaryIndex]
    if (!primary) return items
    return [primary, ...items.filter((_, index) => index !== primaryIndex)]
  }
  if (typeof payload.storageKey === 'string' && payload.storageKey.trim()) {
    return [
      {
        storageKey: payload.storageKey.trim(),
        width: payload.width,
        height: payload.height,
      },
    ]
  }
  return []
}

function payloadAudioKey(payload: FotoPayload): string | undefined {
  if (typeof payload.audioKey !== 'string') return undefined
  const audioKey = payload.audioKey.trim()
  return audioKey || undefined
}

export default withObservability('momentos-merge', async (req: Request, _ctx, { requestId }) => {
  if (req.method !== 'POST') {
    return ApiErrors.methodNotAllowed(requestId)
  }
  const sql = getSql()
  const authedUser = await getAuthedUser(req)
  const userId = authedUser.id

  // Zod ya valida UUID format + primaryId/otherIds presence (FF#5).
  const parsed = await parseJsonBody(req, MomentosMergeBody, requestId)
  if (!parsed.ok) return parsed.response
  const body = parsed.data
  const { primaryId, otherIds } = body
  if (otherIds.includes(primaryId)) {
    return ApiErrors.validation(requestId, 'primaryId no puede estar en otherIds')
  }
  // Defensa contra payloads enormes: 50 es más que cualquier evento
  // razonable que un humano agruparía como un solo "momento".
  if (otherIds.length > 50) {
    return ApiErrors.validation(requestId, 'otherIds: máximo 50 por merge')
  }

  // Lee todos los momentos involucrados de una. unnest evita N+1 queries.
  type Row = {
    id: string
    kind: string
    captured_at: string
    payload: FotoPayload | null
    note: string | null
  }
  const allIds = [primaryId, ...otherIds]
  const rows = (await sql`
    SELECT id, kind, captured_at, payload, note
    FROM momentos
    WHERE id = ANY(${allIds}::uuid[]) AND deleted_at IS NULL AND user_id = ${userId}
  `) as Row[]

  // Verificar que todos existen + son foto.
  const found = new Map(rows.map((r) => [r.id, r]))
  for (const id of allIds) {
    if (!found.has(id)) {
      return ApiErrors.notFound(requestId, `Momento ${id} no encontrado o ya borrado`)
    }
    if (found.get(id)!.kind !== 'foto') {
      return ApiErrors.validation(
        requestId,
        `Solo se fusionan momentos kind='foto'. El momento ${id} es '${found.get(id)!.kind}'.`,
      )
    }
  }

  await ensureUserRow(sql, authedUser)

  const primary = found.get(primaryId)!

  // Computar items combinados, dedupe por storageKey. Mantenemos orden:
  // primary primero, después each other en el orden enviado.
  const seenKeys = new Set<string>()
  const combinedItems: Array<{
    storageKey: string
    width?: number
    height?: number
  }> = []
  for (const it of payloadToItems(primary.payload ?? {})) {
    if (seenKeys.has(it.storageKey)) continue
    seenKeys.add(it.storageKey)
    combinedItems.push(it)
  }
  for (const otherId of otherIds) {
    const o = found.get(otherId)!
    for (const it of payloadToItems(o.payload ?? {})) {
      if (seenKeys.has(it.storageKey)) continue
      seenKeys.add(it.storageKey)
      combinedItems.push(it)
    }
  }
  const audioKey =
    payloadAudioKey(primary.payload ?? {}) ??
    otherIds
      .map((otherId) => payloadAudioKey(found.get(otherId)?.payload ?? {}))
      .find((key): key is string => Boolean(key))

  // Nuevo payload: items[] + legacy storageKey/width/height del primer item
  // para back-compat con renderers viejos.
  const firstItem = combinedItems[0]
  const newPayload: FotoPayload = {
    items: combinedItems,
    ...(firstItem
      ? {
          storageKey: firstItem.storageKey,
          width: firstItem.width,
          height: firstItem.height,
        }
      : {}),
    // Conservar caption/exifDate del primary si estaban.
    ...(primary.payload?.caption ? { caption: primary.payload.caption } : {}),
    ...(primary.payload?.exifDate ? { exifDate: primary.payload.exifDate } : {}),
    ...(audioKey ? { audioKey } : {}),
  }

  // Note/capturedAt: si vienen del cliente, override; si no, conservar
  // los del primary.
  const newNote =
    body.note === null
      ? null
      : typeof body.note === 'string'
        ? body.note.trim() || null
        : primary.note
  const newCapturedAt =
    typeof body.capturedAt === 'string' && body.capturedAt
      ? body.capturedAt
      : primary.captured_at

  // Re-embed. La nueva concatenación de items + posible nuevo note
  // cambia el texto fuente. Best-effort — si OpenAI falla, embedding
  // queda en NULL para este momento (queries semánticas no lo encuentran
  // hasta el próximo PATCH/re-embed, pero las queries normales sí).
  const embedSource = momentoEmbedText(
    'foto',
    newPayload as Record<string, unknown>,
    newNote,
  )
  const emb = embedSource.length > 0 ? await embedSafe(embedSource) : null
  const embVector = emb ? toPgVector(emb.vector) : null
  const embModel = emb?.model ?? null
  const embAt = emb ? new Date().toISOString() : null

  // EE-followup #4: atomicidad real via CTE en un solo statement.
  //
  // Antes esto eran 3 SQL writes secuenciales (UPDATE primary, INSERT
  // links, UPDATE soft-delete others). Si el Lambda crasheaba o el HTTP
  // driver se desconectaba entre cualquiera de ellos, quedaba un estado
  // inconsistente — primary con items combinados pero others no
  // borrados, por ejemplo.
  //
  // Postgres ejecuta CTEs en un single statement atomic — todos los
  // sub-writes commitean juntos o ninguno. Esto nos da transacción
  // sin necesitar el driver Pool con BEGIN/COMMIT (que el Neon HTTP
  // driver no soporta).
  //
  // Orden semántico de las CTEs (Postgres las evalúa según el árbol de
  // dependencias, pero los `WITH … RETURNING` que NO se referencian
  // sólo afectan rows; los efectos colaterales corren igual):
  //   1. update_primary: setea payload + note + capturedAt + embedding
  //   2. link_others: copia entity_id de others a primary (UNION)
  //   3. soft_delete_others: marca deleted_at en others
  // Final SELECT trae el primary actualizado.
  const result = (await sql`
    WITH update_primary AS (
      UPDATE momentos
      SET payload = ${JSON.stringify(newPayload)}::jsonb,
          note = ${newNote},
          captured_at = ${newCapturedAt}::timestamptz,
          embedding = ${embVector}::vector,
          embedding_model = ${embModel},
          embedding_at = ${embAt}::timestamptz,
          updated_at = NOW()
      WHERE id = ${primaryId} AND user_id = ${userId}
      RETURNING id, kind, captured_at, payload, note, origin, created_at, updated_at
    ),
    link_others AS (
      INSERT INTO momento_entities (momento_id, entity_id, user_id)
      SELECT ${primaryId}::uuid, entity_id, ${userId}
      FROM momento_entities
      WHERE momento_id = ANY(${otherIds}::uuid[])
        AND user_id = ${userId}
        AND deleted_at IS NULL
      ON CONFLICT (momento_id, entity_id) DO UPDATE
      SET user_id = EXCLUDED.user_id,
          deleted_at = NULL
      RETURNING 1
    ),
    soft_delete_others AS (
      UPDATE momentos
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = ANY(${otherIds}::uuid[]) AND deleted_at IS NULL AND user_id = ${userId}
      RETURNING id, deleted_at
    )
    SELECT
      (SELECT row_to_json(update_primary) FROM update_primary) AS primary,
      COALESCE(
        (SELECT json_agg(json_build_object('id', id, 'deletedAt', deleted_at))
         FROM soft_delete_others),
        '[]'::json
      ) AS deleted_others,
      (SELECT COUNT(*) FROM link_others)::int AS links_inserted
  `) as Array<{
    primary: Record<string, unknown> | null
    deleted_others: Array<{ id: string; deletedAt: string }>
    links_inserted: number
  }>

  const cteRow = result[0]
  if (!cteRow || !cteRow.primary) {
    return ApiErrors.internal(requestId, 'Fusión falló: el primary no se pudo actualizar')
  }
  const deletedRows = cteRow.deleted_others.map((d) => ({
    id: d.id,
    deleted_at: d.deletedAt,
  }))

  // Devolver el primary actualizado. Lo obtuvimos del CTE (cteRow.primary)
  // pero hacemos un re-SELECT para tener la versión más reciente (por si
  // el row tiene triggers que tocan updated_at, etc.).
  const updated = (await sql`
    SELECT id, kind, captured_at, payload, note, origin,
           created_at, updated_at
    FROM momentos
    WHERE id = ${primaryId} AND user_id = ${userId}
  `) as Array<Record<string, unknown>>
  const links = (await sql`
    SELECT entity_id
    FROM momento_entities
    WHERE momento_id = ${primaryId} AND user_id = ${userId} AND deleted_at IS NULL
  `) as Array<{ entity_id: string }>

  return Response.json({
    ...updated[0],
    entity_ids: links.map((l) => l.entity_id),
    // Bonus debug-friendly: cuántos se fusionaron y cuántas fotos quedaron.
    merged: otherIds.length,
    itemCount: combinedItems.length,
    // EE-followup: shape para que el cliente pueda hacer "deshacer".
    // El payload original del primary lo guarda el cliente antes del POST
    // (no se devuelve acá para no inflar el response).
    deletedOthers: deletedRows.map((r) => ({
      id: r.id,
      deletedAt: r.deleted_at,
    })),
  })
})

export const config: Config = {
  path: '/api/momentos-merge',
}
