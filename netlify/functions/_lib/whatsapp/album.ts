import { sqlTyped, type SqlClient } from '../db.js'
import { copyRecorteImageToStore, removeBlob } from '../recorte-to-momento.js'
import { logEvent } from '../observability.js'
import { reclassifyRecorteToMomento } from './reclassify-media.js'

/**
 * Álbum partido: WhatsApp/Twilio a veces parte un envío de varias fotos en
 * MENSAJES SEPARADOS (cada uno su propio webhook, y solo el primero con caption).
 * Sin agrupar, cada foto caería como una captura suelta y solo la del caption
 * iría al destino correcto. Acá tratamos las fotos que llegan en ventana corta,
 * del mismo número, como continuación del MISMO álbum: se anexan a la captura
 * reciente (momento episódico o recorte-evento) en vez de crear otra.
 *
 * Es un anexado REACTIVO (sin esperas ni jobs): cada foto que llega mira la
 * última captura de media del número; si cae dentro de la ventana, se une.
 */

/** Ventana para considerar una foto como continuación del mismo álbum. Las
 *  partes de un álbum partido llegan en segundos; la mantenemos corta para no
 *  fusionar envíos intencionalmente separados. */
export const ALBUM_APPEND_WINDOW_SECONDS = 20

/** Tope de fotos por álbum fusionado. La ventana es DESLIZANTE (cada anexado
 *  la extiende), así que sin tope un goteo de fotos fusionaría sin fin. Al
 *  llegar acá se deja de extender la ventana y el lote siguiente arranca
 *  captura nueva por el flujo de pendientes. */
export const MAX_ALBUM_PHOTOS = 30

export type RecentMediaCapture = { kind: 'momento' | 'recorte'; id: string }

/**
 * Última captura del número SI es de media (momento/recorte) y cae dentro de la
 * ventana de álbum. Devuelve `null` si no hay, no es media, o ya venció (→ la
 * foto que llega es una captura nueva, no una continuación).
 */
export async function readRecentMediaCapture(
  sql: SqlClient,
  userId: string,
  phone: string,
): Promise<RecentMediaCapture | null> {
  const rows = await sqlTyped<{ kind: string | null; id: string | null }>(sql`
    SELECT last_capture_kind AS kind, last_capture_id AS id
    FROM whatsapp_links
    WHERE phone_e164 = ${phone} AND user_id = ${userId} AND deleted_at IS NULL
      AND last_capture_id IS NOT NULL
      AND last_capture_kind IN ('momento', 'recorte')
      AND last_capture_at > NOW() - (${ALBUM_APPEND_WINDOW_SECONDS} || ' seconds')::interval
    LIMIT 1
  `)
  const r = rows[0]
  if (!r?.id || (r.kind !== 'momento' && r.kind !== 'recorte')) return null
  return { kind: r.kind, id: r.id }
}

/**
 * Anexa fotos (ya en `momentos-media`) a un Momento foto episódico existente:
 * suma a `payload.items[]` (convirtiendo el legacy `storageKey` suelto a array
 * si hiciera falta). Devuelve el nuevo total de fotos, o `null` si el momento
 * no existe (lo borraron entre medio) → el caller cae a crear una captura nueva.
 */
export async function appendImagesToMomento(
  sql: SqlClient,
  userId: string,
  momentoId: string,
  storageKeys: string[],
): Promise<number | null> {
  const newItems = storageKeys.map((storageKey) => ({ storageKey }))
  const rows = await sqlTyped<{ total: number }>(sql`
    UPDATE momentos
    SET payload = jsonb_set(
          payload,
          '{items}',
          COALESCE(
            payload->'items',
            CASE WHEN payload ? 'storageKey'
              THEN jsonb_build_array(jsonb_build_object('storageKey', payload->>'storageKey'))
              ELSE '[]'::jsonb END
          ) || ${JSON.stringify(newItems)}::jsonb
        ),
        updated_at = NOW()
    WHERE id = ${momentoId} AND user_id = ${userId} AND deleted_at IS NULL AND kind = 'foto'
    RETURNING jsonb_array_length(payload->'items') AS total
  `)
  return rows[0]?.total ?? null
}

