import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { embedSafe, toPgVector } from './_lib/embeddings.js'
import { momentoEmbedText } from './_lib/momento-embed.js'

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
}

/**
 * Extrae las items del payload de un momento foto. Maneja los dos
 * formatos: nuevo (items[]) y legacy (storageKey/width/height singular).
 * Si está en formato legacy, devuelve un array de 1.
 */
function payloadToItems(payload: FotoPayload): Array<{
  storageKey: string
  width?: number
  height?: number
}> {
  if (Array.isArray(payload.items) && payload.items.length > 0) {
    return payload.items.filter(
      (it): it is { storageKey: string; width?: number; height?: number } =>
        !!it && typeof it.storageKey === 'string' && it.storageKey.length > 0,
    )
  }
  if (payload.storageKey) {
    return [
      {
        storageKey: payload.storageKey,
        width: payload.width,
        height: payload.height,
      },
    ]
  }
  return []
}

export default withObservability('momentos-merge', async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }
  const sql = getSql()

  let body: {
    primaryId?: unknown
    otherIds?: unknown
    note?: unknown
    capturedAt?: unknown
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return new Response('JSON inválido', { status: 400 })
  }

  const primaryId = typeof body.primaryId === 'string' ? body.primaryId : null
  const otherIds = Array.isArray(body.otherIds)
    ? body.otherIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : []
  if (!primaryId) {
    return new Response('primaryId requerido', { status: 400 })
  }
  if (otherIds.length === 0) {
    return new Response('otherIds debe tener al menos 1 elemento', { status: 400 })
  }
  if (otherIds.includes(primaryId)) {
    return new Response('primaryId no puede estar en otherIds', { status: 400 })
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
    WHERE id = ANY(${allIds}::uuid[]) AND deleted_at IS NULL
  `) as Row[]

  // Verificar que todos existen + son foto.
  const found = new Map(rows.map((r) => [r.id, r]))
  for (const id of allIds) {
    if (!found.has(id)) {
      return new Response(`Momento ${id} no encontrado o ya borrado`, {
        status: 404,
      })
    }
    if (found.get(id)!.kind !== 'foto') {
      return new Response(
        `Solo se fusionan momentos kind='foto'. El momento ${id} es '${found.get(id)!.kind}'.`,
        { status: 400 },
      )
    }
  }

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
  // cambia el texto fuente. Best-effort.
  const embedSource = momentoEmbedText(
    'foto',
    newPayload as Record<string, unknown>,
    newNote,
  )
  const emb = embedSource.length > 0 ? await embedSafe(embedSource) : null

  // UPDATE primary.
  await sql`
    UPDATE momentos
    SET payload = ${JSON.stringify(newPayload)}::jsonb,
        note = ${newNote},
        captured_at = ${newCapturedAt}::timestamptz,
        embedding = ${emb ? toPgVector(emb.vector) : null}::vector,
        embedding_model = ${emb?.model ?? null},
        embedding_at = ${emb ? new Date().toISOString() : null}::timestamptz,
        updated_at = NOW()
    WHERE id = ${primaryId}
  `

  // Union de entity_ids. Insertamos los de los others en momento_entities
  // del primary (ON CONFLICT DO NOTHING dedupea).
  await sql`
    INSERT INTO momento_entities (momento_id, entity_id)
    SELECT ${primaryId}::uuid, entity_id
    FROM momento_entities
    WHERE momento_id = ANY(${otherIds}::uuid[])
    ON CONFLICT DO NOTHING
  `

  // Soft-delete los otros. Los entity_ids de momento_entities NO se
  // borran (FK CASCADE no aplica acá porque es soft-delete). Si después
  // se restaura un other, sus links siguen ahí — está bien, los rows
  // soft-deletados no aparecen en queries normales.
  await sql`
    UPDATE momentos
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = ANY(${otherIds}::uuid[]) AND deleted_at IS NULL
  `

  // Devolver el primary actualizado con shape estándar.
  const updated = (await sql`
    SELECT id, kind, captured_at, payload, note, origin,
           created_at, updated_at
    FROM momentos
    WHERE id = ${primaryId}
  `) as Array<Record<string, unknown>>
  const links = (await sql`
    SELECT entity_id FROM momento_entities WHERE momento_id = ${primaryId}
  `) as Array<{ entity_id: string }>

  return Response.json({
    ...updated[0],
    entity_ids: links.map((l) => l.entity_id),
    // Bonus debug-friendly: cuántos se fusionaron y cuántas fotos quedaron.
    merged: otherIds.length,
    itemCount: combinedItems.length,
  })
})

export const config: Config = {
  path: '/api/momentos-merge',
}
