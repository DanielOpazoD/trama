/**
 * Seam del feed unificado de capturas (Notas + Recortes).
 *
 * La sección "notas" del mundo Notas muestra notas y recortes juntos,
 * ordenados por fecha y filtrables. Para que la UI NUNCA ramifique
 * nota-vs-recorte ad hoc, todo pasa por esta costura:
 *
 *  - `CaptureItem` (re-exportado de `src/api/notasFeed`) es la unión
 *    discriminada que la vista consume (nunca los tipos crudos `Note`/`Recorte`
 *    por separado).
 *  - El feed se calcula, filtra, ordena y pagina SERVER-SIDE (read-model
 *    `objects` + keyset) vía `/api/notas-feed`. `useNotasFeed` envuelve ese
 *    endpoint con `useInfiniteQuery` y aplana las páginas en `items`.
 *  - `buildNotasFeed` (pura) se conserva como especificación testeable del
 *    orden + filtros del feed (el servidor replica su semántica). Ya no es la
 *    fuente del hook, pero documenta y verifica el contrato.
 */
import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { api, type Note, type Recorte, type CaptureItem } from '../api'
import { localDayKey } from '../components/notas/ActivityCalendar'
import { queryKeys } from './queryClient'

export type { CaptureItem }

/** Segmento del control segmentado: todo / solo notas / solo recortes / favoritos. */
export type NotasFeedSegment = 'todo' | 'escritas' | 'capturas' | 'favoritos'

/**
 * Filtro de estado para la triage de recortes (absorbe el triage que vivía en la
 * antigua RecortesView). Solo afecta a recortes; las notas son indiferentes.
 *  - `'all'` → incluye los tres estados (pendientes + curados + archivados).
 *  - `'pending'`/`'promoted'`/`'archived'` → solo ese estado.
 *  - `null`/`undefined` (default) → pendientes + curados, OCULTA archivados.
 */
export type RecorteStatusFilter = 'all' | 'pending' | 'promoted' | 'archived'

export type NotasFeedFilter = {
  segment: NotasFeedSegment
  /** Texto libre, case-insensitive, sobre el contenido de cada ítem. */
  query?: string
  /** Etiqueta exacta (chips de tags). */
  tag?: string
  /**
   * Día seleccionado en el calendario de actividad (`localDayKey`, 'YYYY-MM-DD').
   * Si está presente, solo entran los ítems cuyo `createdAt` cae ese día local.
   */
  day?: string | null
  /**
   * Estado de los recortes a incluir (triage). Si es null/undefined, el feed
   * oculta los archivados por defecto (muestra pendientes + curados).
   */
  recorteStatus?: RecorteStatusFilter | null
}

/** Texto buscable de una nota: contenido + título. */
function noteHaystack(n: Note): string {
  return `${n.content}\n${n.title ?? ''}`.toLowerCase()
}

/** Texto buscable de un recorte: texto + título + autor de la fuente. */
function recorteHaystack(r: Recorte): string {
  return `${r.text}\n${r.sourceTitle ?? ''}\n${r.sourceAuthor ?? ''}`.toLowerCase()
}

/**
 * Tags de un recorte. Hoy el tipo `Recorte` no expone un campo `tags`, así que
 * el filtro por etiqueta nunca matchea recortes — pero leemos el campo de forma
 * defensiva (si una fase futura lo agrega, el filtro empieza a funcionar).
 */
function recorteTags(r: Recorte): string[] {
  const maybe = (r as { tags?: unknown }).tags
  return Array.isArray(maybe)
    ? maybe.filter((t): t is string => typeof t === 'string')
    : []
}

/**
 * Construye el feed unificado: mezcla notas + recortes, ordena por `createdAt`
 * descendente (lo más nuevo primero) y aplica el filtro (segmento + texto +
 * etiqueta + día + triage). Pura y exportada como ESPECIFICACIÓN del orden y de
 * los filtros que el servidor replica — testeada sin React ni red.
 */
