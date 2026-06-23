import type { RefObject } from 'react'
import {
  CalendarIcon,
  CheckSquareIcon,
  GalleryIcon,
  ListIcon,
  SearchIcon,
  ThumbSizeIcon,
} from '../Icons'
import { CloseButton } from '../CloseButton'
import { IconButton } from '../IconButton'
import { OverflowMenu } from '../OverflowMenu'
import { ActivityCalendar } from './ActivityCalendar'
import {
  CAPTURA_STATUS_OPTIONS,
  NOTAS_FEED_SEGMENTS,
  RECORTE_THUMB_SIZE_OPTIONS,
  type FeedViewMode,
  type NotasFeedSegment,
  type RecorteStatusFilter,
  type RecorteThumbSize,
} from './notasFeedViewModel'

export function NotasFeedControls({
  accent,
  segment,
  search,
  searchOpen,
  searchInputRef,
  activeTag,
  tagCounts,
  calendarOpen,
  calendarDays,
  calendarStats,
  selectedDay,
  capturaStatus,
  recorteThumb,
  feedView,
  itemCount,
  galleryMode,
  selectionMode,
  onSegmentChange,
  onOpenSearch,
  onCloseSearch,
  onSearchChange,
  onActiveTagChange,
  onToggleCalendar,
  onSelectDay,
  onCapturaStatusChange,
  onRecorteThumbChange,
  onFeedViewChange,
  onToggleSelection,
}: {
  accent: string
  segment: NotasFeedSegment
  search: string
  searchOpen: boolean
  searchInputRef: RefObject<HTMLInputElement>
  activeTag: string | null
  tagCounts: Array<[string, number]>
  calendarOpen: boolean
  calendarDays: string[]
  calendarStats: Array<{ n: number; label: string }>
  selectedDay: string | null
  capturaStatus: RecorteStatusFilter
  recorteThumb: RecorteThumbSize
  feedView: FeedViewMode
  itemCount: number
  galleryMode: boolean
  selectionMode: boolean
  onSegmentChange: (next: NotasFeedSegment) => void
  onOpenSearch: () => void
  onCloseSearch: () => void
  onSearchChange: (next: string) => void
  onActiveTagChange: (next: string | null) => void
  onToggleCalendar: () => void
  onSelectDay: (next: string | null) => void
  onCapturaStatusChange: (next: RecorteStatusFilter) => void
  onRecorteThumbChange: (next: RecorteThumbSize) => void
  onFeedViewChange: (next: FeedViewMode) => void
  onToggleSelection: () => void
}) {
  const showTags = segment === 'todo' || segment === 'escritas'
  const hasCapturesInScope = segment === 'todo' || segment === 'capturas'

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Filtrar el feed"
          className="inline-flex rounded-lg border border-ink-100/70 bg-paper-50 p-0.5"
        >
          {NOTAS_FEED_SEGMENTS.map(({ value, label }) => {
            const on = segment === value
            return (
              <button
                key={value}
                role="tab"
                aria-selected={on}
                onClick={() => onSegmentChange(value)}
                className={`rounded-md px-3 py-1 text-xs transition-colors ${
                  on
                    ? 'bg-ink-800 text-paper-50'
                    : 'text-ink-400 hover:text-ink-700 hover:bg-ink-100/60'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        {segment !== 'favoritos' && (
          <div className="flex items-center gap-1">
            <IconButton
              onClick={() => (searchOpen ? onCloseSearch() : onOpenSearch())}
              label="Buscar en notas y capturas"
              aria-expanded={searchOpen}
              title="Buscar"
              className={`touch-target rounded-md p-1.5 transition-colors ${
                searchOpen || search
                  ? 'bg-ink-100/70 text-ink-700'
                  : 'text-ink-300 hover:bg-ink-100/60 hover:text-ink-700'
              }`}
            >
              <SearchIcon size={14} />
            </IconButton>
            <IconButton
              onClick={onToggleCalendar}
              label={
                calendarOpen
                  ? 'Ocultar calendario de actividad'
                  : 'Mostrar calendario de actividad'
              }
              aria-pressed={calendarOpen}
              title="Calendario de actividad"
              className={`touch-target rounded-md p-1.5 transition-colors ${
                calendarOpen || selectedDay
                  ? 'bg-ink-100/70 text-ink-700'
                  : 'text-ink-300 hover:bg-ink-100/60 hover:text-ink-700'
              }`}
            >
              <CalendarIcon size={14} />
            </IconButton>
            {hasCapturesInScope && (
              <OverflowMenu
                label="Tamaño de las miniaturas"
                width="w-40"
                triggerContent={<ThumbSizeIcon size={14} />}
                triggerClassName={`touch-target rounded-md p-1.5 transition-colors ${
                  recorteThumb !== 'mediana'
                    ? 'bg-ink-100/70 text-ink-700'
                    : 'text-ink-300 hover:bg-ink-100/60 hover:text-ink-700'
                }`}
              >
                {(close) => (
                  <div role="group" aria-label="Tamaño de las miniaturas">
                    <p className="px-2.5 pb-1 pt-0.5 text-micro uppercase tracking-eyebrow text-ink-300">
                      Miniaturas
                    </p>
                    {RECORTE_THUMB_SIZE_OPTIONS.map(({ value, label }) => (
                      <button
                        key={value}
                        role="menuitemradio"
                        aria-checked={recorteThumb === value}
                        onClick={() => {
                          onRecorteThumbChange(value)
                          close()
                        }}
                        className={`w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                          recorteThumb === value
                            ? 'bg-ink-100/70 text-ink-800'
                            : 'text-ink-600 hover:bg-ink-100/60 hover:text-ink-800'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </OverflowMenu>
            )}
            {hasCapturesInScope && (
              <button
                type="button"
                onClick={() =>
                  onFeedViewChange(feedView === 'galeria' ? 'list' : 'galeria')
                }
                aria-pressed={feedView === 'galeria'}
                aria-label={
                  feedView === 'galeria' ? 'Ver como lista' : 'Ver como galería'
                }
                title={feedView === 'galeria' ? 'Ver como lista' : 'Ver como galería'}
                className={`touch-target rounded-md p-1.5 transition-colors ${
                  feedView === 'galeria'
                    ? 'bg-ink-100/70 text-ink-700'
                    : 'text-ink-300 hover:bg-ink-100/60 hover:text-ink-700'
                }`}
              >
                {feedView === 'galeria' ? (
                  <ListIcon size={14} />
                ) : (
                  <GalleryIcon size={14} />
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {segment !== 'favoritos' && searchOpen && (
        <div className="mb-4 animate-fade-up space-y-2.5">
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-paper-50 border border-ink-100/60 rounded-md">
            <SearchIcon size={12} className="text-ink-300 shrink-0" />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') onCloseSearch()
              }}
              placeholder="Buscar en notas y capturas…"
              aria-label="Buscar en notas y capturas"
              className="flex-1 bg-transparent text-caption text-ink-700 placeholder:text-ink-300"
            />
            <CloseButton
              onClick={onCloseSearch}
              label="Cerrar búsqueda"
              size={12}
              className="text-ink-300 hover:text-ink-700 transition-colors"
            />
          </div>
          {showTags && tagCounts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => onActiveTagChange(null)}
                className={`text-micro uppercase tracking-eyebrow px-2 py-0.5 rounded-full border transition-colors ${
                  activeTag === null
                    ? 'border-ink-200 text-ink-700 bg-ink-100/50'
                    : 'border-ink-100 text-ink-400 hover:text-ink-700'
                }`}
              >
                todas
              </button>
              {tagCounts.map(([tag, count]) => {
                const on = activeTag === tag
                return (
                  <button
                    key={tag}
                    onClick={() => onActiveTagChange(on ? null : tag)}
                    className="text-micro uppercase tracking-eyebrow px-2 py-0.5 rounded-full border transition-colors"
                    style={
                      on
                        ? {
                            borderColor: accent,
                            color: accent,
                            background: 'var(--accent-sage-soft, transparent)',
                          }
                        : undefined
                    }
                  >
                    #{tag} <span className="tabular-nums opacity-60">{count}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {segment !== 'favoritos' && calendarOpen && (
        <div className="animate-fade-up">
          <ActivityCalendar
            dayKeys={calendarDays}
            stats={calendarStats}
            selectedDay={selectedDay}
            onSelectDay={onSelectDay}
          />
        </div>
      )}

      {segment === 'capturas' && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 pl-0.5 text-caption text-ink-300">
          <div
            role="tablist"
            aria-label="Filtrar capturas por estado"
            className="flex flex-wrap items-center gap-x-3 gap-y-1"
          >
            <span className="text-micro uppercase tracking-eyebrow text-ink-300">
              estado
            </span>
            {CAPTURA_STATUS_OPTIONS.map(({ value, label }) => {
              const on = capturaStatus === value
              return (
                <button
                  key={value}
                  role="tab"
                  aria-selected={on}
                  onClick={() => onCapturaStatusChange(value)}
                  className="transition-colors hover:text-ink-700"
                  style={on ? { color: accent } : undefined}
                >
                  {label}
                </button>
              )
            })}
          </div>
          {itemCount > 0 && !galleryMode && (
            <button
              type="button"
              onClick={onToggleSelection}
              aria-pressed={selectionMode}
              className="ml-auto inline-flex items-center gap-1.5 transition-colors hover:text-ink-700"
              style={selectionMode ? { color: accent } : undefined}
            >
              <CheckSquareIcon size={13} />
              {selectionMode ? 'salir selección' : 'seleccionar'}
            </button>
          )}
        </div>
      )}
    </>
  )
}
