import type { CaptureItem, Note, Recorte } from '../../api'
import { localDayKey } from './ActivityCalendar'

export type FeedViewMode = 'list' | 'galeria'
export type NotasFeedSegment = 'todo' | 'escritas' | 'capturas' | 'favoritos'
export type RecorteStatusFilter = 'all' | 'pending' | 'promoted' | 'archived'
export type RecorteThumbSize = 'pequena' | 'mediana' | 'grande'

export type NotasFeedFilter = {
  segment: NotasFeedSegment
  query?: string
  tag?: string
  day?: string | null
  recorteStatus?: RecorteStatusFilter | null
}

export const NOTAS_FEED_SEGMENTS: Array<{ value: NotasFeedSegment; label: string }> = [
  { value: 'todo', label: 'Todo' },
  { value: 'escritas', label: 'Escritas' },
  { value: 'capturas', label: 'Capturas' },
  { value: 'favoritos', label: 'Favoritos' },
]

export const RECORTE_THUMB_SIZE_OPTIONS: Array<{
  value: RecorteThumbSize
  label: string
}> = [
  { value: 'pequena', label: 'Pequeña' },
  { value: 'mediana', label: 'Mediana' },
  { value: 'grande', label: 'Grande' },
]

export const CAPTURA_STATUS_OPTIONS: Array<{
  value: RecorteStatusFilter
  label: string
}> = [
  { value: 'all', label: 'Todas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'promoted', label: 'Curadas' },
  { value: 'archived', label: 'Archivadas' },
]

const STAGGER_CAP = 6
const STAGGER_STEP_MS = 45

export function initialSegmentFromSearch(search: string): NotasFeedSegment {
  const raw = new URLSearchParams(search).get('segment')
  return NOTAS_FEED_SEGMENTS.some((s) => s.value === raw)
    ? (raw as NotasFeedSegment)
    : 'todo'
}

export function getInitialNotasFeedSegment(): NotasFeedSegment {
  if (typeof window === 'undefined') return 'todo'
  return initialSegmentFromSearch(window.location.search)
}

export function segmentHasTags(segment: NotasFeedSegment): boolean {
  return segment === 'todo' || segment === 'escritas'
}

export function buildNotasFeedFilter({
  segment,
  search,
  activeTag,
  selectedDay,
  capturaStatus,
}: {
  segment: NotasFeedSegment
  search: string
  activeTag: string | null
  selectedDay: string | null
  capturaStatus: RecorteStatusFilter
}): NotasFeedFilter {
  return {
    segment,
    query: search.trim() || undefined,
    tag: activeTag ?? undefined,
    day: selectedDay,
    recorteStatus: segment === 'capturas' ? capturaStatus : null,
  }
}

export function selectedRecortesFromItems(
  items: CaptureItem[],
  selectedIds: ReadonlySet<string>,
): Recorte[] {
  return items
    .filter((item) => item.type === 'recorte' && selectedIds.has(item.id))
    .map((item) => (item as Extract<CaptureItem, { type: 'recorte' }>).recorte)
}

export function buildNotasFeedVirtualItemMeta({
  item,
  index,
  reducedMotion,
}: {
  item: CaptureItem
  index: number
  reducedMotion: boolean
}): { key: string; delay: string | undefined } {
  return {
    key: item.type === 'note' ? `note-${item.id}` : `recorte-${item.id}`,
    delay:
      reducedMotion || index >= STAGGER_CAP ? undefined : `${index * STAGGER_STEP_MS}ms`,
  }
}

export function buildCalendarStats(notes: Note[]): {
  calendarDays: string[]
  calendarStats: Array<{ n: number; label: string }>
} {
  const calendarDays = notes.map((n) => localDayKey(n.createdAt))
  const days = new Set(calendarDays).size
  const tagSet = new Set<string>()
  for (const n of notes) for (const tag of n.tags) tagSet.add(tag)
  return {
    calendarDays,
    calendarStats: [
      { n: notes.length, label: notes.length === 1 ? 'nota' : 'notas' },
      { n: days, label: days === 1 ? 'día con notas' : 'días con notas' },
      { n: tagSet.size, label: tagSet.size === 1 ? 'etiqueta' : 'etiquetas' },
    ],
  }
}

export function buildTagCounts(
  notes: Note[],
  {
    segment,
    search,
  }: {
    segment: NotasFeedSegment
    search: string
  },
): Array<[string, number]> {
  if (!segmentHasTags(segment)) return []
  const q = search.trim().toLowerCase()
  const counts = new Map<string, number>()
  for (const note of notes) {
    if (q && !`${note.content}\n${note.title ?? ''}`.toLowerCase().includes(q)) {
      continue
    }
    for (const tag of note.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

export function buildAllNoteTags(notes: Note[]): string[] {
  const tags = new Set<string>()
  for (const note of notes) for (const tag of note.tags) tags.add(tag)
  return [...tags].sort((a, b) => a.localeCompare(b))
}

export function hasNotasFeedContentFilter({
  search,
  activeTag,
  selectedDay,
}: {
  search: string
  activeTag: string | null
  selectedDay: string | null
}): boolean {
  return search.trim() !== '' || activeTag !== null || selectedDay !== null
}

export function isNotasFeedEverythingEmpty({
  isLoading,
  hasContentFilter,
  itemCount,
  hasNextPage,
  segment,
  capturaStatus,
}: {
  isLoading: boolean
  hasContentFilter: boolean
  itemCount: number
  hasNextPage: boolean
  segment: NotasFeedSegment
  capturaStatus: RecorteStatusFilter
}): boolean {
  return (
    !isLoading &&
    !hasContentFilter &&
    itemCount === 0 &&
    !hasNextPage &&
    (segment !== 'capturas' || capturaStatus === 'all')
  )
}

export function isNotasFeedGalleryMode({
  feedView,
  segment,
}: {
  feedView: FeedViewMode
  segment: NotasFeedSegment
}): boolean {
  return feedView === 'galeria' && (segment === 'todo' || segment === 'capturas')
}