export function buildNotasFeed(
  notes: Note[],
  recortes: Recorte[],
  filter: NotasFeedFilter,
): CaptureItem[] {
  const q = filter.query?.trim().toLowerCase() ?? ''
  const tag = filter.tag ?? null
  const day = filter.day ?? null
  const recorteStatus = filter.recorteStatus ?? null

  const items: CaptureItem[] = []

  if (filter.segment === 'todo' || filter.segment === 'escritas') {
    for (const note of notes) {
      if (tag && !note.tags.includes(tag)) continue
      if (day && localDayKey(note.createdAt) !== day) continue
      if (q && !noteHaystack(note).includes(q)) continue
      items.push({ type: 'note', id: note.id, createdAt: note.createdAt, note })
    }
  }

  if (filter.segment === 'todo' || filter.segment === 'capturas') {
    for (const recorte of recortes) {
      if (recorteStatus === 'all') {
        // sin filtro de estado
      } else if (recorteStatus) {
        if (recorte.status !== recorteStatus) continue
      } else if (recorte.status === 'archived') {
        continue
      }
      if (tag && !recorteTags(recorte).includes(tag)) continue
      if (day && localDayKey(recorte.createdAt) !== day) continue
      if (q && !recorteHaystack(recorte).includes(q)) continue
      items.push({
        type: 'recorte',
        id: recorte.id,
        createdAt: recorte.createdAt,
        recorte,
      })
    }
  }

  // Orden estable por fecha desc; ante empate, las notas antes que los recortes
  // (criterio determinístico, no semántico — solo para que el orden no baile).
  items.sort((a, b) => {
    const byDate = b.createdAt.localeCompare(a.createdAt)
    if (byDate !== 0) return byDate
    if (a.type === b.type) return 0
    return a.type === 'note' ? -1 : 1
  })

  return items
}

/** Segmentos que el endpoint sirve (favoritos es su propio panel). */
function isServerSegment(
  segment: NotasFeedSegment,
): segment is 'todo' | 'escritas' | 'capturas' {
  return segment === 'todo' || segment === 'escritas' || segment === 'capturas'
}

/**
 * Bordes de un día LOCAL ('YYYY-MM-DD', como `localDayKey`) convertidos a
 * instantes UTC (ISO). Usa el constructor `Date` en hora local, así respeta la
 * zona real del navegador (incluido DST). El endpoint filtra `created_at` en
 * `[start, end)`, coincidiendo exacto con `localDayKey(createdAt) === day` —sin
 * que el servidor tenga que adivinar la zona.
 */
export function localDayToUtcRange(day: string): { start: string; end: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const start = new Date(y, mo - 1, d, 0, 0, 0, 0)
  const end = new Date(y, mo - 1, d + 1, 0, 0, 0, 0)
  return { start: start.toISOString(), end: end.toISOString() }
}

/** Clave estable de cache para una combinación de filtros. */
function feedCacheKey(filter: NotasFeedFilter): string {
  return JSON.stringify({
    segment: filter.segment,
    query: filter.query?.trim() || '',
    tag: filter.tag ?? '',
    day: filter.day ?? '',
    recorteStatus: filter.recorteStatus ?? '',
  })
}

export type UseNotasFeedResult = {
  items: CaptureItem[]
  isLoading: boolean
  isError: boolean
  fetchNextPage: () => void
  hasNextPage: boolean
  isFetchingNextPage: boolean
}

/**
 * Hook del feed unificado. Pagina el endpoint `/api/notas-feed` con
 * `useInfiniteQuery` y aplana las páginas en `items`. Favoritos no se sirve
 * acá (es otro panel): para ese segmento el hook queda inactivo y vacío.
 */
export function useNotasFeed(filter: NotasFeedFilter): UseNotasFeedResult {
  const serveable = isServerSegment(filter.segment)
  const segment: 'todo' | 'escritas' | 'capturas' = isServerSegment(filter.segment)
    ? filter.segment
    : 'todo'
  // El triage solo aplica en recortes; lo mandamos siempre que esté seteado.
  const status = filter.recorteStatus ?? undefined
  // El día se manda como bordes UTC del día local (zona real del navegador).
  const dayRange = filter.day ? localDayToUtcRange(filter.day) : null

  const query = useInfiniteQuery({
    queryKey: queryKeys.notasFeedFiltered(feedCacheKey(filter)),
    enabled: serveable,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.fetchNotasFeed({
        segment,
        status,
        tag: filter.tag ?? undefined,
        dayStart: dayRange?.start,
        dayEnd: dayRange?.end,
        q: filter.query?.trim() || undefined,
        cursor: pageParam as string | null,
        limit: 30,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  )

  return {
    items,
    isLoading: serveable ? query.isLoading : false,
    isError: query.isError,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  }
}
