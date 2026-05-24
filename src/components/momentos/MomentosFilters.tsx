import type { MomentoKind } from '../../types'

/**
 * Barra de filtros + toggle de view para Momentos.
 *
 *   chips:    Todos · Notas · Recortes · Fotos
 *   toggle:   Línea / Álbum (solo visible cuando filterKind === 'foto')
 *
 * Stateless por diseño — el caller controla el state y reacciona a los
 * callbacks. Eso hace que el componente sea trivial de testear y reutilizar.
 */
export function MomentosFilters({
  filterKind,
  onChangeFilterKind,
  viewMode,
  onChangeViewMode,
}: {
  filterKind: MomentoKind | null
  onChangeFilterKind: (k: MomentoKind | null) => void
  viewMode: 'timeline' | 'album'
  onChangeViewMode: (v: 'timeline' | 'album') => void
}) {
  return (
    <div className="mb-6 flex items-center gap-3 flex-wrap">
      <div className="flex gap-1.5">
        <FilterChip
          label="Todos"
          active={filterKind === null}
          onClick={() => onChangeFilterKind(null)}
        />
        <FilterChip
          label="Notas"
          active={filterKind === 'nota'}
          onClick={() => {
            onChangeFilterKind('nota')
            onChangeViewMode('timeline')
          }}
        />
        <FilterChip
          label="Recortes"
          active={filterKind === 'recorte'}
          onClick={() => {
            onChangeFilterKind('recorte')
            onChangeViewMode('timeline')
          }}
        />
        <FilterChip
          label="Fotos"
          active={filterKind === 'foto'}
          onClick={() => onChangeFilterKind('foto')}
        />
      </div>
      {filterKind === 'foto' && (
        <div className="ml-auto flex gap-1 p-0.5 bg-paper-100/60 rounded-md border border-ink-100/50">
          <button
            onClick={() => onChangeViewMode('timeline')}
            className={`px-2.5 py-1 rounded text-caption transition-colors ${
              viewMode === 'timeline'
                ? 'bg-paper-50 text-ink-700 shadow-sm'
                : 'text-ink-400 hover:text-ink-700'
            }`}
          >
            Línea
          </button>
          <button
            onClick={() => onChangeViewMode('album')}
            className={`px-2.5 py-1 rounded text-caption transition-colors ${
              viewMode === 'album'
                ? 'bg-paper-50 text-ink-700 shadow-sm'
                : 'text-ink-400 hover:text-ink-700'
            }`}
          >
            Álbum
          </button>
        </div>
      )}
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-full text-xs transition-colors"
      style={
        active
          ? {
              backgroundColor: 'var(--accent-gold-soft)',
              color: 'var(--accent-gold)',
              fontWeight: 500,
            }
          : { color: 'rgb(var(--ink-500))' }
      }
    >
      {label}
    </button>
  )
}
