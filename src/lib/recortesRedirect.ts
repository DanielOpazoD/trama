import type { World } from '../types/world'
import type { NotasSection } from '../types/notas'

/**
 * Redirección de enlaces viejos de Recortes hacia su nuevo hogar.
 *
 * Recortes dejó de ser una vista top-level del mundo `trama` y pasó a ser
 * la sección `bandeja` dentro del mundo `notas`. Los deep-links históricos
 * (`?view=recortes`, opcionalmente con `&tab=...&project=...`) deben seguir
 * funcionando: los traducimos a `?world=notas&section=bandeja` preservando
 * `tab`/`project` para que RecortesArea abra el subcontexto correcto.
 *
 * Función pura sobre el `search` string para poder testearla sin DOM. Si la
 * URL no apunta a `view=recortes`, devuelve `null` (no hay redirección).
 */
export type RecortesRedirect = {
  world: Extract<World, 'notas'>
  section: Extract<NotasSection, 'bandeja'>
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
  next.set('section', 'bandeja')
  // Preserva los params que RecortesArea sabe leer (tab/project).
  const tab = params.get('tab')
  if (tab) next.set('tab', tab)
  const project = params.get('project')
  if (project) next.set('project', project)

  return {
    world: 'notas',
    section: 'bandeja',
    search: `?${next.toString()}`,
  }
}
