import { useMemo, useState } from 'react'
import type { Entity, Quote } from '../../types'

/**
 * FF3 — hook con state + derivaciones memoizadas para la barra de filtros
 * de Citas. Extraído de `QuotesView.tsx` (era ~80 LOC inline mezclado con
 * el resto).
 *
 * Maneja dos filtros que se acumulan (AND):
 *   - `typeFilter`: filtra por tipo de la entidad atribuida (null = todos)
 *   - `favoritesOnly`: solo citas con `pinnedAt`
 *
 * Devuelve también las derivaciones que la UI necesita para pintar los
 * chips: `availableTypes` (presentes en las citas cargadas, ordenadas por
 * count desc) y `pinnedCount`.
 *
 * Filtra sobre las páginas YA cargadas — mismo patrón que EntitiesView,
 * coherente con la paginación cursor. Si más adelante se quiere filtro
 * server-side, este hook se reemplaza sin tocar UI.
 */
export function useQuotesFilters(opts: {
  allLoadedQuotes: Quote[]
  entities: Entity[]
}) {
  const { allLoadedQuotes, entities } = opts

  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [favoritesOnly, setFavoritesOnly] = useState(false)

  // Mapa entityId → type, para evitar O(n×m) cuando hay muchas citas y
  // entidades.
  const entityTypeById = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of entities) map.set(e.id, e.type)
    return map
  }, [entities])

  // Conteos por tipo en las citas cargadas — alimenta los chips.
  const availableTypes = useMemo(() => {
    const counts = new Map<string, number>()
    for (const q of allLoadedQuotes) {
      const t = entityTypeById.get(q.entityId)
      if (t) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
  }, [allLoadedQuotes, entityTypeById])

  // ω-E: pinnedCount para mostrar el contador en el chip "favoritas".
  const pinnedCount = useMemo(
    () => allLoadedQuotes.filter((q) => q.pinnedAt).length,
    [allLoadedQuotes],
  )

  // Aplicación final de los filtros — el array que la UI itera.
  const quotes = useMemo(() => {
    let arr = allLoadedQuotes
    if (favoritesOnly) arr = arr.filter((q) => q.pinnedAt)
    if (typeFilter)
      arr = arr.filter((q) => entityTypeById.get(q.entityId) === typeFilter)
    return arr
  }, [allLoadedQuotes, typeFilter, favoritesOnly, entityTypeById])

  return {
    // state setters
    typeFilter,
    setTypeFilter,
    favoritesOnly,
    setFavoritesOnly,
    // derived
    entityTypeById,
    availableTypes,
    pinnedCount,
    quotes,
  }
}
