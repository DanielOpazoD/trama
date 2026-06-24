import { getSql, sqlTyped } from '../db.js'
import type { CaptureKind } from './types.js'

/**
 * Primitivas de la "última captura" de WhatsApp: el puntero `last_capture_*` en
 * `whatsapp_links` y las mutaciones que dependen de él (soft-delete, deshacer,
 * lectura del texto fuente). Es la base que comparten los comandos de edición
 * (título / etiqueta / recategorizar / descripción) y el pipeline de media.
 * Todas reciben el `sql` ya scopeado al RLS del dueño.
 */

/** Sustantivo legible por kind, para las confirmaciones. */
export const NOUN_BY_KIND: Record<string, string> = {
  note: 'La nota',
  quote: 'La cita',
  entity: 'La entidad',
  momento: 'El momento',
  recorte: 'El recorte',
  task: 'La tarea',
}

/** Soft-delete de la última captura según su kind. Devuelve si borró algo. */
export async function softDeleteCapture(
  sql: ReturnType<typeof getSql>,
  userId: string,
  kind: string,
  id: string,
): Promise<boolean> {
  const del = (q: Promise<unknown>) => sqlTyped<{ id: string }>(q)
  let rows: { id: string }[] = []
  if (kind === 'note') {
    rows = await del(sql`UPDATE notes SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  } else if (kind === 'momento') {
    rows = await del(sql`UPDATE momentos SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  } else if (kind === 'entity') {
    rows = await del(sql`UPDATE entities SET deleted_at = NOW()
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  } else if (kind === 'quote') {
    rows = await del(sql`UPDATE quotes SET deleted_at = NOW()
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  } else if (kind === 'recorte') {
    rows = await del(sql`UPDATE recortes SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  } else if (kind === 'task') {
    rows = await del(sql`UPDATE tasks SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL RETURNING id`)
  }
  return rows.length > 0
}

/**
 * Deshace la última captura del número: lee last_capture_*, la soft-deletea y
 * limpia el puntero (naturalmente idempotente — un segundo "deshacer" ya no
 * encuentra nada). Corre bajo el RLS del dueño (ya seteado).
 */
export async function undoLastCapture(
  sql: ReturnType<typeof getSql>,
  userId: string,
  phone: string,
): Promise<string> {
  const rows = await sqlTyped<{ kind: string | null; cap_id: string | null }>(sql`
    SELECT last_capture_kind AS kind, last_capture_id AS cap_id
    FROM whatsapp_links
    WHERE phone_e164 = ${phone} AND user_id = ${userId} AND deleted_at IS NULL
    LIMIT 1
  `)
  const last = rows[0]
  if (!last?.kind || !last.cap_id) {
    return 'No hay nada reciente para deshacer.'
  }
  const deleted = await softDeleteCapture(sql, userId, last.kind, last.cap_id)
  // AWAITeado (no fire-and-forget), por la misma razón que recordLastCapture: en
  // serverless un floating promise puede no escribir antes de que se congele la
  // instancia, y entonces el puntero quedaría apuntando a una captura ya borrada
  // (el siguiente comando resolvería un target stale). Sigue siendo best-effort.
  try {
    await sql`
      UPDATE whatsapp_links
      SET last_capture_kind = NULL, last_capture_id = NULL, updated_at = NOW()
      WHERE phone_e164 = ${phone} AND user_id = ${userId} AND deleted_at IS NULL
    `
  } catch {
    // El soft-delete ya ocurrió; en el peor caso queda un puntero stale.
  }
  const noun = NOUN_BY_KIND[last.kind as CaptureKind] ?? 'La última captura'
  return deleted
    ? `↩️ Hecho. ${noun} se eliminó.`
    : 'Eso ya no estaba (quizá lo eliminaste desde la app).'
}

/**
 * Recuerda la última captura del número para que "deshacer" sepa qué borrar.
 * Se AWAITea (no fire-and-forget): en serverless la función puede terminar
 * antes de que una promesa suelta complete su escritura, y si eso pasa el
 * "deshacer" del usuario apuntaría a la captura anterior (o a nada). Es
 * best-effort igual: si el UPDATE falla, "deshacer" simplemente no tendrá
 * target, pero la captura ya quedó guardada.
 */
export async function recordLastCapture(
  sql: ReturnType<typeof getSql>,
  phone: string,
  userId: string,
  kind: string,
  id: string,
): Promise<void> {
  try {
    await sql`
      UPDATE whatsapp_links
      SET last_capture_kind = ${kind}, last_capture_id = ${id}::uuid,
          last_capture_at = NOW(), updated_at = NOW()
      WHERE phone_e164 = ${phone} AND user_id = ${userId} AND deleted_at IS NULL
    `
  } catch {
    // best-effort: si falla, "deshacer" no tendrá target pero la captura quedó.
  }
}

/** Puntero a la última captura del número (kind + id), o null. */
export async function readLastPointer(
  sql: ReturnType<typeof getSql>,
  userId: string,
  phone: string,
): Promise<{ kind: string; id: string } | null> {
  const rows = await sqlTyped<{ kind: string | null; cap_id: string | null }>(sql`
    SELECT last_capture_kind AS kind, last_capture_id AS cap_id
    FROM whatsapp_links
    WHERE phone_e164 = ${phone} AND user_id = ${userId} AND deleted_at IS NULL
    LIMIT 1
  `)
  const r = rows[0]
  return r?.kind && r.cap_id ? { kind: r.kind, id: r.cap_id } : null
}

/** Lee el texto fuente de una captura para poder reclasificarla. */
export async function readCaptureText(
  sql: ReturnType<typeof getSql>,
  kind: string,
  id: string,
  userId: string,
): Promise<string | null> {
  const one = (q: Promise<unknown>) => sqlTyped<{ t: string | null }>(q)
  let rows: { t: string | null }[] = []
  if (kind === 'note') {
    rows = await one(sql`SELECT content AS t FROM notes
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL LIMIT 1`)
  } else if (kind === 'momento') {
    rows = await one(sql`SELECT payload->>'bodyText' AS t FROM momentos
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL LIMIT 1`)
  } else if (kind === 'entity') {
    rows = await one(sql`SELECT name AS t FROM entities
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL LIMIT 1`)
  } else if (kind === 'quote') {
    rows = await one(sql`SELECT text AS t FROM quotes
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL LIMIT 1`)
  } else if (kind === 'recorte') {
    rows = await one(sql`SELECT text AS t FROM recortes
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL LIMIT 1`)
  } else if (kind === 'task') {
    rows = await one(sql`SELECT title AS t FROM tasks
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL LIMIT 1`)
  }
  const t = rows[0]?.t
  return t && t.trim() ? t.trim() : null
}
