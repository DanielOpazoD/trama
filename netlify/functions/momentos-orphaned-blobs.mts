import type { Config } from '@netlify/functions'
import { getStore } from '@netlify/blobs'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { embedSafe, toPgVector } from './_lib/embeddings.js'
import { momentoEmbedText } from './_lib/momento-embed.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { OrphanedBlobRescueBody } from './_lib/momento-extra-schemas.js'

/**
 * DD1: recuperación de blobs huérfanos.
 *
 * Contexto del bug: Netlify Database (Neon) crea automáticamente una BD
 * RAMA por cada deploy preview. Cuando el usuario subía fotos desde un
 * preview, el blob iba al store global "momentos-media" (compartido
 * entre deploys) pero el row de Momento que lo referenciaba quedaba en
 * la BD efímera del preview. Al volver a producción, los blobs estaban
 * "huérfanos" — sin Momento que los apuntara.
 *
 *   GET  /api/momentos-orphaned-blobs   → lista las keys huérfanas
 *   POST /api/momentos-orphaned-blobs   → adopta un blob: crea un Momento
 *                                          tipo foto a partir de la key
 *
 * Idempotente: si el blob ya está referenciado por algún Momento en la BD
 * actual, no aparece en la lista. Si todos están referenciados, devuelve
 * { orphans: [] }.
 */

type FotoPayload = {
  storageKey?: string
  items?: Array<{ storageKey: string }>
  photos?: Array<{ storageKey: string }>
}

function addStorageKey(set: Set<string>, storageKey: unknown): void {
  if (typeof storageKey !== 'string') return
  const trimmed = storageKey.trim()
  if (trimmed) set.add(trimmed)
}

/**
 * Junta todas las storageKeys referenciadas por momentos kind='foto' en
 * la BD actual. Incluye tanto el formato single (`storageKey`) como el
 * multi (`items[]`). Soft-deletados se INCLUYEN para no resucitar fotos
 * que el usuario borró a propósito.
 */
async function collectReferencedKeys(sql: ReturnType<typeof getSql>, userId: string): Promise<Set<string>> {
  const rows = (await sql`
    SELECT payload
    FROM momentos
    WHERE kind = 'foto' AND user_id = ${userId}
  `) as Array<{ payload: FotoPayload | null }>

  const set = new Set<string>()
  for (const row of rows) {
    const payload = row.payload ?? {}
    addStorageKey(set, payload.storageKey)
    if (Array.isArray(payload.items)) {
      for (const item of payload.items) {
        addStorageKey(set, item?.storageKey)
      }
    }
    if (Array.isArray(payload.photos)) {
      for (const photo of payload.photos) {
        addStorageKey(set, photo?.storageKey)
      }
    }
  }
  return set
}

export default withObservability('momentos-orphaned-blobs', async (req: Request, _ctx, { requestId }) => {
  const sql = getSql()
  const authedUser = await getAuthedUser(req)
  const userId = authedUser.id
  const store = getStore('momentos-media')

  // GET: listar las keys huérfanas + algún metadata útil (mime) para que
  // el cliente pueda renderizar thumbs apuntando al endpoint /file/:key.
  if (req.method === 'GET') {
    const { blobs } = await store.list()
    const referenced = await collectReferencedKeys(sql, userId)
    const orphans = blobs
      .map((b) => b.key)
      .filter((k) => !referenced.has(k))
      .sort() // estable para que el cliente pueda asumir orden
    return Response.json({
      orphans,
      totalInStore: blobs.length,
      referenced: referenced.size,
    })
  }

  // POST: adoptar un blob. El body trae { storageKey, note?, capturedAt? }.
  // El servidor verifica que el blob exista en el store (no aceptamos keys
  // arbitrarias) y crea un Momento kind='foto' apuntando a esa key.
  if (req.method === 'POST') {
    await ensureUserRow(sql, authedUser)
    const parsed = await parseJsonBody(req, OrphanedBlobRescueBody, requestId)
    if (!parsed.ok) return parsed.response
    const body = parsed.data
    const storageKey = body.storageKey.trim()

    // Verificar que el blob existe — evita crear Momentos apuntando a keys
    // inventadas. También recupera el mime original.
    const meta = await store.getMetadata(storageKey)
    if (!meta) {
      return ApiErrors.notFound(requestId, 'Blob no encontrado en el store')
    }

    // Verificar que no esté ya referenciado (idempotencia).
    const referenced = await collectReferencedKeys(sql, userId)
    if (referenced.has(storageKey)) {
      return ApiErrors.conflict(requestId, 'Blob ya está referenciado por otro Momento')
    }

    const capturedAt = body.capturedAt ?? new Date().toISOString()
    const note = body.note?.trim() || null
    const payload: FotoPayload = {
      items: [{ storageKey }],
      // legacy back-compat: también guardamos como single
      storageKey,
    }
    const origin = JSON.stringify({
      kind: 'imported',
      importedFrom: 'orphaned-blob-rescue',
    })

    const result = (await sql`
      INSERT INTO momentos (kind, captured_at, payload, note, origin, user_id)
      VALUES (
        'foto',
        ${capturedAt}::timestamptz,
        ${JSON.stringify(payload)}::jsonb,
        ${note},
        ${origin}::jsonb,
        ${userId}
      )
      RETURNING id, kind, captured_at, payload, note, origin, created_at, updated_at
    `) as Array<Record<string, unknown>>

    const created = result[0]

    // Embedding best-effort, igual que en POST normal de momentos.
    if (created?.id) {
      const text = momentoEmbedText('foto', payload as Record<string, unknown>, note)
      if (text) {
        const emb = await embedSafe(text)
        if (emb) {
          const vec = toPgVector(emb.vector)
          await sql`
            UPDATE momentos
            SET embedding = ${vec}::vector
            WHERE id = ${created.id as string}
              AND deleted_at IS NULL
              AND user_id = ${userId}
          `
        }
      }
    }

    return Response.json({ ...created, entity_ids: [] }, { status: 201 })
  }

  return ApiErrors.methodNotAllowed(requestId)
})

export const config: Config = {
  path: '/api/momentos-orphaned-blobs',
}
