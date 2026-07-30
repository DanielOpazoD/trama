import type { RefObject } from 'react'
import {
  CalendarIcon,
  CheckSquareIcon,
  GalleryIcon,
  ListIcon,
  SearchIcon,
  ThumbSizeIcon,
} from '../Icons'
import { FilterChip } from '../FilterChip'
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

export function FeedSegmentTabs({
  segment,
  onSegmentChange,
}: {
  segment: NotasFeedSegment
  onSegmentChange: (next: NotasFeedSegment) => void
}) {
  return (
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
  )
}

export function FeedToolbar({
  search,
  searchOpen,
  calendarOpen,
  selectedDay,
  hasCapturesInScope,
  recorteThumb,
  feedView,
  onOpenSearch,
  onCloseSearch,
  onToggleCalendar,
  onRecorteThumbChange,
  onFeedViewChange,
}: {
  search: string
  searchOpen: boolean
  calendarOpen: boolean
  selectedDay: string | null
  hasCapturesInScope: boolean
  recorteThumb: RecorteThumbSize
  feedView: FeedViewMode
  onOpenSearch: () => void
  onCloseSearch: () => void
  onToggleCalendar: () => void
  onRecorteThumbChange: (next: RecorteThumbSize) => void
  onFeedViewChange: (next: FeedViewMode) => void
}) {
  return (
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
        <ThumbSizeMenu
          recorteThumb={recorteThumb}
          onRecorteThumbChange={onRecorteThumbChange}
        />
      )}
      {hasCapturesInScope && (
        <FeedViewToggle feedView={feedView} onFeedViewChange={onFeedViewChange} />
      )}
    </div>
  )
}

export function FeedSearchPanel({
  accent,
  search,
  searchInputRef,
  activeTag,
  tagCounts,
  showTags,
  onSearchChange,
  onCloseSearch,
  onActiveTagChange,
}: {
  accent: string
  search: string
  searchInputRef: RefObject<HTMLInputElement>
  activeTag: string | null
  tagCounts: Array<[string, number]>
  showTags: boolean
  onSearchChange: (next: string) => void
  onCloseSearch: () => void
  onActiveTagChange: (next: string | null) => void
}) {
  return (
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
        <TagFilterChips
          accent={accent}
          activeTag={activeTag}
          tagCounts={tagCounts}
          onActiveTagChange={onActiveTagChange}
        />
      )}
    </div>
  )
}

export function FeedCalendarPanel({
  calendarDays,
  calendarStats,
  selectedDay,
  onSelectDay,
}: {
  calendarDays: string[]
  calendarStats: Array<{ n: number; label: string }>
  selectedDay: string | null
  onSelectDay: (next: string | null) => void
}) {
  return (
    <div className="animate-fade-up">
      <ActivityCalendar
        dayKeys={calendarDays}
        stats={calendarStats}
        selectedDay={selectedDay}
        onSelectDay={onSelectDay}
      />
    </div>
  )
}

export function CaptureStatusBar({
  accent,
  capturaStatus,
  itemCount,
  galleryMode,
  selectionMode,
  onCapturaStatusChange,
  onToggleSelection,
}: {
  accent: string
  capturaStatus: RecorteStatusFilter
  itemCount: number
  galleryMode: boolean
  selectionMode: boolean
  onCapturaStatusChange: (next: RecorteStatusFilter) => void
  onToggleSelection: () => void
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 pl-0.5 text-caption text-ink-300">
      <div
        role="tablist"
        aria-label="Filtrar capturas por estado"
        className="flex flex-wrap items-center gap-x-3 gap-y-1"
      >
        <span className="text-micro uppercase tracking-eyebrow text-ink-300">estado</span>
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
  )
}

function ThumbSizeMenu({
  recorteThumb,
  onRecorteThumbChange,
}: {
  recorteThumb: RecorteThumbSize
  onRecorteThumbChange: (next: RecorteThumbSize) => void
}) {
  return (
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
  )
}

function FeedViewToggle({
  feedView,
  onFeedViewChange,
}: {
  feedView: FeedViewMode
  onFeedViewChange: (next: FeedViewMode) => void
}) {
  const gallery = feedView === 'galeria'
  return (
    <button
      type="button"
      onClick={() => onFeedViewChange(gallery ? 'list' : 'galeria')}
      aria-pressed={gallery}
      aria-label={gallery ? 'Ver como lista' : 'Ver como galería'}
      title={gallery ? 'Ver como lista' : 'Ver como galería'}
      className={`touch-target rounded-md p-1.5 transition-colors ${
        gallery
          ? 'bg-ink-100/70 text-ink-700'
          : 'text-ink-300 hover:bg-ink-100/60 hover:text-ink-700'
      }`}
    >
      {gallery ? <ListIcon size={14} /> : <GalleryIcon size={14} />}
    </button>
  )
}

function TagFilterChips({
  accent,
  activeTag,
  tagCounts,
  onActiveTagChange,
}: {
  accent: string
  activeTag: string | null
  tagCounts: Array<[string, number]>
  onActiveTagChange: (next: string | null) => void
}) {
  // El FilterChip compartido de toda la app: éste era el tercer clon inline
  // del mundo Notas, y los tres ya se habían desincronizado en hover y fondo.
  const activeStyle = { background: 'var(--accent-sage-soft)', color: accent }
  return (
    <div className="flex flex-wrap gap-1.5">
      <FilterChip
        active={activeTag === null}
        onClick={() => onActiveTagChange(null)}
        label="todas"
        activeStyle={activeStyle}
      />
      {tagCounts.map(([tag, count]) => (
        <FilterChip
          key={tag}
          active={activeTag === tag}
          onClick={() => onActiveTagChange(activeTag === tag ? null : tag)}
          label={`#${tag}`}
          count={count}
          activeStyle={activeStyle}
        />
      ))}
    </div>
  )
}
