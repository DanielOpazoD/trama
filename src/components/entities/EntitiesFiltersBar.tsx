import type { Dispatch, SetStateAction, CSSProperties } from 'react'
import { ENTITY_TYPES } from '../../types'
import { typeAccent } from '../graph/GraphNode'

/**
 * G2 (FF3-b) — barra de chips de filtro para Entidades. Extraída de
 * `EntitiesView.tsx` para que la vista quede más concentrada en
 * orquestación, espejando lo que se hizo con Citas en FF3-a
 * (`QuotesFiltersBar`).
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
  // chips sean ruido visual. (En Citas el guard también considera
  // pinnedCount; acá no aplica.)
  if (availableTypes.length <= 1) return null

  return (
    // Filtro por tipo. Antes era sticky (β2/δ8/anterior commit), pero
    // quedaba siempre en pantalla durante el scroll y se sentía como
    // chrome que no se va. El usuario lo pidió no-sticky: una vez
    // elegido el filtro la barra desaparece al scrollear, como
    // cualquier sección normal.
    <div className="py-2 mb-4 border-b border-ink-100/60 flex flex-wrap gap-1.5">
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
        Todos
        <span className="ml-1.5 text-micro tabular-nums opacity-70">
          {totalCount}
        </span>
      </button>
      {availableTypes.map(({ type, count }) => {
        const active = typeFilter === type
        const label = ENTITY_TYPES.find((t) => t.value === type)?.label ?? type
        // λ3: typeAccent devuelve `var(--type-X)`. Para producir un wash
        // con alfa controlada usamos color-mix con transparent — los
        // browsers modernos lo soportan (>= 90% en caniuse). Si fallara
        // por agente raro, la chip activa cae a color sólido sin
        // background (sigue legible).
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
            <span className="ml-1.5 text-micro tabular-nums opacity-70">
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
