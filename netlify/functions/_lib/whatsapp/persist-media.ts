import { sqlTyped, type SqlClient } from '../db.js'
import { WHATSAPP_ORIGIN, type CaptureResult } from './persist.js'

/**
 * Persistencia de media de WhatsApp. Las imágenes ya tienen casa:
 * - Recorte (default): `image_key` en el store recortes-media, capture_mode
 *   'image'. La vista de Recortes ya renderiza imágenes.
 * - Momento foto (override `momento:`): payload `{ storageKey }` en
 *   momentos-media, que MomentoEntry ya muestra.
 *
 * Ambas marcan procedencia WhatsApp (recortes.source / origin.importedFrom)
 * para el iconito de la UI. El blob ya fue subido por el webhook; acá solo
 * insertamos la fila.
 */

export async function persistImageRecorte(
  sql: SqlClient,
  userId: string,
  imageKey: string,
  caption: string,
): Promise<CaptureResult> {
  // `recortes.text` es NOT NULL (1-20000): si no hay caption, ponemos un
  // texto mínimo descriptivo.
  const text = caption.trim().length > 0 ? caption.trim() : '📷 Imagen desde WhatsApp'
  const rows = await sqlTyped<{ id: string }>(sql`
    INSERT INTO recortes (text, image_key, capture_mode, captured_at, status, source, user_id)
    VALUES (${text}, ${imageKey}, 'image', NOW(), 'pending', 'whatsapp', ${userId})
    RETURNING id
  `)
  const id = rows[0]?.id
  // El blob ya está subido: si el INSERT no devuelve id algo salió mal y NO
  // debemos reportar éxito (dejaría un blob huérfano y un "deshacer" roto).
  if (!id) throw new Error('persistImageRecorte: INSERT no devolvió id')
  return { message: '📷 Imagen guardada en Recortes.', id }
}

export async function persistImageMomento(
  sql: SqlClient,
  userId: string,
  storageKey: string,
  caption: string,
): Promise<CaptureResult> {
  const payload =
    caption.trim().length > 0 ? { storageKey, caption: caption.trim() } : { storageKey }
  const rows = await sqlTyped<{ id: string }>(sql`
    INSERT INTO momentos (kind, captured_at, payload, note, origin, user_id)
    VALUES (
      'foto', NOW(), ${JSON.stringify(payload)}::jsonb, ${null}, ${WHATSAPP_ORIGIN}::jsonb, ${userId}
    )
    RETURNING id
  `)
  const id = rows[0]?.id
  if (!id) throw new Error('persistImageMomento: INSERT no devolvió id')
  return { message: '📷 Foto añadida a Momentos.', id }
}

/**
 * Varias fotos de un MISMO mensaje de WhatsApp → un solo Momento foto
 * (un "episodio"), usando el array `payload.items[]` (formato υ-multi del
 * dominio). Modela "estas fotos son un mismo momento" en vez de N momentos
 * sueltos. Sirve también para una sola foto (items de largo 1, válido por
 * MomentoFotoPayloadSchema). El blob de cada foto ya fue subido por el webhook.
 */
export async function persistImageMomentoEpisode(
  sql: SqlClient,
  userId: string,
  storageKeys: string[],
  caption: string,
): Promise<CaptureResult> {
  const items = storageKeys.map((storageKey) => ({ storageKey }))
  const payload =
    caption.trim().length > 0 ? { items, caption: caption.trim() } : { items }
  const rows = await sqlTyped<{ id: string }>(sql`
    INSERT INTO momentos (kind, captured_at, payload, note, origin, user_id)
    VALUES (
      'foto', NOW(), ${JSON.stringify(payload)}::jsonb, ${null}, ${WHATSAPP_ORIGIN}::jsonb, ${userId}
    )
    RETURNING id
  `)
  const id = rows[0]?.id
  if (!id) throw new Error('persistImageMomentoEpisode: INSERT no devolvió id')
  const n = storageKeys.length
  return {
    message:
      n === 1 ? '📷 Foto añadida a Momentos.' : `📷 ${n} fotos añadidas a Momentos.`,
    id,
  }
}
