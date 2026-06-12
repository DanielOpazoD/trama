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
import {
  capturePdfEditorHeightBaseline,
  compensatePdfEditorInflation,
  pdfEditorGeometrySignature,
  placePdfEditorPage,
  type PdfEditorHeightBaseline,
} from './pdfEditorOpeningGeometry'

const OPENING_RETRY_MS = 75
const OPENING_STABLE_HITS = 2
// Válvula de seguridad: ~4s de reintentos. Un documento enorme o una página
// que nunca termina de renderizar no pueden dejar el editor clavado/oculto.
const OPENING_MAX_TICKS = 53

/**
 * Navegación de páginas del editor: la apertura es una TRANSICIÓN CONTROLADA.
 *
 * El problema histórico: al abrir desde una miniatura competían varias fuentes
 * de verdad — la página pedida, la "más visible" inferida del scroll, las
 * anclas de zoom y las alturas reales que llegan tarde (cada hoja nace como
 * placeholder de ~72vh y se infla al terminar su render, tanto más cuanto
 * mayor el zoom). El editor podía estabilizarse mostrando OTRA hoja con el
 * contador en la pedida, porque inflar el layout NO dispara eventos de scroll.
 *
 * El modelo nuevo tiene una sola fuente de verdad por fase:
 *
 *  1. ABRIENDO (openingPageRef != null): manda la página pedida. Cada cambio
 *     de geometría (ResizeObserver + reintentos) re-centra la hoja pedida y el
 *     scroll NO puede escribir currentPage. Se revela el viewport apenas la
 *     hoja real queda colocada (sin esperar al documento entero) y se libera
 *     cuando la geometría de las secciones HASTA la pedida queda estable dos
 *     chequeos seguidos — o por timeout, o porque el usuario gesticuló
 *     (wheel/touch): la intención manual siempre gana.
 *
 *  2. LIBRE: el scroll sincroniza currentPage (página visible). Si una hoja
 *     por ENCIMA del viewport se infla después (render lento), se compensa el
 *     scrollTop por el delta — anclaje manual, porque el contenedor usa
 *     [overflow-anchor:none].
 */
