import { sqlTyped, type SqlClient } from '../db.js'
import { createNetlifyBlobStorageAdapter } from '../storage-adapter.js'
import { checksumSha256, recordStorageAsset } from '../storage-assets.js'
import { WHATSAPP_ORIGIN, type CaptureResult } from './persist.js'
import { audioExtFromMime } from './media.js'

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

export async function persistVideoRecorte(
  sql: SqlClient,
  userId: string,
  videoKey: string,
  caption: string,
): Promise<CaptureResult> {
  const text = caption.trim().length > 0 ? caption.trim() : '🎬 Video desde WhatsApp'
  const rows = await sqlTyped<{ id: string }>(sql`
    INSERT INTO recortes (text, image_key, capture_mode, captured_at, status, source, user_id)
    VALUES (${text}, ${videoKey}, 'video', NOW(), 'pending', 'whatsapp', ${userId})
    RETURNING id
  `)
  const id = rows[0]?.id
  if (!id) throw new Error('persistVideoRecorte: INSERT no devolvió id')
  return { message: '🎬 Video guardado en Recortes.', id }
}

/**
 * Varias imágenes de un MISMO mensaje → UN recorte-evento con todas. La primera
 * queda como `image_key` (portada, para lectores de una sola imagen) y TODAS
 * van a `recorte_images`. Así "deshacer" borra el evento entero (una fila) y la
 * tarjeta puede mostrar portada + contador + visor. Los blobs ya los subió el
 * webhook al store `recortes-media`.
 */
export async function persistImageRecorteEvent(
  sql: SqlClient,
  userId: string,
  images: Array<{ key: string; mime: string }>,
  caption: string,
): Promise<CaptureResult> {
  const text =
    caption.trim().length > 0
      ? caption.trim()
      : `📸 ${images.length} imágenes desde WhatsApp`
  const cover = images[0]!.key
  const keys = images.map((i) => i.key)
  const mimes = images.map((i) => i.mime)
  // Recorte (portada) + sus N imágenes en UN solo CTE: el driver Neon es HTTP
  // (cada sentencia suelta sería su propia transacción), así que sin el CTE un
  // fallo a media tanda dejaría un evento mutilado y sin "deshacer". `unnest …
  // WITH ORDINALITY` empareja key↔mime y asigna `position` (0-based) de una.
  const rows = await sqlTyped<{ id: string }>(sql`
    WITH new_recorte AS (
      INSERT INTO recortes (text, image_key, capture_mode, captured_at, status, source, user_id)
      VALUES (${text}, ${cover}, 'image', NOW(), 'pending', 'whatsapp', ${userId})
      RETURNING id
    ),
    imgs AS (
      INSERT INTO recorte_images (recorte_id, user_id, storage_key, mime, position)
      SELECT r.id, ${userId}, x.key, x.mime, (x.ord - 1)::int
      FROM new_recorte r,
        unnest(${keys}::text[], ${mimes}::text[]) WITH ORDINALITY AS x(key, mime, ord)
      RETURNING 1
    )
    SELECT id FROM new_recorte
  `)
  const id = rows[0]?.id
  if (!id) throw new Error('persistImageRecorteEvent: INSERT no devolvió id')
  return {
    message: `📸 ${images.length} imágenes guardadas como un evento en Recortes.`,
    id,
  }
}

export async function persistImageMomento(
  sql: SqlClient,
  userId: string,
  storageKey: string,
  caption: string,
  capturedAt?: string | null,
): Promise<CaptureResult> {
  const payload =
    caption.trim().length > 0 ? { storageKey, caption: caption.trim() } : { storageKey }
  const rows = await sqlTyped<{ id: string }>(sql`
    INSERT INTO momentos (kind, captured_at, payload, note, origin, user_id)
    VALUES (
      'foto',
      COALESCE(${capturedAt ?? null}::timestamptz, NOW()),
      ${JSON.stringify(payload)}::jsonb,
      ${null},
      ${WHATSAPP_ORIGIN}::jsonb,
      ${userId}
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
  capturedAt?: string | null,
): Promise<CaptureResult> {
  const items = storageKeys.map((storageKey) => ({ storageKey }))
  const payload =
    caption.trim().length > 0 ? { items, caption: caption.trim() } : { items }
  const rows = await sqlTyped<{ id: string }>(sql`
    INSERT INTO momentos (kind, captured_at, payload, note, origin, user_id)
    VALUES (
      'foto',
      COALESCE(${capturedAt ?? null}::timestamptz, NOW()),
      ${JSON.stringify(payload)}::jsonb,
      ${null},
      ${WHATSAPP_ORIGIN}::jsonb,
      ${userId}
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

function randomHex(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Guarda el audio de una nota de voz como ANEXO de la nota recién transcrita
 * (tabla `notas_attachments`, store `notas-attachments`), para poder
 * re-escucharlo desde la tarjeta. A diferencia de las fotos —donde el webhook
 * ya subió el blob—, acá subimos el blob y guardamos la fila en un paso, porque
 * el anexo cuelga del id de la nota (que recién existe tras persistir la nota).
 *
 * Best-effort por diseño: el caller lo envuelve en try/catch — si falla, la
 * nota transcrita ya quedó guardada; solo se pierde el audio re-escuchable.
 */
export async function persistVoiceNoteAttachment(
  sql: SqlClient,
  userId: string,
  noteId: string,
  audio: ArrayBuffer,
  mime: string,
): Promise<void> {
  const ext = audioExtFromMime(mime)
  const fileName = `nota-de-voz.${ext}`
  const storageKey = `${userId}/${randomHex()}.${ext}`
  await createNetlifyBlobStorageAdapter('notas-attachments').put(storageKey, audio, {
    mime,
    size: String(audio.byteLength),
    name: fileName,
  })
  await sqlTyped(sql`
    INSERT INTO notas_attachments (
      owner_type, owner_id, file_name, mime_type, byte_size, storage_key, user_id
    )
    VALUES (
      'note', ${noteId}, ${fileName}, ${mime}, ${audio.byteLength}, ${storageKey}, ${userId}
    )
  `)
  await recordStorageAsset(sql, {
    userId,
    domain: 'notas-attachments',
    ownerType: 'note',
    ownerId: noteId,
    provider: 'netlify-blobs',
    storageKey,
    mimeType: mime,
    byteSize: audio.byteLength,
    checksum: checksumSha256(audio),
  })
}
