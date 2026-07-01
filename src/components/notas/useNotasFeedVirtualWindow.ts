import { useEffect } from 'react'
import type { CaptureItem } from '../../api'
import { useMainScrollVirtualizer } from '../../hooks/useMainScrollVirtualizer'
import type { RecorteThumbSize } from '../../hooks/useRecorteThumbSize'
import type { RecorteStatusFilter } from './notasFeedViewModel'
import { useMeasuredVirtualFeed } from './useMeasuredVirtualFeed'

export function useNotasFeedVirtualWindow({
  calendarOpen,
  capturaStatus,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  items,
  recorteThumb,
  reducedMotion,
  searchOpen,
  segment,
  selected,
}: {
  calendarOpen: boolean
  capturaStatus: RecorteStatusFilter
  fetchNextPage: () => void
  hasNextPage: boolean | undefined
  isFetchingNextPage: boolean
  items: CaptureItem[]
  recorteThumb: RecorteThumbSize
  reducedMotion: boolean
  searchOpen: boolean
  segment: string
  selected: number | null
}) {
  const { listRef, virtualizer } = useMainScrollVirtualizer({
    count: items.length,
    estimateSize: 200,
    overscan: 6,
    deps: [segment, searchOpen, calendarOpen, capturaStatus, recorteThumb, items.length],
  })
  const virtualItems = virtualizer.getVirtualItems()
  useMeasuredVirtualFeed({ items, recorteThumb, virtualizer })

  const lastVisibleIndex =
    virtualItems.length > 0 ? virtualItems[virtualItems.length - 1]!.index : 0
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return
    if (items.length === 0) return
    if (lastVisibleIndex >= items.length - 5) fetchNextPage()
  }, [lastVisibleIndex, items.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  useEffect(() => {
    if (selected === null) return
    virtualizer.scrollToIndex(selected, {
      align: 'auto',
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
  }, [selected, reducedMotion, virtualizer])

  return { listRef, virtualItems, virtualizer }
}