/** ¿El error es una violación de UNIQUE (SQLSTATE 23505)? El driver Neon expone
 *  el SQLSTATE de Postgres en `err.code`. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505'
  )
}

/**
 * Una sola corrida del CTE de anexado a un recorte-evento. Si el recorte era de
 * UNA sola imagen (legacy: solo `image_key`, sin filas en `recorte_images`),
 * primero lo "promueve" a evento insertando su portada como posición 0, y luego
 * agrega las nuevas. Todo en un CTE para que las posiciones queden consistentes.
 * Devuelve el nuevo total, o `null` si el recorte no existe. Puede lanzar 23505
 * si choca con un append concurrente del mismo álbum (lo resuelve el reintento).
 */
async function runRecorteAppend(
  sql: SqlClient,
  userId: string,
  recorteId: string,
  keys: string[],
  mimes: string[],
): Promise<number | null> {
  const rows = await sqlTyped<{
    found: boolean
    existing_n: number
    had_cover: boolean | null
  }>(sql`
    WITH rec AS (
      SELECT id, image_key, user_id FROM recortes
      WHERE id = ${recorteId} AND user_id = ${userId} AND deleted_at IS NULL
    ),
    existing AS (
      SELECT COALESCE(MAX(position), -1) AS maxpos, COUNT(*)::int AS n
      FROM recorte_images WHERE recorte_id = ${recorteId}
    ),
    cover AS (
      INSERT INTO recorte_images (recorte_id, user_id, storage_key, mime, position)
      SELECT rec.id, rec.user_id, rec.image_key,
        CASE
          WHEN rec.image_key ILIKE '%.png' THEN 'image/png'
          WHEN rec.image_key ILIKE '%.webp' THEN 'image/webp'
          WHEN rec.image_key ILIKE '%.gif' THEN 'image/gif'
          ELSE 'image/jpeg'
        END,
        0
      FROM rec, existing
      WHERE existing.n = 0 AND rec.image_key IS NOT NULL
      RETURNING 1
    ),
    appended AS (
      INSERT INTO recorte_images (recorte_id, user_id, storage_key, mime, position)
      SELECT rec.id, rec.user_id, x.key, x.mime,
        (CASE
           WHEN existing.n = 0 AND rec.image_key IS NOT NULL THEN 1
           WHEN existing.n = 0 THEN 0
           ELSE existing.maxpos + 1
         END) + (x.ord - 1)::int
      FROM rec, existing,
        unnest(${keys}::text[], ${mimes}::text[]) WITH ORDINALITY AS x(key, mime, ord)
      RETURNING 1
    )
    SELECT
      EXISTS(SELECT 1 FROM rec) AS found,
      (SELECT n FROM existing) AS existing_n,
      (SELECT image_key IS NOT NULL FROM rec) AS had_cover
  `)
  const r = rows[0]
  if (!r?.found) return null
  const base = r.existing_n === 0 ? (r.had_cover ? 1 : 0) : r.existing_n
  return base + keys.length
}

/**
 * Anexa imágenes a un recorte-evento, a prueba de concurrencia. Dos partes del
 * MISMO álbum llegan casi simultáneas y pueden correr el anexado en paralelo:
 * ambas leerían el mismo `MAX(position)` —o ambas intentarían la portada en
 * position 0— y chocarían contra `UNIQUE(recorte_id, position)`. Ante esa
 * colisión (23505) reintentamos: cada corrida nueva toma un snapshot fresco, ve
 * las filas ya commiteadas y recomputa posiciones sin pisar. Si no converge en
 * `MAX_ATTEMPTS`, propaga → el caller cae a un recorte aparte (degradación,
 * nunca pérdida de la foto). Devuelve el nuevo total, o `null` si no existe.
 */
