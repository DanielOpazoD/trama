import type { Config } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { embedSafe, toPgVector } from './_lib/embeddings.js'
import { momentoEmbedText } from './_lib/momento-embed.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { OrphanedBlobRescueBody } from './_lib/momento-extra-schemas.js'
import {
  createNetlifyBlobStorageAdapter,
  type StorageAdapter,
} from './_lib/storage-adapter.js'
import { isR2Configured, r2ListObjects, r2ObjectExists } from './_lib/r2.js'
import { storageKeyBelongsToUser } from './_lib/legacy-identity.js'
import { isR2MomentoKey, isVideoMomentoKey } from './_lib/momentos-media-mime.js'

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
 *
 * **Dos backends, un barrido.** Desde la subida directa a R2, la media que pesa
 * más de 4 MB —los videos— no está en Netlify Blobs sino en el bucket. Este
 * barrido enumera LOS DOS stores; si mirara solo uno, el huérfano más caro en
 * espacio sería justo el invisible.
 *
 * **Por qué se enumeran los stores y no `storage_assets`.** La tabla parece la
 * fuente obvia (tiene filas de ambos providers) pero contesta otra pregunta:
 * "qué se registró", no "qué hay". Falla por los dos lados —
 *   - por defecto: el bug DD1 original perdía el momento Y su fila de manifest
 *     en la misma BD efímera del preview, así que esos huérfanos no tienen fila
 *     que listar; y un PUT presignado que nunca llamó a `complete` tampoco;
 *   - por exceso: una fila viva cuyo objeto ya no está (categoría (a) de
 *     `docs/storage-orphans.md`) se ofrecería para adoptar y crearía un Momento
 *     apuntando a nada.
 * Como este endpoint ADOPTA lo que lista, su fuente de verdad tiene que ser
 * "objetos que existen de verdad".
 */

type FotoPayload = {
  storageKey?: string
  items?: Array<{ storageKey: string; type?: 'video' }>
  photos?: Array<{ storageKey: string }>
  audioKey?: string
}

type ReferencedMomentoPayloadRow = {
  payload: FotoPayload | null
}

