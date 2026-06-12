import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react'
import type { PageLayout } from '../../../../lib/pdfStudio/model/editorGeometry'
import { findMostVisiblePdfEditorPage } from './pdfEditorZoomScroll'

const PROGRAMMATIC_SCROLL_RETRIES = 14
const PROGRAMMATIC_SCROLL_RETRY_MS = 75

function scrollEditorPageIntoView(
  container: HTMLElement | null,
  pageIndex: number,
): boolean {
  const target = container?.querySelector<HTMLElement>(
    `[data-pdf-editor-page="${pageIndex}"]`,
  )
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

function scheduleScrollEditorPageIntoView(
  getContainer: () => HTMLElement | null,
  pageIndex: number,
  attempt = 0,
  onDone?: () => void,
) {
  window.setTimeout(
    () => {
      scrollEditorPageIntoView(getContainer(), pageIndex)
      if (attempt < PROGRAMMATIC_SCROLL_RETRIES) {
        scheduleScrollEditorPageIntoView(getContainer, pageIndex, attempt + 1, onDone)
      } else {
        onDone?.()
      }
    },
    attempt === 0 ? 0 : PROGRAMMATIC_SCROLL_RETRY_MS,
  )
}

export function usePdfTextEditorPageNavigation({
  currentPage,
  scrollContainerRef,
  setActivePageLayout,
  setCurrentPage,
  setEditingId,
  setSelectedId,
  scrollInitialPage = false,
  total,
}: {
  currentPage: number
  scrollContainerRef: RefObject<HTMLElement | null>
  setActivePageLayout: (layout: PageLayout | null) => void
  setCurrentPage: Dispatch<SetStateAction<number>>
  setEditingId: (id: string | null) => void
  setSelectedId: (id: string | null) => void
  scrollInitialPage?: boolean
  total: number
}) {
  const initialPageScrolledRef = useRef(false)
  const programmaticPageRef = useRef<number | null>(null)
  const programmaticRunRef = useRef(0)
  const getScrollContainer = useCallback(
    () =>
      scrollContainerRef.current ??
      (typeof document === 'undefined'
        ? null
        : document.querySelector<HTMLElement>('[data-pdf-editor-scroll]')),
    [scrollContainerRef],
  )
  const scrollPageIntoViewProgrammatically = useCallback(
    (pageIndex: number) => {
      const run = programmaticRunRef.current + 1
      programmaticRunRef.current = run
      programmaticPageRef.current = pageIndex
      scheduleScrollEditorPageIntoView(getScrollContainer, pageIndex, 0, () => {
        if (
          programmaticRunRef.current === run &&
          programmaticPageRef.current === pageIndex
        ) {
          programmaticPageRef.current = null
        }
      })
    },
    [getScrollContainer],
  )
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
      scrollPageIntoViewProgrammatically(i)
    },
    [
      clearPageState,
      currentPage,
      scrollPageIntoViewProgrammatically,
      setCurrentPage,
      total,
    ],
  )

  const scrollInitialPageIntoView = useCallback(() => {
    scrollPageIntoViewProgrammatically(currentPage)
  }, [currentPage, scrollPageIntoViewProgrammatically])
  useEffect(() => {
    if (!scrollInitialPage || initialPageScrolledRef.current) return
    initialPageScrolledRef.current = true
    scrollInitialPageIntoView()
  }, [scrollInitialPage, scrollInitialPageIntoView])

  const activatePage = useCallback(
    (i: number) => {
      if (i < 0 || i >= total || i === currentPage) return
      programmaticPageRef.current = null
      clearPageState()
      setCurrentPage(i)
    },
    [clearPageState, currentPage, setCurrentPage, total],
  )

  const syncPageFromScroll = useCallback(
    (container?: HTMLElement | null) => {
      const next = findMostVisiblePdfEditorPage(container ?? getScrollContainer())
      if (next == null || next < 0 || next >= total || next === currentPage) return
      const programmaticPage = programmaticPageRef.current
      if (programmaticPage != null && next !== programmaticPage) return
      setCurrentPage(next)
    },
    [currentPage, getScrollContainer, setCurrentPage, total],
  )

  return { activatePage, goToPage, scrollInitialPageIntoView, syncPageFromScroll }
}
