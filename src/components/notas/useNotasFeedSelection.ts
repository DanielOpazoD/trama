import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CaptureItem, Recorte } from '../../api'
import {
  isNotasFeedGalleryMode,
  selectedRecortesFromItems,
  type NotasFeedSegment,
} from './notasFeedViewModel'
import type { RecorteFeedView } from '../../hooks/useRecorteFeedView'

export function useNotasFeedSelection({
  feedView,
  items,
  segment,
}: {
  feedView: RecorteFeedView
  items: CaptureItem[]
  segment: NotasFeedSegment
}): {
  exitSelection: () => void
  galleryMode: boolean
  selectedIds: Set<string>
  selectedRecortes: Recorte[]
  selectionMode: boolean
  toggleSelect: (id: string) => void
  toggleSelectionMode: () => void
} {
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const galleryMode = isNotasFeedGalleryMode({ feedView, segment })
  const selectedRecortes = useMemo(
    () => selectedRecortesFromItems(items, selectedIds),
    [items, selectedIds],
  )

  const exitSelection = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((active) => {
      if (active) setSelectedIds(new Set())
      return !active
    })
  }, [])

  useEffect(() => {
    if (segment !== 'capturas') exitSelection()
  }, [segment, exitSelection])

  useEffect(() => {
    if (galleryMode) exitSelection()
  }, [galleryMode, exitSelection])

  return {
    exitSelection,
    galleryMode,
    selectedIds,
    selectedRecortes,
    selectionMode,
    toggleSelect,
    toggleSelectionMode,
  }
}
