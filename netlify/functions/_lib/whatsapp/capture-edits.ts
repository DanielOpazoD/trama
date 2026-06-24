import { getSql, sqlTyped } from '../db.js'
import { captureDeepLink } from './deep-link.js'
import { applyDescription, setAwaitingDescription } from './description.js'
import {
  NOUN_BY_KIND,
  readCaptureText,
  readLastPointer,
  recordLastCapture,
  softDeleteCapture,
} from './last-capture.js'
import { persistCapture } from './persist.js'
import {
  reclassifyRecorteToMomento,
  reclassifyRecorteToNote,
} from './reclassify-media.js'
import type { CaptureIntent } from './types.js'
import { openInTramaLine, parseInlineTags } from './webhook-replies.js'

/**
 * Comandos de edición de la última captura de WhatsApp: describir una foto,
 * retitular, etiquetar y reclasificar. Todos resuelven el target con
 * `readLastPointer` (last-capture.ts) y corren bajo el RLS del dueño.
 */

/**
 * Comando/botón [Descripción]: describe la última foto del número. Con texto en
 * el mismo mensaje («descripción una tarde») lo aplica directo; sin texto (el
 * botón solo manda "Descripción") deja el estado conversacional y pide el texto
 * — que el siguiente mensaje libre consume (flujo de PR3).
 */
export async function describeLast(
  sql: ReturnType<typeof getSql>,
  userId: string,
  phone: string,
  text: string,
  origin: string,
): Promise<string> {
  const last = await readLastPointer(sql, userId, phone)
  if (!last || (last.kind !== 'recorte' && last.kind !== 'momento')) {
    return 'No hay ninguna foto reciente para describir. Manda una foto y después su descripción.'
  }
  if (text.trim()) {
    const ok = await applyDescription(sql, userId, last.kind, last.id, text)
    if (!ok) return 'No pude agregar la descripción (¿la borraste desde la app?).'
    return `✍️ Descripción agregada.\n${openInTramaLine(origin, last.kind)}`
  }
  await setAwaitingDescription(sql, phone, userId, last.kind, last.id)
  return '✍️ Perfecto, mándame la descripción y se la agrego.'
}

