import type { Entity } from '../../types'
import { Paginator } from '../Paginator'
import { EmptyMessage } from '../EmptyMessage'
import { ShareIcon } from '../Icons'
import { MomentosFilters } from './MomentosFilters'
import { SelectableMomento } from './SelectableMomento'
import { formatDateHeading, type groupByDay } from './helpers'
import { formatDayLabel, type ContentFilter } from './momentosViewModel'

type MomentoGroup = ReturnType<typeof groupByDay>[number]

export function MomentosDayFilterBanner({
  dayFilter,
  onClear,
}: {
  dayFilter: string
  onClear: () => void
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 px-4 py-2 bg-paper-100/50 border border-ink-100/60 rounded-lg">
      <span className="text-caption text-ink-500">
        Mostrando momentos del{' '}
        <span className="text-ink-700 font-medium tabular-nums">
          {formatDayLabel(dayFilter)}
        </span>
      </span>
      <button
        type="button"
        onClick={onClear}
        className="section-eyebrow hover:text-ink-700 transition-colors"
      >
        ver todos
      </button>
    </div>
  )
}

export function MomentosToolbar({
  contentFilter,
  viewMode,
  itemCount,
  selectionMode,
  onChangeContentFilter,
  onChangeViewMode,
  onShare,
  onToggleSelectionMode,
}: {
  contentFilter: ContentFilter
  viewMode: 'timeline' | 'album'
  itemCount: number
  selectionMode: boolean
  onChangeContentFilter: (next: ContentFilter) => void
  onChangeViewMode: (next: 'timeline' | 'album') => void
  onShare: () => void
  onToggleSelectionMode: () => void
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <MomentosFilters
        contentFilter={contentFilter}
        onChangeContentFilter={onChangeContentFilter}
        viewMode={viewMode}
        onChangeViewMode={onChangeViewMode}
      />
      {/* Acciones agrupadas a la derecha — compartir + seleccionar viven juntas
          para que la fila lea como "filtros … acciones", sin dispersar. */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="compartir momentos"
          onClick={onShare}
          className="inline-flex items-center gap-2 rounded-full border border-ink-100/70 bg-paper-50/80 px-3 py-1.5 text-caption uppercase tracking-eyebrow text-ink-400 shadow-sm transition-colors hover:text-ink-700"
        >
          <ShareIcon size={13} />
          compartir
        </button>
        {itemCount > 1 && viewMode === 'timeline' && (
          <button
            type="button"
            onClick={onToggleSelectionMode}
            className={`text-micro uppercase tracking-eyebrow transition-colors shrink-0 ${
              selectionMode ? 'text-ink-700' : 'text-ink-400 hover:text-ink-700'
            }`}
            aria-pressed={selectionMode}
          >
            {selectionMode ? 'salir selección' : 'seleccionar'}
          </button>
        )}
      </div>
    </div>
  )
}

const EMPTY_TITLES: Record<ContentFilter, string> = {
  all: 'Todavía no hay momentos.',
  nota: 'Ninguna nota todavía.',
  recorte: 'Ningún recorte todavía.',
  foto: 'Ninguna foto todavía.',
  video: 'Ningún video todavía.',
}

export function MomentosEmptyState({
  contentFilter,
  dayFilter,
  loadingMore,
  onShowAll,
}: {
  contentFilter: ContentFilter
  dayFilter: string | null
  /** El álbum/Videos todavía recoge páginas → aún no sabemos si está vacío. */
  loadingMore: boolean
  onShowAll: () => void
}) {
  // Vacío aparente durante el auto-load: en vez del mensaje "no hay…" (que
  // parpadearía en falso), un pie sereno hasta agotar las páginas.
  if (loadingMore) {
    return (
      <p className="mt-6 text-center text-caption font-serif italic text-ink-400">
        {contentFilter === 'video' ? 'buscando tus videos…' : 'recogiendo tus momentos…'}
      </p>
    )
  }
  if (contentFilter !== 'all' || dayFilter) {
    return (
      <EmptyMessage
        illustration="pair"
        title={dayFilter ? 'Ese día está vacío.' : EMPTY_TITLES[contentFilter]}
        body={
          dayFilter ? (
            <>No registraste nada ese día. Prueba con otro o limpia el filtro.</>
          ) : (
            <>
              Cambia el tipo en la barra de arriba o crea una entrada nueva de este tipo.
            </>
          )
        }
        hint={
          <button
            onClick={onShowAll}
            className="underline hover:text-ink-700 transition-colors"
          >
            Mostrar todos
          </button>
        }
      />
    )
  }

  return (
    <EmptyMessage
      illustration="thread"
      title="Todavía no hay momentos"
      body={
        <>
          Las entradas que crees aquí quedan en una línea de tiempo. Pega tweets, links,
          screenshots y fotos — o simplemente escribe una nota del día.
        </>
      }
    />
  )
}

export function MomentosTimeline({
  groups,
  entitiesById,
  selectionMode,
  selectedIds,
  hasNext,
  loadingNext,
  onToggleSelect,
  onDelete,
  onLoadMore,
}: {
  groups: MomentoGroup[]
  entitiesById: Map<string, Entity>
  selectionMode: boolean
  selectedIds: Set<string>
  hasNext: boolean
  loadingNext: boolean
  onToggleSelect: (id: string) => void
  onDelete: (id: string) => void
  onLoadMore: () => void
}) {
  const itemCount = groups.reduce((sum, group) => sum + group.entries.length, 0)

  return (
    <div className="space-y-6">
      {groups.map(({ dayKey, entries }) => (
        <section key={dayKey} className="animate-fade-up">
          <div className="mb-2.5 flex items-baseline gap-3">
            <h3 className="section-eyebrow-serif" style={{ color: 'var(--accent-gold)' }}>
              {formatDateHeading(entries[0]!.capturedAt)}
            </h3>
            <span className="flex-1 h-px bg-ink-100/40" />
            <span className="text-caption text-ink-300 tabular-nums">
              {entries.length} {entries.length === 1 ? 'entrada' : 'entradas'}
            </span>
          </div>
          <ul className="space-y-4">
            {entries.map((momento) => (
              <SelectableMomento
                key={momento.id}
                momento={momento}
                entitiesById={entitiesById}
                selectionMode={selectionMode}
                selected={selectedIds.has(momento.id)}
                onToggleSelect={() => onToggleSelect(momento.id)}
                onDelete={() => onDelete(momento.id)}
              />
            ))}
          </ul>
        </section>
      ))}

      <Paginator
        hasNext={hasNext}
        loading={loadingNext}
        onLoadMore={onLoadMore}
        showEndMark={itemCount >= 5}
      />
    </div>
  )
}