export async function appendImagesToRecorteEvent(
  sql: SqlClient,
  userId: string,
  recorteId: string,
  images: Array<{ key: string; mime: string }>,
): Promise<number | null> {
  const keys = images.map((i) => i.key)
  const mimes = images.map((i) => i.mime)
  const MAX_ATTEMPTS = 5
  for (let attempt = 1; ; attempt++) {
    try {
      return await runRecorteAppend(sql, userId, recorteId, keys, mimes)
    } catch (err) {
      if (attempt < MAX_ATTEMPTS && isUniqueViolation(err)) continue
      throw err
    }
  }
}

/**
 * Operaciones de blobs que necesita {@link joinRecortePhotosToMomento},
 * inyectables para test. Por defecto, las reales sobre Netlify Blobs.
 */
export type AlbumBlobOps = {
  copy: (
    destStore: string,
    key: string,
    userId: string,
  ) => Promise<{ storageKey: string } | null>
  remove: (store: string, key: string) => Promise<void>
}

const realBlobOps: AlbumBlobOps = { copy: copyRecorteImageToStore, remove: removeBlob }

/**
 * Une fotos sueltas —que venían como recorte (en `recortes-media`)— a un Momento
 * foto reciente. La danza cross-store es DELICADA y antes perdía datos, así que
 * el orden es estricto: **copy → append → remove**.
 *
 *  1. Copia TODOS los blobs a `momentos-media` (sin borrar nada todavía).
 *  2. Anexa las copias al momento.
 *  3a. Si el anexado CONFIRMA, recién entonces borra los originales en
 *      `recortes-media` (ya están a salvo en su nuevo store).
 *  3b. Si el anexado FALLA (el momento se borró entre medio → `null`), revierte
 *      las copias huérfanas en `momentos-media` y NO toca los originales: el
 *      caller crea un recorte de respaldo con esos blobs intactos.
 *
 * Nunca borra antes de confirmar: así no quedan recortes apuntando a blobs
 * inexistentes (404) ni basura acumulada en `momentos-media`. Devuelve el nuevo
 * total de fotos del momento, o `null` si no se anexó nada.
 */
export async function joinRecortePhotosToMomento(
  sql: SqlClient,
  userId: string,
  momentoId: string,
  recorteKeys: Array<{ key: string }>,
  ops: AlbumBlobOps = realBlobOps,
): Promise<number | null> {
  const copied: Array<{ storageKey: string; originalKey: string }> = []
  for (const rk of recorteKeys) {
    const c = await ops.copy('momentos-media', rk.key, userId)
    if (!c) {
      for (const copiedImage of copied) {
        await ops.remove('momentos-media', copiedImage.storageKey)
      }
      return null
    }
    copied.push({ storageKey: c.storageKey, originalKey: rk.key })
  }
  if (copied.length === 0) return null

  const total = await appendImagesToMomento(
    sql,
    userId,
    momentoId,
    copied.map((c) => c.storageKey),
  )
  if (total !== null) {
    for (const c of copied) await ops.remove('recortes-media', c.originalKey)
  } else {
    for (const c of copied) await ops.remove('momentos-media', c.storageKey)
  }
  return total
}

/** Soft-delete de la captura reciente, inyectado por el orquestador (vive en el
 *  webhook-endpoint). Se usa solo al promover un recorte reciente a Momento. */
export type SoftDeleteCapture = (
  sql: SqlClient,
  userId: string,
  kind: string,
  id: string,
) => Promise<boolean>

/** Resultado de un intento de anexado de álbum partido. */
export type AlbumAppendResult = {
  /** Nuevo total de fotos del destino tras anexar, o `null` si no se anexó. */
  appendedTotal: number | null
  /** Id de la captura destino del anexado (si hubo anexado). */
  lastId: string | null
  /** Kind de la captura destino (`momento` | `recorte`). */
  lastKind: string
}

