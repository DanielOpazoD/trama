import type { Dispatch, SetStateAction } from 'react'
import { ENTITY_TYPES } from '../../types'
import { typeAccent } from '../graph/GraphNode'
import { FilterChip } from '../FilterChip'

/**
 * FF3 — barra de chips de filtro para Citas. Extraída de `QuotesView.tsx`
 * para que la vista quede más concentrada en orquestación. Usa el
 * `FilterChip` compartido con Entidades.
 *
 * Dos filtros que se acumulan (AND):
 *   - "favoritas" — solo si hay al menos una pinneada
 *   - chip "Todas" + chip por tipo presente en las citas cargadas
 *
 * El state lo maneja `useQuotesFilters`. Acá solo recibimos lectores y
 * setters — el componente es presentacional.
 */
export function QuotesFiltersBar({
  availableTypes,
  totalCount,
  pinnedCount,
  typeFilter,
  setTypeFilter,
  favoritesOnly,
  setFavoritesOnly,
}: {
  availableTypes: Array<{ type: string; count: number }>
  totalCount: number
  pinnedCount: number
  typeFilter: string | null
  setTypeFilter: Dispatch<SetStateAction<string | null>>
  favoritesOnly: boolean
  setFavoritesOnly: Dispatch<SetStateAction<boolean>>
}) {
  // No mostrar la barra si no hay variedad — un solo tipo y sin favoritos
  // hace que los chips sean ruido visual.
  if (availableTypes.length <= 1 && pinnedCount === 0) return null

  return (
    <div className="pb-2 mb-4 flex flex-wrap gap-1.5 border-b border-ink-100/60">
      {/* ω-E: chip "favoritas" — solo aparece cuando hay al menos una
          pinneada. Se acumula (AND) con el filtro de tipo. */}
      {pinnedCount > 0 && (
        <FilterChip
          active={favoritesOnly}
          onClick={() => setFavoritesOnly((v) => !v)}
          label="favoritas"
          count={pinnedCount}
          icon={<span aria-hidden>★</span>}
          ariaPressed={favoritesOnly}
          title={
            favoritesOnly
              ? 'Mostrando solo favoritas — click para mostrar todas'
              : 'Mostrar solo favoritas'
          }
          activeStyle={{
            backgroundColor: 'var(--accent-gold-soft)',
            color: 'var(--accent-gold)',
          }}
        />
      )}
      <FilterChip
        active={typeFilter === null}
        onClick={() => setTypeFilter(null)}
        label="Todas"
        count={totalCount}
        activeStyle={{
          backgroundColor: 'var(--accent-primary-soft)',
          color: 'var(--accent-primary)',
        }}
      />
      {availableTypes.map(({ type, count }) => {
        const active = typeFilter === type
        const label = ENTITY_TYPES.find((t) => t.value === type)?.label ?? type
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
