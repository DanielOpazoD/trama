import { sqlTyped, type SqlClient } from '../db.js'
import { copyRecorteImageToStore } from '../recorte-to-momento.js'
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
 * nada. El recorte original lo soft-borra el caller (recategorizeLast) tras
 * crear el destino, para que "deshacer" siga teniendo sentido.
 */

/**
 * storage_key de cada imagen del recorte: si es un evento (filas en
 * `recorte_images`), todas por posición; si es legacy de una sola imagen, su
 * `image_key`. Vacío si el recorte no tiene imagen propia (texto/enlace) — en
 * ese caso el caller cae al camino de texto.
 */
export async function readRecorteImageKeys(
  sql: SqlClient,
  userId: string,
  recorteId: string,
): Promise<string[]> {
  const rows = await sqlTyped<{ storage_key: string }>(sql`
    SELECT storage_key
    FROM recorte_images
    WHERE recorte_id = ${recorteId} AND user_id = ${userId}
    ORDER BY position ASC
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
 * Reclasifica un recorte con imágenes a un Momento foto (episodio): copia cada
 * blob a `momentos-media` y crea un único momento con `payload.items[]`. Devuelve
 * el id del momento, o `null` si el recorte no tenía imágenes copiables (→ el
 * caller cae al camino de texto).
 */
export async function reclassifyRecorteToMomento(
  sql: SqlClient,
  userId: string,
  recorteId: string,
  caption: string,
): Promise<string | null> {
  const keys = await readRecorteImageKeys(sql, userId, recorteId)
  if (keys.length === 0) return null
  const copied: string[] = []
  for (const key of keys) {
    const c = await copyRecorteImageToStore('momentos-media', key, userId)
    if (c) copied.push(c.storageKey)
  }
  if (copied.length === 0) return null
  const { id } = await persistImageMomentoEpisode(sql, userId, copied, caption)
  return id
}

/**
 * Reclasifica un recorte con imágenes a una Nota con las imágenes adjuntas:
 * crea la nota (texto = el del recorte) y copia cada blob a `notas-attachments`
 * registrando una fila por imagen. Devuelve el id de la nota, o `null` si no
 * había imágenes copiables.
 */
export async function reclassifyRecorteToNote(
  sql: SqlClient,
  userId: string,
  recorteId: string,
  text: string,
): Promise<string | null> {
  const keys = await readRecorteImageKeys(sql, userId, recorteId)
  if (keys.length === 0) return null
  const content = text.trim().length > 0 ? text.trim() : '📸 Imágenes desde WhatsApp'
  // Reusamos el mismo INSERT de notas que la captura normal (tags, source) para
  // no desincronizar el shape; luego colgamos las imágenes como anexos.
  const { id: noteId } = await persistCapture(sql, userId, { kind: 'note', content })
  if (!noteId) return null
  let attached = 0
  for (let i = 0; i < keys.length; i++) {
    const c = await copyRecorteImageToStore('notas-attachments', keys[i]!, userId)
    if (!c) continue
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
    attached++
  }
  // Si ningún blob se pudo copiar, la nota queda igual (texto), sin imágenes:
  // mejor una nota sin fotos que perder la reclasificación.
  if (attached === 0) {
    // no-op: dejamos la nota creada con su texto.
  }
  return noteId
}
