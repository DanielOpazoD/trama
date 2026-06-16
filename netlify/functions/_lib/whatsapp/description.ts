import { sqlTyped, type SqlClient } from '../db.js'

/**
 * "Pedir descripción": tras capturar una foto SIN pie, el bot ofrece agregar una
 * descripción y el SIGUIENTE texto libre del número se aplica a esa captura.
 *
 * Como ese texto llega en OTRO mensaje (sin contexto), guardamos un puntero
 * efímero en `whatsapp_links` (awaiting_desc_*) con su instante, y lo vencemos
 * por ventana. Lo setea la captura sin pie; lo consume/limpia el texto siguiente.
 */

/** Ventana para aplicar el texto siguiente como descripción (respuesta rápida). */
export const AWAITING_DESC_WINDOW_SECONDS = 300

/** Marca que la última captura espera una descripción (best-effort). */
export async function setAwaitingDescription(
  sql: SqlClient,
  phone: string,
  userId: string,
  kind: string,
  id: string,
): Promise<void> {
  try {
    await sql`
      UPDATE whatsapp_links
      SET awaiting_desc_kind = ${kind}, awaiting_desc_id = ${id}::uuid,
          awaiting_desc_at = NOW(), updated_at = NOW()
      WHERE phone_e164 = ${phone} AND user_id = ${userId} AND deleted_at IS NULL
    `
  } catch {
    // best-effort: si falla, simplemente no ofrecemos la descripción de seguimiento.
  }
}

async function clearAwaitingDescription(
  sql: SqlClient,
  phone: string,
  userId: string,
): Promise<void> {
  try {
    await sql`
      UPDATE whatsapp_links
      SET awaiting_desc_kind = NULL, awaiting_desc_id = NULL,
          awaiting_desc_at = NULL, updated_at = NOW()
      WHERE phone_e164 = ${phone} AND user_id = ${userId} AND deleted_at IS NULL
    `
  } catch {
    /* best-effort */
  }
}

/** Aplica `text` como descripción de la captura. Devuelve si afectó una fila
 *  (false si la captura ya no existe). Recorte → su `text`; Momento foto →
 *  `payload.caption`. */
export async function applyDescription(
  sql: SqlClient,
  userId: string,
  kind: string,
  id: string,
  text: string,
): Promise<boolean> {
  const clean = text.trim().slice(0, 2000)
  if (clean.length === 0) return false
  if (kind === 'recorte') {
    const rows = await sqlTyped<{ id: string }>(sql`
      UPDATE recortes SET text = ${clean}, updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
      RETURNING id
    `)
    return rows.length > 0
  }
  if (kind === 'momento') {
    const rows = await sqlTyped<{ id: string }>(sql`
      UPDATE momentos
      SET payload = jsonb_set(payload, '{caption}', to_jsonb(${clean}::text)), updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL AND kind = 'foto'
      RETURNING id
    `)
    return rows.length > 0
  }
  return false
}

/**
 * Si hay una descripción pendiente reciente para el número, aplica `text` a esa
 * captura y limpia el estado. Devuelve `{ kind }` (para el deep link) si se
 * aplicó, o `null` si no había pendiente / venció / la captura ya no existe — en
 * cuyo caso el caller sigue tratando el texto como una captura nueva.
 */
export async function consumeAwaitingDescription(
  sql: SqlClient,
  userId: string,
  phone: string,
  text: string,
): Promise<{ kind: string } | null> {
  const rows = await sqlTyped<{ kind: string | null; id: string | null }>(sql`
    SELECT awaiting_desc_kind AS kind, awaiting_desc_id AS id
    FROM whatsapp_links
    WHERE phone_e164 = ${phone} AND user_id = ${userId} AND deleted_at IS NULL
      AND awaiting_desc_id IS NOT NULL
      AND awaiting_desc_at > NOW() - (${AWAITING_DESC_WINDOW_SECONDS} || ' seconds')::interval
    LIMIT 1
  `)
  const r = rows[0]
  if (!r?.kind || !r.id) return null
  const applied = await applyDescription(sql, userId, r.kind, r.id, text)
  await clearAwaitingDescription(sql, phone, userId)
  return applied ? { kind: r.kind } : null
}
