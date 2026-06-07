import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { PageLayout } from '../../../lib/pdfStudio/editorGeometry'
import { usePdfEditorZoomScroll } from './usePdfEditorZoomScroll'

const ZOOM_MIN = 0.5
const PAGE_ZOOM_MAX = 4
const PAGE_ZOOM_BASE = 1.9
const ZOOM_MAX = Math.round((PAGE_ZOOM_MAX / PAGE_ZOOM_BASE) * 100) / 100
const ZOOM_STEP = 0.1

export function displayZoomToPageZoom(displayZoom: number): number {
  return Math.min(
    PAGE_ZOOM_MAX,
    Math.max(ZOOM_MIN * PAGE_ZOOM_BASE, displayZoom * PAGE_ZOOM_BASE),
  )
}

export function usePdfTextEditorViewport(currentPage: number) {
  const [displayZoom, setDisplayZoom] = useState(1)
  const {
    centerPageHorizontally,
    changeZoom: changePageZoom,
    prepareZoomAnchor,
    restoreLastZoomAnchor,
    scrollContainerRef,
    zoom,
  } = usePdfEditorZoomScroll(displayZoomToPageZoom(displayZoom))
  const [activeLayout, setActiveLayout] = useState<PageLayout | null>(null)
  const activeLayoutRef = useRef<PageLayout | null>(null)
  const setActivePageLayout = useCallback((next: PageLayout | null) => {
    activeLayoutRef.current = next
    setActiveLayout(next)
  }, [])

  useLayoutEffect(() => {
    if (!activeLayout) return
    if (!restoreLastZoomAnchor(currentPage)) centerPageHorizontally(currentPage)
    const frame = window.requestAnimationFrame(() => {
      if (!restoreLastZoomAnchor(currentPage)) centerPageHorizontally(currentPage)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeLayout, centerPageHorizontally, currentPage, restoreLastZoomAnchor])

  const changeDisplayZoom = useCallback(
    (nextDisplayZoom: number) => {
      prepareZoomAnchor()
      setDisplayZoom(nextDisplayZoom)
      changePageZoom(displayZoomToPageZoom(nextDisplayZoom))
    },
    [changePageZoom, prepareZoomAnchor],
  )

  const stepZoom = useCallback(
    (delta: number) => {
      changeDisplayZoom(
        Math.min(
          ZOOM_MAX,
          Math.max(ZOOM_MIN, Math.round((displayZoom + delta) * 100) / 100),
        ),
      )
    },
    [changeDisplayZoom, displayZoom],
  )

  return {
    activeLayout,
    activeLayoutRef,
    changeZoom: changeDisplayZoom,
    displayZoom,
    prepareZoomAnchor,
    scrollContainerRef,
    setActivePageLayout,
    stepZoomIn: () => stepZoom(ZOOM_STEP),
    stepZoomOut: () => stepZoom(-ZOOM_STEP),
    zoom,
    zoomInDisabled: displayZoom >= ZOOM_MAX,
    zoomOutDisabled: displayZoom <= ZOOM_MIN,
  }
}
