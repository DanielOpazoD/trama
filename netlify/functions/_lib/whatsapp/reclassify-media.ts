import { sqlTyped, type SqlClient } from '../db.js'
import { copyRecorteImageToStore, removeBlob } from '../recorte-to-momento.js'
import { persistImageMomentoEpisode } from './persist-media.js'
import { persistCapture } from './persist.js'

/**
 * Reclasificación NO destructiva de un recorte con imágenes a otro destino,
 * preservando las fotos (copia de blobs, no movimiento de la fila).
 *
 * Un recorte (captura por defecto de WhatsApp) guarda sus imágenes en el store
 * `recortes-media`. Reclasificarlo "a Momento" o "a Nota" con el camino de texto
 * (recategorizeLast) perdería las imágenes: solo arrastra el `text`. Acá, cuando
 * el recorte tiene imágenes, las COPIAMOS al store del destino y armamos el
 * objeto correcto, así el botón [→ Momento] / [→ Nota con imágenes] no pierde
 * nada.
 *
 * Contrato con el caller (recategorizeLast): el resultado dice qué hacer con el
 * recorte original:
 *   - `ok`       → el destino se creó con TODAS las imágenes; el caller puede
 *                  soft-borrar el recorte (deshacer sigue teniendo sentido).
 *   - `no-images`→ el recorte no tiene imágenes (texto/enlace); el caller cae al
 *                  camino de texto de siempre.
 *   - `failed`   → tenía imágenes pero la copia (o el INSERT) falló a medias; NO
 *                  se creó destino y se limpiaron las copias huérfanas. El caller
 *                  NO debe borrar el recorte: las fotos siguen a salvo en él.
 *
 * Clave de la atomicidad (el driver Neon es HTTP, sin transacción multi-stmt):
 * copiamos TODOS los blobs ANTES de crear el destino. Si una copia falla, no se
 * crea nada y el recorte queda intacto — nunca quedamos con un destino a medio
 * poblar y el origen ya borrado.
 */
export type ReclassifyResult =
  { status: 'ok'; id: string } | { status: 'no-images' } | { status: 'failed' }

/**
 * Texto "placeholder" que el webhook pone cuando una captura de imagen no trae
 * pie real (p. ej. `📸 3 imágenes desde WhatsApp`, `📷 Imagen desde WhatsApp`).
 * Es un rótulo de UI, no contenido del usuario: al reclasificar no debe viajar
 * como cuerpo de la nota ni como caption del momento.
 */
const SYNTHETIC_CAPTION = /^(?:📸|📷)\s*(?:\d+\s+)?im[áa]gen(?:es)?\s+desde\s+whatsapp$/iu

function stripSyntheticCaption(text: string): string {
  return SYNTHETIC_CAPTION.test(text.trim()) ? '' : text
}

/**
 * storage_key de cada imagen del recorte: si es un evento (filas en
 * `recorte_images`), todas por posición; si es legacy de una sola imagen, su
 * `image_key`. Vacío si el recorte no tiene imagen propia (texto/enlace) — en
 * ese caso el caller cae al camino de texto. Exige que el recorte esté VIVO
 * (no soft-borrado): un puntero desincronizado a un recorte ya borrado no debe
 * producir keys (evita reclasificar dos veces el mismo evento).
 */
export async function readRecorteImageKeys(
  sql: SqlClient,
  userId: string,
  recorteId: string,
): Promise<string[]> {
  const rows = await sqlTyped<{ storage_key: string }>(sql`
    SELECT ri.storage_key
    FROM recorte_images ri
    WHERE ri.recorte_id = ${recorteId} AND ri.user_id = ${userId}
      AND EXISTS (
        SELECT 1 FROM recortes r
        WHERE r.id = ri.recorte_id AND r.user_id = ${userId} AND r.deleted_at IS NULL
      )
    ORDER BY ri.position ASC
  `)
  if (rows.length > 0) return rows.map((r) => r.storage_key)
  const legacy = await sqlTyped<{ image_key: string | null }>(sql`
    SELECT image_key
    FROM recortes
    WHERE id = ${recorteId} AND user_id = ${userId} AND deleted_at IS NULL
    LIMIT 1
  `)
  const key = legacy[0]?.image_key
  return key ? [key] : []
}

/**
 * Reclasifica un recorte con imágenes a un Momento foto (episodio): copia TODOS
 * los blobs a `momentos-media` y, solo si todos copiaron, crea un único momento
 * con `payload.items[]`.
 */
export async function reclassifyRecorteToMomento(
  sql: SqlClient,
  userId: string,
  recorteId: string,
  caption: string,
): Promise<ReclassifyResult> {
  const keys = await readRecorteImageKeys(sql, userId, recorteId)
  if (keys.length === 0) return { status: 'no-images' }
  const copied: string[] = []
  for (const key of keys) {
    const c = await copyRecorteImageToStore('momentos-media', key, userId)
    if (!c) {
      // Una copia falló: limpiamos las ya copiadas (huérfanas) y dejamos el
      // recorte intacto. Nunca creamos un momento a medio poblar.
      await Promise.all(copied.map((k) => removeBlob('momentos-media', k)))
      return { status: 'failed' }
    }
    copied.push(c.storageKey)
  }
  const { id } = await persistImageMomentoEpisode(
    sql,
    userId,
    copied,
    stripSyntheticCaption(caption),
  )
  if (!id) {
    await Promise.all(copied.map((k) => removeBlob('momentos-media', k)))
    return { status: 'failed' }
  }
  return { status: 'ok', id }
}

/**
 * Reclasifica un recorte con imágenes a una Nota con las imágenes adjuntas:
 * copia TODOS los blobs a `notas-attachments` y, solo si todos copiaron, crea la
 * nota y cuelga una fila por imagen.
 */
export async function reclassifyRecorteToNote(
  sql: SqlClient,
  userId: string,
  recorteId: string,
  text: string,
): Promise<ReclassifyResult> {
  const keys = await readRecorteImageKeys(sql, userId, recorteId)
  if (keys.length === 0) return { status: 'no-images' }
  // Copiamos TODOS los blobs primero; solo si están a salvo creamos la nota.
  const copied: Array<{ storageKey: string; mime: string; size: number }> = []
  for (const key of keys) {
    const c = await copyRecorteImageToStore('notas-attachments', key, userId)
    if (!c) {
      await Promise.all(copied.map((x) => removeBlob('notas-attachments', x.storageKey)))
      return { status: 'failed' }
    }
    copied.push(c)
  }
  const cleaned = stripSyntheticCaption(text).trim()
  const content = cleaned.length > 0 ? cleaned : 'Imágenes desde WhatsApp'
  // Reusamos el mismo INSERT de notas que la captura normal (tags, source) para
  // no desincronizar el shape.
  const { id: noteId } = await persistCapture(sql, userId, { kind: 'note', content })
  if (!noteId) {
    await Promise.all(copied.map((x) => removeBlob('notas-attachments', x.storageKey)))
    return { status: 'failed' }
  }
  for (let i = 0; i < copied.length; i++) {
    const c = copied[i]!
    const ext = c.mime.split('/')[1]?.split(';')[0] ?? 'jpg'
    await sqlTyped(sql`
      INSERT INTO notas_attachments (
        owner_type, owner_id, file_name, mime_type, byte_size, storage_key, user_id
      )
      VALUES (
        'note', ${noteId}, ${`imagen-${i + 1}.${ext}`}, ${c.mime}, ${c.size},
        ${c.storageKey}, ${userId}
      )
    `)
  }
  return { status: 'ok', id: noteId }
}
