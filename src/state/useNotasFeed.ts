/**
 * Seam del feed unificado de capturas (PR-2 de la fusión Notas + Recortes).
 *
 * La sección "notas" del mundo Notas dejó de ser solo notas: ahora muestra
 * notas y recortes juntos, ordenados por fecha y filtrables. Para que la UI
 * NUNCA ramifique nota-vs-recorte ad hoc, todo pasa por esta costura:
 *
 *  - `CaptureItem` es la unión discriminada que la vista consume (nunca los
 *    tipos crudos `Note` / `Recorte` por separado).
 *  - `buildNotasFeed` es PURA (sin React) — mezcla, ordena y filtra; es la
 *    pieza testeable y la única que decide qué entra al feed.
 *  - `useNotasFeed` reúsa los hooks de query existentes (notas + recortes) y
 *    arma el feed con `buildNotasFeed`. No agrega endpoints nuevos.
 */
import { useMemo } from 'react'
import type { Note, Recorte } from '../api'
import { localDayKey } from '../components/notas/ActivityCalendar'
import { useNotesQuery } from './useNotes'
import { useRecortesQuery } from './useRecortes'

/**
 * Un ítem del feed unificado. Unión discriminada por `type`: la vista nunca
 * inspecciona campos crudos para adivinar de qué es cada tarjeta — pregunta
 * por `item.type` y obtiene la entidad ya tipada.
 */
export type CaptureItem =
  | { type: 'note'; id: string; createdAt: string; note: Note }
  | { type: 'recorte'; id: string; createdAt: string; recorte: Recorte }

/** Segmento del control segmentado: todo / solo notas / solo recortes. */
export type NotasFeedSegment = 'todo' | 'escritas' | 'capturas'

export type NotasFeedFilter = {
  segment: NotasFeedSegment
  /** Texto libre, case-insensitive, sobre el contenido de cada ítem. */
  query?: string
  /** Etiqueta exacta (chips de tags). */
  tag?: string
  /**
   * Día seleccionado en el calendario de actividad (`localDayKey`, 'YYYY-MM-DD').
   * Si está presente, solo entran los ítems cuyo `createdAt` cae ese día local.
   * Aplica tanto a notas como a recortes (coherente en un feed mixto).
   */
  day?: string | null
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
 * defensiva (si una fase futura lo agrega, el filtro empieza a funcionar sin
 * tocar esta costura).
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
 * etiqueta). Pura y exportada para testearse sin React.
 */
export function buildNotasFeed(
  notes: Note[],
  recortes: Recorte[],
  filter: NotasFeedFilter,
): CaptureItem[] {
  const q = filter.query?.trim().toLowerCase() ?? ''
  const tag = filter.tag ?? null
  const day = filter.day ?? null

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

/**
 * Hook del feed unificado. Consume los hooks de query EXISTENTES (notas +
 * recortes) y devuelve el feed ya mezclado/filtrado. La vista depende solo de
 * esta costura, nunca de los dos hooks crudos por separado.
 */
export function useNotasFeed(filter: NotasFeedFilter): {
  items: CaptureItem[]
  isLoading: boolean
  isError: boolean
} {
  const notesQuery = useNotesQuery()
  const recortesQuery = useRecortesQuery()

  const notes = useMemo(() => notesQuery.data ?? [], [notesQuery.data])
  const recortes = useMemo(() => recortesQuery.data ?? [], [recortesQuery.data])

  const items = useMemo(
    () => buildNotasFeed(notes, recortes, filter),
    [notes, recortes, filter],
  )

  return {
    items,
    isLoading: notesQuery.isLoading || recortesQuery.isLoading,
    isError: notesQuery.isError || recortesQuery.isError,
  }
}
