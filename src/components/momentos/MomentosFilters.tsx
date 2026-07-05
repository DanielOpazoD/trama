import type { CSSProperties } from 'react'
import { FilterChip } from '../FilterChip'
import type { ContentFilter } from './momentosViewModel'

/**
 * Barra de filtros + toggle de vista para Momentos.
 *
 *   chips:   Todos · Notas · Recortes · Fotos · Videos
 *   toggle:  Línea / Álbum (Álbum disponible en Todos, Fotos y Videos)
 *
 * Compacta a propósito: una sola fila, sin tarjeta ni rótulos —los chips y el
 * segmentado se explican solos, y así las fotos ganan el protagonismo del alto.
 * Usa el FilterChip COMPARTIDO del mundo Trama (mismo lenguaje que Entidades y
 * Citas), no una copia local con `text-xs`.
 *
 * Stateless por diseño — el caller controla el state y reacciona a los
 * callbacks. Eso hace que el componente sea trivial de testear y reutilizar.
 */
const GOLD_ACTIVE: CSSProperties = {
  backgroundColor: 'var(--accent-gold-soft)',
  color: 'var(--accent-gold)',
}

// Al elegir un tipo sin grilla (nota/recorte) volvemos a Línea; Videos salta al
// Álbum (una pared de clips); foto y 'all' conservan la vista actual.
const CONTENT_CHIPS: Array<{ value: ContentFilter; label: string; toTimeline: boolean }> =
  [
    { value: 'all', label: 'Todos', toTimeline: false },
    { value: 'nota', label: 'Notas', toTimeline: true },
    { value: 'recorte', label: 'Recortes', toTimeline: true },
    { value: 'foto', label: 'Fotos', toTimeline: false },
    { value: 'video', label: 'Videos', toTimeline: false },
  ]

export function MomentosFilters({
  contentFilter,
  onChangeContentFilter,
  viewMode,
  onChangeViewMode,
}: {
  contentFilter: ContentFilter
  onChangeContentFilter: (f: ContentFilter) => void
  viewMode: 'timeline' | 'album'
  onChangeViewMode: (v: 'timeline' | 'album') => void
}) {
  // Álbum tiene sentido cuando el resultado son fotos/clips en grilla.
  const canShowAlbum =
    contentFilter === 'all' || contentFilter === 'foto' || contentFilter === 'video'

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex flex-wrap items-center gap-1">
        {CONTENT_CHIPS.map((chip) => (
          <FilterChip
            key={chip.value}
            label={chip.label}
            active={contentFilter === chip.value}
            activeStyle={GOLD_ACTIVE}
            onClick={() => {
              onChangeContentFilter(chip.value)
              if (chip.toTimeline) onChangeViewMode('timeline')
              else if (chip.value === 'video') onChangeViewMode('album')
            }}
          />
        ))}
      </div>
      {/* AA-D: Álbum disponible también en Todos/Videos, no solo Fotos. En
          Todos filtra internamente a kind=foto; Videos suma el refinado por
          clip. Para nota/recorte un grid de tiles no aporta → deshabilitado. */}
      <div className="flex items-center gap-0.5 rounded-full border border-ink-100/70 bg-paper-100/50 p-0.5">
        <ViewChip
          label="Línea"
          active={viewMode === 'timeline'}
          onClick={() => onChangeViewMode('timeline')}
        />
        <ViewChip
          label="Álbum"
          active={viewMode === 'album'}
          disabled={!canShowAlbum}
          title={
            canShowAlbum
              ? contentFilter === 'all'
                ? 'Álbum muestra solo las fotos en grid'
                : 'Mostrar en grid'
              : 'Álbum disponible para Todos, Fotos o Videos'
          }
          onClick={() => onChangeViewMode('album')}
        />
      </div>
    </div>
  )
}

function ViewChip({
  label,
  active,
  disabled = false,
  title,
  onClick,
}: {
  label: string
  active: boolean
  disabled?: boolean
  title?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-caption transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-paper-100 text-ink-700 shadow-sm' : 'text-ink-400 hover:text-ink-700'
      }`}
    >
      {label}
    </button>
  )
}
