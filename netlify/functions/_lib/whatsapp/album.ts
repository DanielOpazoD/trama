import { sqlTyped, type SqlClient } from '../db.js'
import { copyRecorteImageToStore, removeBlob } from '../recorte-to-momento.js'

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
export const ALBUM_APPEND_WINDOW_SECONDS = 60

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

/**
 * Anexa imágenes a un recorte-evento existente. Si el recorte era de UNA sola
 * imagen (legacy: solo `image_key`, sin filas en `recorte_images`), primero lo
 * "promueve" a evento insertando su portada como posición 0, y luego agrega las
 * nuevas. Todo en un CTE para que las posiciones queden consistentes. Devuelve
 * el nuevo total de imágenes, o `null` si el recorte no existe.
 */
export async function appendImagesToRecorteEvent(
  sql: SqlClient,
  userId: string,
  recorteId: string,
  images: Array<{ key: string; mime: string }>,
): Promise<number | null> {
  const keys = images.map((i) => i.key)
  const mimes = images.map((i) => i.mime)
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
    if (c) copied.push({ storageKey: c.storageKey, originalKey: rk.key })
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
