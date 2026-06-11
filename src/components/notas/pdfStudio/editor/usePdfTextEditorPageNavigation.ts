import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { PageLayout } from '../../../../lib/pdfStudio/model/editorGeometry'
import { findMostVisiblePdfEditorPage } from './pdfEditorZoomScroll'

function scrollEditorPageIntoView(pageIndex: number): boolean {
  const target = document.querySelector<HTMLElement>(
    `[data-pdf-editor-page="${pageIndex}"]`,
  )
  const container = document.querySelector<HTMLElement>('[data-pdf-editor-scroll]')
  if (!target || !container) return false
  const containerRect = container.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  if (targetRect.height <= 1 || containerRect.height <= 1) return false
  const top =
    container.scrollTop +
    targetRect.top -
    containerRect.top -
    Math.max(0, (container.clientHeight - targetRect.height) / 2)
  container.scrollTop = top
  return true
}

function scheduleScrollEditorPageIntoView(pageIndex: number, attempt = 0) {
  window.setTimeout(
    () => {
      scrollEditorPageIntoView(pageIndex)
      if (attempt < 8) scheduleScrollEditorPageIntoView(pageIndex, attempt + 1)
    },
    attempt === 0 ? 0 : 50,
  )
}

export function usePdfTextEditorPageNavigation({
  currentPage,
  setActivePageLayout,
  setCurrentPage,
  setEditingId,
  setSelectedId,
  scrollInitialPage = false,
  total,
}: {
  currentPage: number
  setActivePageLayout: (layout: PageLayout | null) => void
  setCurrentPage: Dispatch<SetStateAction<number>>
  setEditingId: (id: string | null) => void
  setSelectedId: (id: string | null) => void
  scrollInitialPage?: boolean
  total: number
}) {
  const initialPageScrolledRef = useRef(false)
  const clearPageState = useCallback(() => {
    setSelectedId(null)
    setEditingId(null)
    setActivePageLayout(null)
  }, [setActivePageLayout, setEditingId, setSelectedId])

  const goToPage = useCallback(
    (i: number) => {
      if (i < 0 || i >= total || i === currentPage) return
      clearPageState()
      setCurrentPage(i)
      scheduleScrollEditorPageIntoView(i)
    },
    [clearPageState, currentPage, setCurrentPage, total],
  )

  const scrollInitialPageIntoView = useCallback(() => {
    scheduleScrollEditorPageIntoView(currentPage)
  }, [currentPage])
  useEffect(() => {
    if (!scrollInitialPage || initialPageScrolledRef.current) return
    initialPageScrolledRef.current = true
    scrollInitialPageIntoView()
  }, [scrollInitialPage, scrollInitialPageIntoView])

  const activatePage = useCallback(
    (i: number) => {
      if (i < 0 || i >= total || i === currentPage) return
      clearPageState()
      setCurrentPage(i)
    },
    [clearPageState, currentPage, setCurrentPage, total],
  )

  const syncPageFromScroll = useCallback(
    (container?: HTMLElement | null) => {
      const next = findMostVisiblePdfEditorPage(
        container ?? document.querySelector<HTMLElement>('[data-pdf-editor-scroll]'),
      )
      if (next == null || next < 0 || next >= total || next === currentPage) return
      setCurrentPage(next)
    },
    [currentPage, setCurrentPage, total],
  )

  return { activatePage, goToPage, scrollInitialPageIntoView, syncPageFromScroll }
}
