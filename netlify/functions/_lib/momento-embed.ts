/**
 * Construye el texto agregado de un Momento que va al embedding.
 * Función pura — recibe kind + payload + note, devuelve la string
 * concatenada (o "" si no hay nada significativo).
 *
 * Compartida entre:
 *   - momentos.mts (POST/PATCH, decide qué embedear)
 *   - momentos-suggest-entities.mts (texto que la IA escanea)
 *
 * Sin esta función ambos endpoints concatenaban campos a mano con
 * shapes ligeramente distintas (drift). Acá vive la definición canónica.
 *
 * FF2: la validación de payload se delegó a `src/schemas/momento.ts`
 * (Zod). Re-exportamos los mismos nombres acá para que los call sites
 * existentes no cambien.
 */

import {
  validateMomentoPayload as _validateMomentoPayload,
  type MomentoKind as _MomentoKind,
} from '../../../src/schemas/momento.js'

export type MomentoKind = _MomentoKind

/**
 * Validación del payload por kind. Defensive — el endpoint no debería
 * aceptar un kind='foto' sin storageKey, por ejemplo. Devuelve null
 * si todo OK, o un mensaje de error humano si rechaza.
 *
 * @deprecated Usar `validateMomentoPayload` de `src/schemas/momento.ts`.
 *             Este re-export se mantiene para no romper call sites antiguos.
 */
export function validatePayloadForKind(
  kind: MomentoKind,
  payload: Record<string, unknown>,
): string | null {
  return _validateMomentoPayload(kind, payload)
}

export function momentoEmbedText(
  kind: MomentoKind,
  payload: Record<string, unknown>,
  note: string | null,
): string {
  const parts: string[] = []
  if (note) parts.push(note)

  if (kind === 'nota') {
    if (typeof payload.bodyText === 'string') parts.push(payload.bodyText)
  } else if (kind === 'recorte') {
    if (typeof payload.title === 'string') parts.push(payload.title)
    if (typeof payload.bodyText === 'string') parts.push(payload.bodyText)
    if (typeof payload.author === 'string') parts.push(`Autor: ${payload.author}`)
    if (typeof payload.source === 'string') parts.push(`Fuente: ${payload.source}`)
  } else if (kind === 'foto') {
    if (typeof payload.caption === 'string') parts.push(payload.caption)
  }

  return parts.filter((s) => s && s.length > 0).join('\n').trim()
}
