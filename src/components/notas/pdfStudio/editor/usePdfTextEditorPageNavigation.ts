import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { PageLayout } from '../../../../lib/pdfStudio/model/editorGeometry'
import { findMostVisiblePdfEditorPage } from './pdfEditorZoomScroll'

function scrollEditorPageIntoView(pageIndex: number) {
  const target = document.querySelector<HTMLElement>(
    `[data-pdf-editor-page="${pageIndex}"]`,
  )
  const container = document.querySelector<HTMLElement>('[data-pdf-editor-scroll]')
  if (!target || !container) return
  const containerRect = container.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const top =
    container.scrollTop +
    targetRect.top -
    containerRect.top -
    Math.max(0, (container.clientHeight - targetRect.height) / 2)
  container.scrollTop = top
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
      window.setTimeout(() => {
        scrollEditorPageIntoView(i)
      }, 0)
    },
    [clearPageState, currentPage, setCurrentPage, total],
  )

  const scrollInitialPageIntoView = useCallback(() => {
    window.setTimeout(() => {
      scrollEditorPageIntoView(currentPage)
    }, 0)
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
