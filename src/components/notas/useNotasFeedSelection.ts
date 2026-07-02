import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CaptureItem, Recorte } from '../../api'
import {
  isNotasFeedGalleryMode,
  selectedRecortesFromItems,
  type NotasFeedSegment,
} from './notasFeedViewModel'
import type { RecorteFeedView } from '../../hooks/useRecorteFeedView'

const EMPTY_SELECTED_IDS = new Set<string>()

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
  const canSelect = segment === 'capturas' && !galleryMode
  const effectiveSelectionMode = canSelect && selectionMode
  const effectiveSelectedIds = canSelect ? selectedIds : EMPTY_SELECTED_IDS
  const selectedRecortes = useMemo(
    () => selectedRecortesFromItems(items, effectiveSelectedIds),
    [items, effectiveSelectedIds],
  )

  const exitSelection = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }, [])

  const toggleSelect = useCallback(
    (id: string) => {
      if (!canSelect) return
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    [canSelect],
  )

  const toggleSelectionMode = useCallback(() => {
    if (!canSelect) return
    if (selectionMode) exitSelection()
    else setSelectionMode(true)
  }, [canSelect, exitSelection, selectionMode])

  useEffect(() => {
    if (segment !== 'capturas') exitSelection()
  }, [segment, exitSelection])

  useEffect(() => {
    if (galleryMode) exitSelection()
  }, [galleryMode, exitSelection])

  return {
    exitSelection,
    galleryMode,
    selectedIds: effectiveSelectedIds,
    selectedRecortes,
    selectionMode: effectiveSelectionMode,
    toggleSelect,
    toggleSelectionMode,
  }
}