/** Comando `título <texto>`: nombra la última captura (notas/entidades). */
export async function retitleLast(
  sql: ReturnType<typeof getSql>,
  userId: string,
  phone: string,
  title: string,
): Promise<string> {
  const last = await readLastPointer(sql, userId, phone)
  if (!last) return 'No hay nada reciente para titular.'
  const clean = title.trim().slice(0, 200)
  if (!clean) {
    // Un título vacío (p. ej. «título   ») no debe sobrescribir con '' la captura.
    return 'Dime qué título poner. Por ejemplo: título Ideas de verano'
  }
  let rows: { id: string }[] = []
  if (last.kind === 'note') {
    rows = await sqlTyped<{
      id: string
    }>(sql`UPDATE notes SET title = ${clean}, updated_at = NOW()
      WHERE id = ${last.id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  } else if (last.kind === 'entity') {
    rows = await sqlTyped<{ id: string }>(sql`UPDATE entities SET name = ${clean}
      WHERE id = ${last.id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  } else {
    return 'Ese tipo de captura no lleva título. Puedes ajustarlo desde la app.'
  }
  return rows.length
    ? `🏷️ Título actualizado: «${clean}».`
    : 'No encontré esa captura (quizá la eliminaste desde la app).'
}

/** Comando `etiqueta <palabras>`: agrega tags (dedup) a la última captura. */
export async function tagLast(
  sql: ReturnType<typeof getSql>,
  userId: string,
  phone: string,
  tagsRaw: string,
): Promise<string> {
  const tags = parseInlineTags(tagsRaw)
  if (tags.length === 0) {
    return 'Dime qué etiquetas agregar. Por ejemplo: etiqueta trabajo, ideas'
  }
  const last = await readLastPointer(sql, userId, phone)
  if (!last) return 'No hay nada reciente para etiquetar.'
  let rows: { id: string }[] = []
  if (last.kind === 'note') {
    rows = await sqlTyped<{ id: string }>(sql`UPDATE notes
      SET tags = ARRAY(SELECT DISTINCT unnest(tags || ${tags}::text[])), updated_at = NOW()
      WHERE id = ${last.id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  } else if (last.kind === 'quote') {
    rows = await sqlTyped<{ id: string }>(sql`UPDATE quotes
      SET tags = ARRAY(SELECT DISTINCT unnest(tags || ${tags}::text[]))
      WHERE id = ${last.id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  } else if (last.kind === 'entity') {
    rows = await sqlTyped<{ id: string }>(sql`UPDATE entities
      SET tags = ARRAY(SELECT DISTINCT unnest(tags || ${tags}::text[]))
      WHERE id = ${last.id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  } else if (last.kind === 'momento') {
    rows = await sqlTyped<{ id: string }>(sql`UPDATE momentos
      SET tags = ARRAY(SELECT DISTINCT unnest(tags || ${tags}::text[])), updated_at = NOW()
      WHERE id = ${last.id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  } else {
    return 'Ese tipo de captura todavía no admite etiquetas por aquí.'
  }
  return rows.length
    ? `🏷️ Etiquetas agregadas: ${tags.join(', ')}.`
    : 'No encontré esa captura (quizá la eliminaste desde la app).'
}

/** Comando de reclasificación (palabra suelta): re-archiva la última captura
 *  como otro tipo reusando su texto fuente. */
export async function recategorizeLast(
  sql: ReturnType<typeof getSql>,
  userId: string,
  phone: string,
  toKind: 'note' | 'momento' | 'entity' | 'task',
  origin: string,
): Promise<string> {
  const last = await readLastPointer(sql, userId, phone)
  if (!last) return 'No hay nada reciente para reclasificar.'
  if (last.kind === toKind) {
    return `Eso ya está guardado como ${NOUN_BY_KIND[toKind] ?? 'esa categoría'}.`
  }

  // Reclasificación NO destructiva de un recorte CON imágenes: copiamos las
  // fotos al destino (Momento foto episódico o Nota con adjuntos) en vez de
  // arrastrar solo el texto. Si el recorte no tiene imágenes (texto/enlace), el
  // helper devuelve null y caemos al camino de texto de abajo.
  if (last.kind === 'recorte' && (toKind === 'momento' || toKind === 'note')) {
    const caption = (await readCaptureText(sql, 'recorte', last.id, userId)) ?? ''
    const result =
      toKind === 'momento'
        ? await reclassifyRecorteToMomento(sql, userId, last.id, caption)
        : await reclassifyRecorteToNote(sql, userId, last.id, caption)
    if (result.status === 'ok') {
      // El destino quedó con TODAS las imágenes: recién ahora borramos el recorte.
      await softDeleteCapture(sql, userId, last.kind, last.id)
      await recordLastCapture(sql, phone, userId, toKind, result.id)
      const link = captureDeepLink(origin, toKind)
      const msg =
        toKind === 'momento'
          ? '🔄 Reclasificado como Momento con sus imágenes.'
          : '🔄 Reclasificado como Nota con sus imágenes.'
      return `${msg}\n🔗 Ábrelo en Trama: ${link}\n↩️ ¿No era así? Responde «deshacer».`
    }
    if (result.status === 'failed') {
      // La copia falló a medias: el recorte sigue intacto con sus fotos, no lo
      // borramos. No caemos al camino de texto (perdería las imágenes).
      return 'No pude mover las imágenes ahora mismo. Tu recorte sigue en Recortes con sus fotos; vuelve a intentarlo en un momento.'
    }
    // result.status === 'no-images' → recorte de texto/enlace: sigue al camino
    // de texto de abajo (ahí sí reusar el texto es correcto).
  }

  // Una tarea es texto/acción: no lleva imagen. Si la última captura es un
  // recorte (foto), no la convertimos en tarea —perdería la imagen—; el menú
  // «Tarea» vive en las capturas de texto, no en las fotos.
  if (last.kind === 'recorte' && toKind === 'task') {
    return 'Una foto no se vuelve tarea (perdería la imagen). Déjala en Recortes, pásala a Nota o Momento, o manda la tarea aparte con «tarea: …».'
  }

  const text = await readCaptureText(sql, last.kind, last.id, userId)
  if (!text) {
    return 'No pude leer esa captura para reclasificarla. Puedes recrearla con el prefijo correcto.'
  }
  const intent: CaptureIntent =
    toKind === 'note'
      ? { kind: 'note', content: text }
      : toKind === 'momento'
        ? { kind: 'momento', bodyText: text }
        : toKind === 'task'
          ? { kind: 'task', title: text, detail: null }
          : { kind: 'entity', name: text, entityType: 'concepto', description: null }
  const { message, id } = await persistCapture(sql, userId, intent)
  if (!id) return 'No pude reclasificarla en este momento. Vuelve a intentarlo.'
  await softDeleteCapture(sql, userId, last.kind, last.id)
  await recordLastCapture(sql, phone, userId, intent.kind, id)
  const link = captureDeepLink(origin, intent.kind)
  return `🔄 Reclasificado. ${message}\n🔗 Ábrelo en Trama: ${link}\n↩️ ¿No era así? Responde «deshacer».`
}
