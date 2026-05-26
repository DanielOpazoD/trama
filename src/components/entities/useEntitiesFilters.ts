import { useMemo, useState } from 'react'
import type { Entity } from '../../types'

/**
 * G2 (FF3-b) — hook con state + derivaciones memoizadas para la barra de
 * filtros de Entidades. Extraído de `EntitiesView.tsx` para que la vista
 * quede más concentrada en orquestación, espejando lo que se hizo con
 * Citas en FF3-a (`useQuotesFilters`).
 *
 * Maneja un solo filtro (más simple que Citas, que también tiene
 * favoritas):
 *   - `typeFilter`: filtra por tipo de entidad (null = todos)
 *
 * Devuelve también las derivaciones que la UI necesita para pintar los
 * chips: `availableTypes` (presentes en las entidades cargadas,
 * ordenadas por count desc).
 *
 * Filtra sobre las páginas YA cargadas — mismo patrón que QuotesView,
 * coherente con la paginación cursor. Si más adelante se quiere filtro
 * server-side, este hook se reemplaza sin tocar UI.
 */
export function useEntitiesFilters(opts: { allLoadedEntities: Entity[] }) {
  const { allLoadedEntities } = opts

  const [typeFilter, setTypeFilter] = useState<string | null>(null)

  // Conteos por tipo en las entidades cargadas — alimenta los chips.
  const availableTypes = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of allLoadedEntities) {
      counts.set(e.type, (counts.get(e.type) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
  }, [allLoadedEntities])

  // Aplicación final del filtro — el array que la UI itera.
  const entities = useMemo(
    () =>
      typeFilter
        ? allLoadedEntities.filter((e) => e.type === typeFilter)
        : allLoadedEntities,
    [allLoadedEntities, typeFilter],
  )

  return {
    // state setters
    typeFilter,
    setTypeFilter,
    // derived
    availableTypes,
    entities,
  }
}
