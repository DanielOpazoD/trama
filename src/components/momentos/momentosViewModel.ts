import type { Entity, Momento, MomentoKind } from '../../types'

export function readInitialComposeFromSearch(search: string): MomentoKind | undefined {
  try {
    const param = new URLSearchParams(search).get('compose')
    if (param === 'nota' || param === 'recorte' || param === 'foto') {
      return param
    }
  } catch {
    return undefined
  }
  return undefined
}

export function readDayParamFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get('day')
  if (!raw) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const [year, month, day] = raw.split('-').map(Number)
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null
  }
  const parsed = new Date(year, month - 1, day)
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null
  }
  return raw
}

export function filterMomentosByDay(
  items: Momento[],
  dayFilter: string | null,
): Momento[] {
  if (!dayFilter) return items
  return items.filter((momento) => getLocalIsoDate(momento.capturedAt) === dayFilter)
}

export function buildEntitiesById(entities: Entity[]): Map<string, Entity> {
  const map = new Map<string, Entity>()
  for (const entity of entities) map.set(entity.id, entity)
  return map
}

export function shouldUseAlbumView({
  viewMode,
  filterKind,
}: {
  viewMode: 'timeline' | 'album'
  filterKind: MomentoKind | null
}): boolean {
  return viewMode === 'album' && (filterKind === 'foto' || filterKind === null)
}

/**
 * Filtro de contenido de la barra de Momentos. Extiende los kinds reales con
 * 'all' (sin filtro) y 'video' — que no es un kind sino un item dentro de
 * kind='foto'. La query solo entiende kinds reales, así que 'video' consulta
 * fotos y se refina client-side con `momentoHasVideo`.
 */
export type ContentFilter = 'all' | MomentoKind | 'video'

/** Traduce el filtro de contenido al kind real que entiende la query. */
export function contentFilterToKind(filter: ContentFilter): MomentoKind | null {
  if (filter === 'all') return null
  if (filter === 'video') return 'foto'
  return filter
}

/** ¿El momento trae al menos un clip de video? (items[].type === 'video'). */
export function momentoHasVideo(momento: Momento): boolean {
  return momento.payload.items?.some((item) => item.type === 'video') ?? false
}

export function formatDayLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return iso
  }
  const date = new Date(year, month - 1, day)
  const raw = date.toLocaleDateString('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

function getLocalIsoDate(value: string): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
