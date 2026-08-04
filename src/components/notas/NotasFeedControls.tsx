import type { RefObject } from 'react'
import {
  CaptureStatusBar,
  NotesSelectionToggle,
  FeedCalendarPanel,
  FeedSearchPanel,
  FeedSegmentTabs,
  FeedToolbar,
} from './NotasFeedControlSections'
import {
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
        <FeedSegmentTabs segment={segment} onSegmentChange={onSegmentChange} />

        {segment !== 'favoritos' && (
          <FeedToolbar
            search={search}
            searchOpen={searchOpen}
            calendarOpen={calendarOpen}
            selectedDay={selectedDay}
            hasCapturesInScope={hasCapturesInScope}
            recorteThumb={recorteThumb}
            feedView={feedView}
            onOpenSearch={onOpenSearch}
            onCloseSearch={onCloseSearch}
            onToggleCalendar={onToggleCalendar}
            onRecorteThumbChange={onRecorteThumbChange}
            onFeedViewChange={onFeedViewChange}
          />
        )}
      </div>

      {segment !== 'favoritos' && searchOpen && (
        <FeedSearchPanel
          accent={accent}
          search={search}
          searchInputRef={searchInputRef}
          activeTag={activeTag}
          tagCounts={tagCounts}
          showTags={showTags}
          onSearchChange={onSearchChange}
          onCloseSearch={onCloseSearch}
          onActiveTagChange={onActiveTagChange}
        />
      )}

      {segment !== 'favoritos' && calendarOpen && (
        <FeedCalendarPanel
          calendarDays={calendarDays}
          calendarStats={calendarStats}
          selectedDay={selectedDay}
          onSelectDay={onSelectDay}
        />
      )}

      {segment === 'capturas' ? (
        <CaptureStatusBar
          accent={accent}
          capturaStatus={capturaStatus}
          itemCount={itemCount}
          galleryMode={galleryMode}
          selectionMode={selectionMode}
          onCapturaStatusChange={onCapturaStatusChange}
          onToggleSelection={onToggleSelection}
        />
      ) : (
        <NotesSelectionToggle
          accent={accent}
          itemCount={itemCount}
          galleryMode={galleryMode}
          selectionMode={selectionMode}
          onToggleSelection={onToggleSelection}
        />
      )}
    </>
  )
}