/**
 * Álbum partido: decide si las fotos nuevas de este mensaje se ANEXAN a la
 * captura de media reciente del número y, si corresponde, ejecuta la rama
 * adecuada (las 4 combinaciones route × kind reciente):
 *
 *  - route 'momento' + reciente momento → suma al episodio.
 *  - route 'momento' + reciente recorte → sube TODO el recorte a Momento
 *    (reclasifica + soft-borra) y suma las fotos nuevas al episodio.
 *  - route 'recorte' + reciente recorte → suma al recorte-evento.
 *  - route 'recorte' + reciente momento → copia las fotos cross-store y las
 *    suma al episodio (copy → append → remove en {@link joinRecortePhotosToMomento}).
 *
 * Es MOVER el bloque inline del webhook a su hogar natural (este módulo ya tiene
 * toda la infra de append). Devuelve `appendedTotal: null` cuando no se anexó
 * (no hay captura reciente en ventana, o falló) → el orquestador cae a crear una
 * captura nueva con las mismas fotos. Las claves `momentoKeys`/`recorteKeys` se
 * vacían in-place cuando el anexado confirma (esas fotos ya no se persisten por
 * separado), igual que en el código original. Best-effort: nunca lanza.
 */
export async function appendSplitAlbum(
  sql: SqlClient,
  userId: string,
  recent: RecentMediaCapture,
  args: {
    route: 'momento' | 'recorte'
    newImageCount: number
    momentoKeys: string[]
    momentoCapturedAts: Array<string | null>
    recorteKeys: Array<{ key: string; mime: string; capturedAt?: string | null }>
    softDeleteCapture: SoftDeleteCapture
  },
): Promise<AlbumAppendResult> {
  const { route, newImageCount, momentoKeys, momentoCapturedAts, recorteKeys } = args
  let appendedTotal: number | null = null
  let lastId: string | null = null
  let lastKind = ''
  try {
    if (route === 'momento') {
      // Fotos nuevas ya en momentos-media (momentoKeys).
      if (recent.kind === 'momento') {
        appendedTotal = await appendImagesToMomento(sql, userId, recent.id, momentoKeys)
        if (appendedTotal !== null) {
          lastId = recent.id
          lastKind = 'momento'
        }
      } else {
        // El lote reciente era un recorte y esta foto dice "a momento":
        // subimos TODO el álbum a un momento (reclasificación) y anexamos.
        const res = await reclassifyRecorteToMomento(sql, userId, recent.id, '')
        if (res.status === 'ok') {
          const softDeleted = await args.softDeleteCapture(
            sql,
            userId,
            'recorte',
            recent.id,
          )
          if (!softDeleted) {
            throw new Error(`failed to soft-delete recorte ${recent.id}`)
          }
          appendedTotal = await appendImagesToMomento(sql, userId, res.id, momentoKeys)
          if (appendedTotal !== null) {
            lastId = res.id
            lastKind = 'momento'
          }
        }
      }
    } else {
      if (recent.kind === 'recorte') {
        appendedTotal = await appendImagesToRecorteEvent(
          sql,
          userId,
          recent.id,
          recorteKeys,
        )
        if (appendedTotal !== null) {
          lastId = recent.id
          lastKind = 'recorte'
        }
      } else {
        // La danza cross-store vive en el helper: copy → append → remove.
        appendedTotal = await joinRecortePhotosToMomento(
          sql,
          userId,
          recent.id,
          recorteKeys,
        )
        if (appendedTotal !== null) {
          lastId = recent.id
          lastKind = 'momento'
        }
      }
    }
  } catch (err) {
    logEvent({
      event: 'whatsapp_media_failed',
      message: err instanceof Error ? err.message : String(err),
    })
    appendedTotal = null
  }
  if (appendedTotal !== null) {
    momentoKeys.length = 0
    momentoCapturedAts.length = 0
    recorteKeys.length = 0
    logEvent({
      event: 'whatsapp_album_append',
      kind: lastKind,
      count: newImageCount,
      total: appendedTotal,
    })
  }
  return { appendedTotal, lastId, lastKind }
}
