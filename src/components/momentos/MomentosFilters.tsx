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
  const canShowAlbum = filterKind === 'foto' || filterKind === null

  return (
    <div className="flex w-full max-w-3xl flex-wrap items-end justify-between gap-x-8 gap-y-3 rounded-xl border border-ink-100/70 bg-paper-100/45 px-3 py-2">
      <div>
        <p className="mb-1 text-micro uppercase tracking-eyebrow text-ink-300">
          contenido
        </p>
        <div className="flex flex-wrap gap-1.5">
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
      </div>
      {/* AA-D: toggle Línea/Álbum disponible también cuando filterKind
          es null (pestaña "Todos"). En esa combinación, álbum filtra
          internamente a kind=foto — el usuario sigue viendo solo fotos
          en grid, pero sin tener que pasar primero por la pestaña Fotos.
          Para 'nota' y 'recorte' no tiene sentido un grid de tiles. */}
      <div>
        <p className="mb-1 text-micro uppercase tracking-eyebrow text-ink-300">vista</p>
        <div className="flex gap-1 rounded-md border border-ink-100/70 bg-paper-50/75 p-0.5">
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
                ? filterKind === null
                  ? 'Álbum muestra solo las fotos en grid'
                  : 'Mostrar fotos en grid'
                : 'Álbum disponible para Todos o Fotos'
            }
            onClick={() => onChangeViewMode('album')}
          />
        </div>
      </div>
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
      className={`rounded px-2.5 py-1 text-caption transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-paper-100 text-ink-700 shadow-sm' : 'text-ink-400 hover:text-ink-700'
      }`}
    >
      {label}
    </button>
  )
}
