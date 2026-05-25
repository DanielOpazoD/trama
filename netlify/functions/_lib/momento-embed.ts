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
 */

export type MomentoKind = 'nota' | 'recorte' | 'foto'

/**
 * Validación del payload por kind. Defensive — el endpoint no debería
 * aceptar un kind='foto' sin storageKey, por ejemplo. Devuelve null
 * si todo OK, o un mensaje de error humano si rechaza.
 *
 * Reglas:
 *   - nota: bodyText debe existir y ser string no-vacía
 *   - recorte: al menos UNO de {url, title, bodyText} debe estar (un
 *     recorte sin nada de contenido textual no aporta — debería ser nota)
 *   - foto: storageKey debe existir y ser string no-vacía (sin imagen
 *     no hay foto que mostrar)
 *
 * Campos extra son aceptados sin rechazar — el shape de payload jsonb
 * es deliberadamente flexible para evolucionar sin migración.
 */
export function validatePayloadForKind(
  kind: MomentoKind,
  payload: Record<string, unknown>,
): string | null {
  if (kind === 'nota') {
    const body = payload.bodyText
    if (typeof body !== 'string' || body.trim().length === 0) {
      return 'kind=nota requiere payload.bodyText no vacío'
    }
    return null
  }
  if (kind === 'recorte') {
    const hasUrl = typeof payload.url === 'string' && payload.url.trim().length > 0
    const hasTitle =
      typeof payload.title === 'string' && payload.title.trim().length > 0
    const hasBody =
      typeof payload.bodyText === 'string' && payload.bodyText.trim().length > 0
    if (!hasUrl && !hasTitle && !hasBody) {
      return 'kind=recorte requiere al menos url, title o bodyText'
    }
    return null
  }
  if (kind === 'foto') {
    // υ-multi: aceptar items[] (nuevo) o storageKey (legacy).
    const items = payload.items
    if (Array.isArray(items) && items.length > 0) {
      const allValid = items.every(
        (it) =>
          it &&
          typeof it === 'object' &&
          typeof (it as { storageKey?: unknown }).storageKey === 'string' &&
          ((it as { storageKey: string }).storageKey).trim().length > 0,
      )
      if (!allValid) {
        return 'kind=foto: cada item del array debe tener storageKey'
      }
      return null
    }
    const key = payload.storageKey
    if (typeof key !== 'string' || key.trim().length === 0) {
      return 'kind=foto requiere payload.storageKey o payload.items[]'
    }
    return null
  }
  return `kind desconocido: ${kind}`
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
