import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import {
  centerPdfEditorSheetHorizontally,
  capturePdfEditorScrollAnchor,
  restorePdfEditorScrollAnchor,
  type PdfEditorScrollAnchor,
} from './pdfEditorZoomScroll'

export function usePdfEditorZoomScroll(initialZoom = 1.5) {
  const [zoom, setZoom] = useState(initialZoom)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const lastZoomAnchorRef = useRef<PdfEditorScrollAnchor | null>(null)
  const pendingZoomAnchorRef = useRef<PdfEditorScrollAnchor | null>(null)

  const prepareZoomAnchor = useCallback(() => {
    pendingZoomAnchorRef.current = capturePdfEditorScrollAnchor(
      scrollContainerRef.current,
    )
  }, [])

  const changeZoom = useCallback(
    (nextZoom: number) => {
      if (!pendingZoomAnchorRef.current) prepareZoomAnchor()
      setZoom(nextZoom)
    },
    [prepareZoomAnchor],
  )
  const centerPageHorizontally = useCallback((pageIndex: number) => {
    centerPdfEditorSheetHorizontally(scrollContainerRef.current, pageIndex)
  }, [])
  const restoreLastZoomAnchor = useCallback((pageIndex: number) => {
    const anchor = lastZoomAnchorRef.current
    if (!anchor || anchor.pageIndex !== pageIndex) return false
    restorePdfEditorScrollAnchor(scrollContainerRef.current, anchor)
    return true
  }, [])

  useLayoutEffect(() => {
    const anchor = pendingZoomAnchorRef.current
    if (!anchor) return
    pendingZoomAnchorRef.current = null
    lastZoomAnchorRef.current = anchor
    let frame = 0
    let remaining = 3
    const tick = () => {
      restorePdfEditorScrollAnchor(scrollContainerRef.current, anchor)
      remaining -= 1
      if (remaining > 0) frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [zoom])

  return {
    centerPageHorizontally,
    changeZoom,
    prepareZoomAnchor,
    restoreLastZoomAnchor,
    scrollContainerRef,
    zoom,
  }
}