export function usePdfTextEditorPageNavigation({
  currentPage,
  scrollContainerRef,
  setActivePageLayout,
  setCurrentPage,
  setEditingId,
  setSelectedId,
  scrollInitialPage = false,
  total,
  zoom = 1,
}: {
  currentPage: number
  scrollContainerRef: RefObject<HTMLElement | null>
  setActivePageLayout: (layout: PageLayout | null) => void
  setCurrentPage: Dispatch<SetStateAction<number>>
  setEditingId: (id: string | null) => void
  setSelectedId: (id: string | null) => void
  scrollInitialPage?: boolean
  total: number
  zoom?: number
}) {
  const [isInitialPagePositioning, setIsInitialPagePositioning] = useState(
    () => scrollInitialPage && currentPage > 0,
  )
  const initialPageScrolledRef = useRef(false)
  const openingPageRef = useRef<number | null>(null)
  const openingRunRef = useRef(0)
  const openingIsInitialRef = useRef(false)
  const openingTicksRef = useRef(0)
  const openingStableHitsRef = useRef(0)
  const openingSignatureRef = useRef<string | null>(null)
  const timerRef = useRef<number | null>(null)
  const baselineRef = useRef<PdfEditorHeightBaseline | null>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  const getScrollContainer = useCallback(
    () =>
      scrollContainerRef.current ??
      (typeof document === 'undefined'
        ? null
        : document.querySelector<HTMLElement>('[data-pdf-editor-scroll]')),
    [scrollContainerRef],
  )

  const clearTimer = useCallback(() => {
    if (timerRef.current == null) return
    window.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const revealInitial = useCallback(() => {
    if (!openingIsInitialRef.current) return
    openingIsInitialRef.current = false
    setIsInitialPagePositioning(false)
  }, [])

  /** Cierra la transición. `finalPlace` re-centra una última vez (liberación
   *  por estabilidad/timeout); un abort por gesto del usuario NO recoloca. */
  const stopOpening = useCallback(
    (finalPlace: boolean) => {
      const pageIndex = openingPageRef.current
      if (pageIndex == null) return
      openingPageRef.current = null
      openingSignatureRef.current = null
      openingStableHitsRef.current = 0
      clearTimer()
      revealInitial()
      const container = getScrollContainer()
      if (finalPlace) placePdfEditorPage(container, pageIndex)
      baselineRef.current = capturePdfEditorHeightBaseline(container, zoomRef.current)
    },
    [clearTimer, getScrollContainer, revealInitial],
  )

  // El tick vive en un ref para poder auto-programarse sin pelear con las
  // dependencias de useCallback.
  const tickRef = useRef<(run: number) => void>(() => {})
  const schedule = useCallback((run: number, delay: number) => {
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      tickRef.current(run)
    }, delay)
  }, [])

  tickRef.current = (run: number) => {
    if (openingRunRef.current !== run) return
    const pageIndex = openingPageRef.current
    if (pageIndex == null) return
    openingTicksRef.current += 1
    const container = getScrollContainer()
    const { placed, sheetReady } = placePdfEditorPage(container, pageIndex)
    if (placed && sheetReady) revealInitial()
    const signature = pdfEditorGeometrySignature(container, pageIndex)
    const stable =
      placed &&
      sheetReady &&
      signature != null &&
      signature === openingSignatureRef.current
    openingSignatureRef.current = signature
    openingStableHitsRef.current = stable ? openingStableHitsRef.current + 1 : 0
    if (
      openingStableHitsRef.current >= OPENING_STABLE_HITS ||
      openingTicksRef.current >= OPENING_MAX_TICKS
    ) {
      stopOpening(true)
      return
    }
    schedule(run, OPENING_RETRY_MS)
  }

  const startOpening = useCallback(
    (pageIndex: number, initial = false) => {
      clearTimer()
      const run = (openingRunRef.current += 1)
      openingPageRef.current = pageIndex
      openingTicksRef.current = 0
      openingStableHitsRef.current = 0
      if (initial) openingIsInitialRef.current = true
      const container = getScrollContainer()
      const { placed, sheetReady } = placePdfEditorPage(container, pageIndex)
      openingSignatureRef.current = pdfEditorGeometrySignature(container, pageIndex)
      if (initial) {
        // Si la hoja ya está lista (segunda apertura, render cacheado) no hay
        // nada que ocultar; si no, se oculta hasta la primera colocación real.
        setIsInitialPagePositioning(pageIndex > 0 && !(placed && sheetReady))
      }
      schedule(run, OPENING_RETRY_MS)
    },
    [clearTimer, getScrollContainer, schedule],
  )

  useEffect(() => clearTimer, [clearTimer])

  /**
   * Reacciona a cambios de geometría. Abriendo: re-centra la pedida ya mismo
   * (el placeholder que se infló no puede correrla del viewport) y reinicia el
   * conteo de estabilidad. Libre: compensa la inflación por encima del
   * viewport (anclaje manual).
   */
  const syncGeometry = useCallback(() => {
    const container = getScrollContainer()
    if (!container) return
    const pageIndex = openingPageRef.current
    if (pageIndex != null) {
      const { placed, sheetReady } = placePdfEditorPage(container, pageIndex)
      if (placed && sheetReady) revealInitial()
      openingSignatureRef.current = pdfEditorGeometrySignature(container, pageIndex)
      openingStableHitsRef.current = 0
      return
    }
    baselineRef.current = compensatePdfEditorInflation(
      container,
      baselineRef.current,
      zoomRef.current,
    )
  }, [getScrollContainer, revealInitial])

  useEffect(() => {
    const container = getScrollContainer()
    if (!container) return
    // Gesto manual del usuario: el pin de apertura se suelta sin recolocar.
    const abortPin = () => stopOpening(false)
    container.addEventListener('wheel', abortPin, { passive: true })
    container.addEventListener('touchstart', abortPin, { passive: true })
    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => syncGeometry())
      observer.observe(container)
      for (const section of container.querySelectorAll<HTMLElement>(
        '[data-pdf-editor-page]',
      )) {
        observer.observe(section)
      }
    }
    return () => {
      container.removeEventListener('wheel', abortPin)
      container.removeEventListener('touchstart', abortPin)
      observer?.disconnect()
    }
  }, [getScrollContainer, stopOpening, syncGeometry])

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
      startOpening(i)
    },
    [clearPageState, currentPage, setCurrentPage, startOpening, total],
  )

  const scrollInitialPageIntoView = useCallback(() => {
    startOpening(currentPage, true)
  }, [currentPage, startOpening])

  useLayoutEffect(() => {
    if (!scrollInitialPage || initialPageScrolledRef.current) return
    initialPageScrolledRef.current = true
    scrollInitialPageIntoView()
    return () => {
      // StrictMode desmonta y vuelve a montar: si la transición seguía viva,
      // permitir que el segundo montaje la reinicie.
      if (openingPageRef.current != null) {
        initialPageScrolledRef.current = false
      }
    }
  }, [scrollInitialPage, scrollInitialPageIntoView])

  const activatePage = useCallback(
    (i: number) => {
      if (i < 0 || i >= total) return
      // Clic directo sobre una hoja: la intención del usuario gana siempre.
      stopOpening(false)
      if (i === currentPage) return
      clearPageState()
      setCurrentPage(i)
    },
    [clearPageState, currentPage, setCurrentPage, stopOpening, total],
  )

  const syncPageFromScroll = useCallback(
    (container?: HTMLElement | null) => {
      // Mientras la apertura está activa, lo "visible" es transitorio por
      // definición: el scroll no puede escribir la página lógica.
      if (openingPageRef.current != null) return
      const scrollContainer = container ?? getScrollContainer()
      const next = findMostVisiblePdfEditorPage(scrollContainer)
      if (next == null || next < 0 || next >= total || next === currentPage) return
      setCurrentPage(next)
    },
    [currentPage, getScrollContainer, setCurrentPage, total],
  )

  return {
    activatePage,
    goToPage,
    isInitialPagePositioning,
    scrollInitialPageIntoView,
    syncGeometry,
    syncPageFromScroll,
  }
}