type CreatedMomentoRow = Record<string, unknown> & {
  id: string
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
async function collectReferencedKeys(
  sql: ReturnType<typeof getSql>,
  userId: string,
): Promise<Set<string>> {
  const rows = await sqlTyped<ReferencedMomentoPayloadRow>(sql`
    SELECT payload
    FROM momentos
    WHERE kind = 'foto' AND user_id = ${userId}
  `)

  const set = new Set<string>()
  for (const row of rows) {
    const payload = row.payload ?? {}
    addStorageKey(set, payload.storageKey)
    addStorageKey(set, payload.audioKey)
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

type MediaKeyInventory = {
  /** Todas las keys que existen hoy en los stores de media de Momentos. */
  keys: string[]
  /** Cuántas aportó cada backend. `r2: null` = NO se escaneó (R2 sin configurar). */
  scanned: { netlifyBlobs: number; r2: number | null }
  /** true si el listado de R2 se cortó: la lista de huérfanos es incompleta. */
  partial: boolean
}

/**
 * Enumera la media de Momentos que existe de verdad, juntando los dos backends.
 *
 * El listado de R2 va acotado al prefijo `${userId}/` Y filtrado por el marcador
 * `r2-`: ese bucket es COMPARTIDO con la Biblioteca (mismas credenciales, mismo
 * `${userId}/` de prefijo). Sin el filtro por marcador, un PDF de la Biblioteca
 * se ofrecería como foto huérfana y adoptarlo crearía un Momento apuntando a un
 * archivo de otro dominio.
 *
 * Si R2 no está configurado se devuelve `r2: null` en vez de 0: "no miré" y
 * "miré y no había nada" no son lo mismo, y confundirlos escondería todos los
 * videos huérfanos detrás de un "está todo bien".
 */
async function listMomentoMediaKeys(
  store: StorageAdapter,
  userId: string,
): Promise<MediaKeyInventory> {
  const { blobs } = await store.list()
  const blobKeys = blobs.map((b) => b.key)

  if (!isR2Configured()) {
    return {
      keys: blobKeys,
      scanned: { netlifyBlobs: blobKeys.length, r2: null },
      partial: false,
    }
  }

  // Un LIST que falla se propaga (igual que el HEAD de `r2ObjectExists`): mejor
  // un error visible que una lista corta que se lee como "no hay huérfanos".
  const { objects, truncated } = await r2ListObjects(`${userId}/`)
  const r2Keys = objects.map((o) => o.key).filter(isR2MomentoKey)

  return {
    keys: [...new Set([...blobKeys, ...r2Keys])],
    scanned: { netlifyBlobs: blobKeys.length, r2: r2Keys.length },
    partial: truncated,
  }
}

export default withObservability(
  'momentos-orphaned-blobs',
  async (req: Request, _ctx, { requestId }) => {
    const sql = getSql()
    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const store = createNetlifyBlobStorageAdapter('momentos-media')

    // GET: listar las keys huérfanas + algún metadata útil (mime) para que
    // el cliente pueda renderizar thumbs apuntando al endpoint /file/:key.
    if (req.method === 'GET') {
      const inventory = await listMomentoMediaKeys(store, userId)
      const referenced = await collectReferencedKeys(sql, userId)
      const orphans = inventory.keys.filter((k) => !referenced.has(k)).sort() // estable para que el cliente pueda asumir orden
      return Response.json({
        orphans,
        totalInStore: inventory.keys.length,
        referenced: referenced.size,
        scanned: inventory.scanned,
        partial: inventory.partial,
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
      // inventadas. Se comprueba en el backend que le corresponde a la key: un
      // `getMetadata` del store de blobs sobre una key de R2 daría null y el
      // rescate de un video fallaría con un 404 mentiroso.
      if (isR2MomentoKey(storageKey)) {
        if (!isR2Configured()) {
          return ApiErrors.unprocessable(
            requestId,
            'Almacenamiento de archivos grandes no configurado (R2)',
          )
        }
        // El bucket es compartido entre dominios y usuarios, así que acá SÍ se
        // exige el prefijo del usuario (igual que en `momentos-uploads-complete`);
        // el store de blobs, en cambio, tiene keys legacy sin namespace que el
        // rescate original debe seguir pudiendo adoptar.
        if (!storageKeyBelongsToUser(storageKey, userId)) {
          return ApiErrors.notFound(requestId, 'Blob no encontrado en el store')
        }
        const head = await r2ObjectExists(storageKey)
        if (!head.exists) {
          return ApiErrors.notFound(requestId, 'Blob no encontrado en el store')
        }
      } else if (!(await store.getMetadata(storageKey))) {
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
        // `type: 'video'` para los clips: sin él, el álbum monta un `<img>` y el
        // video rescatado queda como una caja que nunca carga.
        items: [
          isVideoMomentoKey(storageKey)
            ? { storageKey, type: 'video' as const }
            : { storageKey },
        ],
        // legacy back-compat: también guardamos como single
        storageKey,
      }
      const origin = JSON.stringify({
        kind: 'imported',
        importedFrom: 'orphaned-blob-rescue',
      })

      // Embedding best-effort calculado ANTES del INSERT, para crear el Momento en
      // UN solo statement (sin UPDATE posterior que pudiera quedar a medias si el
      // Lambda muere). embedSafe nunca lanza: si falla, el Momento se crea sin
      // embedding y se puede reindexar luego (dato derivado).
      const embText = momentoEmbedText('foto', payload as Record<string, unknown>, note)
      const emb = embText ? await embedSafe(embText) : null

      const result = await sqlTyped<CreatedMomentoRow>(sql`
      INSERT INTO momentos (
        kind, captured_at, payload, note, origin,
        embedding, embedding_model, embedding_at, user_id
      )
      VALUES (
        'foto',
        ${capturedAt}::timestamptz,
        ${JSON.stringify(payload)}::jsonb,
        ${note},
        ${origin}::jsonb,
        ${emb ? toPgVector(emb.vector) : null}::vector,
        ${emb?.model ?? null},
        ${emb ? new Date().toISOString() : null}::timestamptz,
        ${userId}
      )
      RETURNING id, kind, captured_at, payload, note, origin, created_at, updated_at
    `)

      const created = result[0]

      return Response.json({ ...created, entity_ids: [] }, { status: 201 })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: '/api/momentos-orphaned-blobs',
}
