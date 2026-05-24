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
