import type { Dispatch, SetStateAction, CSSProperties } from 'react'
import { ENTITY_TYPES } from '../../types'
import { typeAccent } from '../graph/GraphNode'

/**
 * FF3 — barra de chips de filtro para Citas. Extraída de `QuotesView.tsx`
 * para que la vista quede más concentrada en orquestación.
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
    <div className="pb-2 mb-4 border-b border-ink-100/60 flex flex-wrap gap-1.5">
      {/* ω-E: chip "favoritas" — solo aparece cuando hay al menos una
          pinneada. Cuando se activa, el filtro de tipo no se toca (se
          acumulan: solo favoritas Y de un cierto tipo si está seleccionado). */}
      {pinnedCount > 0 && (
        <button
          onClick={() => setFavoritesOnly((v) => !v)}
          className={
            favoritesOnly
              ? 'px-2.5 py-1 rounded-full text-xs font-medium transition-colors inline-flex items-center gap-1'
              : 'px-2.5 py-1 rounded-full text-xs text-ink-500 hover:text-ink-800 hover:bg-ink-100 transition-colors inline-flex items-center gap-1'
          }
          style={
            favoritesOnly
              ? {
                  backgroundColor: 'var(--accent-gold-soft)',
                  color: 'var(--accent-gold)',
                }
              : undefined
          }
          aria-pressed={favoritesOnly}
          title={
            favoritesOnly
              ? 'Mostrando solo favoritas — click para mostrar todas'
              : 'Mostrar solo favoritas'
          }
        >
          <span aria-hidden>★</span>
          favoritas
          <span className="ml-0.5 text-micro tabular-nums opacity-70">{pinnedCount}</span>
        </button>
      )}
      <button
        onClick={() => setTypeFilter(null)}
        className={
          typeFilter === null
            ? 'px-2.5 py-1 rounded-full text-xs font-medium transition-colors'
            : 'px-2.5 py-1 rounded-full text-xs text-ink-500 hover:text-ink-800 hover:bg-ink-100 transition-colors'
        }
        style={
          typeFilter === null
            ? {
                backgroundColor: 'var(--accent-primary-soft)',
                color: 'var(--accent-primary)',
              }
            : undefined
        }
      >
        Todas
        <span className="ml-1.5 text-micro tabular-nums opacity-70">{totalCount}</span>
      </button>
      {availableTypes.map(({ type, count }) => {
        const active = typeFilter === type
        const label = ENTITY_TYPES.find((t) => t.value === type)?.label ?? type
        // λ3: typeAccent devuelve `var(--type-X)`; usamos color-mix para
        // producir el wash de fondo sin tener que mantener un mapeo paralelo
        // de softs.
        const accentColor = typeAccent(type)
        const activeStyle: CSSProperties | undefined = active
          ? {
              backgroundColor: `color-mix(in srgb, ${accentColor} 13%, transparent)`,
              color: accentColor,
            }
          : undefined
        return (
          <button
            key={type}
            onClick={() => setTypeFilter(active ? null : type)}
            className={
              active
                ? 'px-2.5 py-1 rounded-full text-xs font-medium transition-colors'
                : 'px-2.5 py-1 rounded-full text-xs text-ink-500 hover:text-ink-800 hover:bg-ink-100 transition-colors'
            }
            style={activeStyle}
          >
            {label}
            <span className="ml-1.5 text-micro tabular-nums opacity-70">{count}</span>
          </button>
        )
      })}
    </div>
  )
}
