import type { Dispatch, SetStateAction } from 'react'
import { ENTITY_TYPES } from '../../types'
import { typeAccent } from '../graph/GraphNode'
import { FilterChip } from '../FilterChip'

/**
 * G2 (FF3-b) — barra de chips de filtro para Entidades. Extraída de
 * `EntitiesView.tsx` para que la vista quede más concentrada en
 * orquestación, espejando lo que se hizo con Citas en FF3-a
 * (`QuotesFiltersBar`). Ambas usan el `FilterChip` compartido.
 *
 * Un solo filtro (más simple que Citas, que también tiene favoritas):
 *   - chip "Todos" + chip por tipo presente en las entidades cargadas
 *
 * El state lo maneja `useEntitiesFilters`. Acá solo recibimos lectores
 * y setter — el componente es presentacional.
 */
export function EntitiesFiltersBar({
  availableTypes,
  totalCount,
  typeFilter,
  setTypeFilter,
}: {
  availableTypes: Array<{ type: string; count: number }>
  totalCount: number
  typeFilter: string | null
  setTypeFilter: Dispatch<SetStateAction<string | null>>
}) {
  // No mostrar la barra si no hay variedad — un solo tipo hace que los
  // chips sean ruido visual.
  if (availableTypes.length <= 1) return null

  return (
    // Filtro por tipo, no-sticky: una vez elegido, la barra se va con el
    // scroll como cualquier sección normal.
    <div className="py-2 mb-4 flex flex-wrap gap-1.5 border-b border-ink-100/60">
      <FilterChip
        active={typeFilter === null}
        onClick={() => setTypeFilter(null)}
        label="Todos"
        count={totalCount}
        activeStyle={{
          backgroundColor: 'var(--accent-primary-soft)',
          color: 'var(--accent-primary)',
        }}
      />
      {availableTypes.map(({ type, count }) => {
        const active = typeFilter === type
        const label = ENTITY_TYPES.find((t) => t.value === type)?.label ?? type
        // λ3: typeAccent devuelve `var(--type-X)`; color-mix produce el wash
        // de fondo con alfa controlada sin mantener un mapeo paralelo de softs.
        const accentColor = typeAccent(type)
        return (
          <FilterChip
            key={type}
            active={active}
            onClick={() => setTypeFilter(active ? null : type)}
            label={label}
            count={count}
            activeStyle={{
              backgroundColor: `color-mix(in srgb, ${accentColor} 13%, transparent)`,
              color: accentColor,
            }}
          />
        )
      })}
    </div>
  )
}
