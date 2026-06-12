import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react'
import type { PageLayout } from '../../../../lib/pdfStudio/model/editorGeometry'
import { findMostVisiblePdfEditorPage } from './pdfEditorZoomScroll'

const PROGRAMMATIC_SCROLL_RETRY_MS = 75
const PROGRAMMATIC_SCROLL_STABLE_HITS = 2

function scrollEditorPageIntoView(
  container: HTMLElement | null,
  pageIndex: number,
): boolean {
  const sheet = container?.querySelector<HTMLElement>(
    `[data-pdf-editor-sheet="${pageIndex}"]`,
  )
  const pageShell =
    sheet ??
    container?.querySelector<HTMLElement>(`[data-pdf-editor-page="${pageIndex}"]`)
  const target = sheet ?? pageShell
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
  return Boolean(sheet) && findMostVisiblePdfEditorPage(container) === pageIndex
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
  const [isInitialPagePositioning, setIsInitialPagePositioning] = useState(
    () => scrollInitialPage && currentPage > 0,
  )
  const initialPageScrolledRef = useRef(false)
  const programmaticPageRef = useRef<number | null>(null)
  const initialProgrammaticRunRef = useRef<number | null>(null)
  const programmaticRunRef = useRef(0)
  const programmaticTimerRef = useRef<number | null>(null)
  const getScrollContainer = useCallback(
    () =>
      scrollContainerRef.current ??
      (typeof document === 'undefined'
        ? null
        : document.querySelector<HTMLElement>('[data-pdf-editor-scroll]')),
    [scrollContainerRef],
  )

  const clearProgrammaticTimer = useCallback(() => {
    if (programmaticTimerRef.current == null) return
    window.clearTimeout(programmaticTimerRef.current)
    programmaticTimerRef.current = null
  }, [])

  const finishProgrammaticScroll = useCallback((run: number) => {
    programmaticPageRef.current = null
    if (initialProgrammaticRunRef.current === run) {
      initialProgrammaticRunRef.current = null
      setIsInitialPagePositioning(false)
    }
  }, [])

  const continueProgrammaticScroll = useCallback(
    (pageIndex: number, run: number, stableHits = 0, delay = 0) => {
      programmaticTimerRef.current = window.setTimeout(() => {
        programmaticTimerRef.current = null
        if (
          programmaticRunRef.current !== run ||
          programmaticPageRef.current !== pageIndex
        ) {
          return
        }

        const ready = scrollEditorPageIntoView(getScrollContainer(), pageIndex)
        const nextStableHits = ready ? stableHits + 1 : 0
        if (nextStableHits >= PROGRAMMATIC_SCROLL_STABLE_HITS) {
          finishProgrammaticScroll(run)
          return
        }

        continueProgrammaticScroll(
          pageIndex,
          run,
          nextStableHits,
          PROGRAMMATIC_SCROLL_RETRY_MS,
        )
      }, delay)
    },
    [finishProgrammaticScroll, getScrollContainer],
  )

  useEffect(() => clearProgrammaticTimer, [clearProgrammaticTimer])

  const scrollPageIntoViewProgrammatically = useCallback(
    (pageIndex: number, initial = false) => {
      clearProgrammaticTimer()
      const run = programmaticRunRef.current + 1
      programmaticRunRef.current = run
      programmaticPageRef.current = pageIndex
      if (initial) {
        initialProgrammaticRunRef.current = run
        setIsInitialPagePositioning(pageIndex > 0)
      }
      const ready = scrollEditorPageIntoView(getScrollContainer(), pageIndex)
      continueProgrammaticScroll(
        pageIndex,
        run,
        ready ? 1 : 0,
        PROGRAMMATIC_SCROLL_RETRY_MS,
      )
    },
    [clearProgrammaticTimer, continueProgrammaticScroll, getScrollContainer],
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
    scrollPageIntoViewProgrammatically(currentPage, true)
  }, [currentPage, scrollPageIntoViewProgrammatically])
  useLayoutEffect(() => {
    if (!scrollInitialPage || initialPageScrolledRef.current) return
    initialPageScrolledRef.current = true
    scrollInitialPageIntoView()
    return () => {
      if (programmaticPageRef.current != null) {
        initialPageScrolledRef.current = false
      }
    }
  }, [scrollInitialPage, scrollInitialPageIntoView])

  const activatePage = useCallback(
    (i: number) => {
      if (i < 0 || i >= total || i === currentPage) return
      clearProgrammaticTimer()
      programmaticPageRef.current = null
      initialProgrammaticRunRef.current = null
      setIsInitialPagePositioning(false)
      clearPageState()
      setCurrentPage(i)
    },
    [clearPageState, clearProgrammaticTimer, currentPage, setCurrentPage, total],
  )

  const syncPageFromScroll = useCallback(
    (container?: HTMLElement | null) => {
      const scrollContainer = container ?? getScrollContainer()
      const next = findMostVisiblePdfEditorPage(scrollContainer)
      if (next == null || next < 0 || next >= total) return
      const programmaticPage = programmaticPageRef.current
      if (programmaticPage != null) {
        if (next !== programmaticPage) return
        const targetSheet = scrollContainer?.querySelector<HTMLElement>(
          `[data-pdf-editor-sheet="${programmaticPage}"]`,
        )
        if (!targetSheet) return
        clearProgrammaticTimer()
        finishProgrammaticScroll(programmaticRunRef.current)
      }
      if (next === currentPage) return
      setCurrentPage(next)
    },
    [
      clearProgrammaticTimer,
      currentPage,
      finishProgrammaticScroll,
      getScrollContainer,
      setCurrentPage,
      total,
    ],
  )

  return {
    activatePage,
    goToPage,
    isInitialPagePositioning,
    scrollInitialPageIntoView,
    syncPageFromScroll,
  }
}
