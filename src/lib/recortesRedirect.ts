import type { World } from '../types/world'
import type { NotasSection } from '../types/notas'

/**
 * Redirección de enlaces viejos de Recortes hacia su nuevo hogar.
 *
 * Recortes dejó de ser una vista top-level del mundo `trama` y sus capturas
 * viven ahora en el feed unificado de Notas (sección `notas`, con su control
 * segmentado Todo · Escritas · Capturas · Favoritos). Los deep-links históricos
 * (`?view=recortes`, opcionalmente con `&tab=...`) deben seguir funcionando: los
 * traducimos a `?world=notas&section=notas`. El viejo `tab=favoritos` se mapea al
 * segmento `favoritos` del feed (`&segment=favoritos`). El resto de los params
 * (incluido `tab=mesa` y `project`, de la Mesa editorial ya removida) se descarta.
 *
 * Función pura sobre el `search` string para poder testearla sin DOM. Si la
 * URL no apunta a `view=recortes`, devuelve `null` (no hay redirección).
 */
export type RecortesRedirect = {
  world: Extract<World, 'notas'>
  section: Extract<NotasSection, 'notas'>
  /** Nuevo `location.search` (incluye el `?` inicial) listo para replaceState. */
  search: string
}

export function resolveRecortesRedirect(search: string): RecortesRedirect | null {
  let params: URLSearchParams
  try {
    params = new URLSearchParams(search)
  } catch {
    return null
  }
  if (params.get('view') !== 'recortes') return null

  const next = new URLSearchParams()
  next.set('world', 'notas')
  next.set('section', 'notas')
  // El viejo tab=favoritos abre el segmento Favoritos del feed unificado.
  if (params.get('tab') === 'favoritos') next.set('segment', 'favoritos')

  return {
    world: 'notas',
    section: 'notas',
    search: `?${next.toString()}`,
  }
}
