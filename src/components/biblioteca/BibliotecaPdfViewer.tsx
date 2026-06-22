import { useCallback, useEffect, useRef, useState } from 'react'
import { requestBlob } from '../../api/request'
import {
  loadPdfjsDocument,
  type PdfjsDocumentInit,
} from '../../lib/pdfStudio/pdfRuntime/pdfjsLoader'
import { ChevronLeftIcon, ChevronRightIcon } from '../Icons'

/**
 * Visor de PDF de solo lectura para la Biblioteca, paginado (una página a la
 * vez, con contador y flechas ◀▶ / teclado). Baja el blob por la URL servida
 * AUTENTICADA (`requestBlob` adjunta el bearer; un fetch directo daría 401) y lo
 * abre con pdf.js a través del loader compartido (`pdfjsLoader`), nunca
 * importando `pdfjs-dist` directo — así se respeta la frontera del runtime de
 * PDF y este componente vive en su propio chunk lazy (pdf.js pesa ~1 MB y no
 * debe entrar al shell de la Biblioteca).
 *
 * Este archivo se carga con `lazy(() => import(...))` desde BibliotecaViewer:
 * montarlo es lo que dispara la descarga de pdf.js, recién cuando el usuario
 * abre un PDF.
 */
function BibliotecaPdfViewer({ serveUrl }: { serveUrl: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  // El documento pdf.js abierto. `unknown`-ish para no arrastrar tipos de
  // pdf.js a este módulo (el loader ya es la frontera); usamos una forma mínima.
  const docRef = useRef<PdfDocumentLike | null>(null)

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [numPages, setNumPages] = useState(0)
  const [page, setPage] = useState(1)
  const [rendering, setRendering] = useState(false)

  // Abrir el documento una vez por URL. Copia defensiva de los bytes: getDocument
  // puede transferir el buffer al worker y dejaría el original desprendido.
  useEffect(() => {
    let active = true
    let localDoc: PdfDocumentLike | null = null
    setStatus('loading')
    setNumPages(0)
    setPage(1)

    void (async () => {
      try {
        const blob = await requestBlob(serveUrl)
        const buffer = await blob.arrayBuffer()
        if (!active) return
        const task = await loadPdfjsDocument({
          data: new Uint8Array(buffer),
        } as unknown as PdfjsDocumentInit)
        const doc = (await task.promise) as unknown as PdfDocumentLike
        if (!active) {
          void doc.destroy?.()
          return
        }
        localDoc = doc
        docRef.current = doc
        setNumPages(doc.numPages)
        setStatus('ready')
      } catch {
        if (active) setStatus('error')
      }
    })()

    return () => {
      active = false
      docRef.current = null
      void localDoc?.destroy?.()
    }
  }, [serveUrl])

  // Renderiza la página actual al canvas, escalada al ancho del contenedor.
  const renderPage = useCallback(async (pageNumber: number) => {
    const doc = docRef.current
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!doc || !canvas || !container) return
    setRendering(true)
    try {
      const pdfPage = await doc.getPage(pageNumber)
      const base = pdfPage.getViewport({ scale: 1 })
      // Ancho disponible (con un tope para no renderizar canvases enormes), por
      // el devicePixelRatio para que se vea nítido en pantallas retina.
      const available = Math.min(container.clientWidth || base.width, 1100)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const scale = (available / base.width) * dpr
      const viewport = pdfPage.getViewport({ scale })
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      // Tamaño CSS = tamaño lógico (sin dpr) para que ocupe el ancho real.
      canvas.style.width = `${Math.ceil(viewport.width / dpr)}px`
      canvas.style.height = `${Math.ceil(viewport.height / dpr)}px`
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await pdfPage.render({
        canvas,
        canvasContext: ctx,
        viewport,
      } as unknown as Parameters<typeof pdfPage.render>[0]).promise
    } finally {
      setRendering(false)
    }
  }, [])

  // Re-renderizar cuando hay documento listo o cambia la página.
  useEffect(() => {
    if (status !== 'ready') return
    void renderPage(page)
  }, [status, page, renderPage])

  const multi = numPages > 1
  const goPrev = useCallback(() => setPage((p) => Math.max(1, p - 1)), [])
  const goNext = useCallback(() => setPage((p) => Math.min(numPages, p + 1)), [numPages])

  // Teclado: flechas ←/→ cambian de página (sin envolver, como un lector).
  useEffect(() => {
    if (status !== 'ready' || !multi) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [status, multi, goPrev, goNext])

  if (status === 'error') {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-caption text-white/70">No se pudo abrir el PDF</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto px-4 py-6 flex justify-center"
      >
        {status === 'loading' ? (
          <p className="m-auto text-caption text-white/70">cargando…</p>
        ) : (
          <canvas
            ref={canvasRef}
            className={`h-fit max-w-full rounded-sm shadow-2xl shadow-black/60 ${
              rendering ? 'opacity-80' : ''
            }`}
          />
        )}
      </div>

      {multi && status === 'ready' && (
        <div className="shrink-0 flex items-center justify-center gap-4 py-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={page <= 1}
            aria-label="Página anterior"
            className="size-9 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronLeftIcon size={20} />
          </button>
          <span className="text-caption tabular-nums text-white/70">
            {page} / {numPages}
          </span>
          <button
            type="button"
            onClick={goNext}
            disabled={page >= numPages}
            aria-label="Página siguiente"
            className="size-9 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronRightIcon size={20} />
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Forma mínima del documento/página de pdf.js que este visor usa. Evita
 * arrastrar los tipos completos de `pdfjs-dist` a este módulo (el loader es la
 * frontera tipada); solo nombramos lo que tocamos.
 */
type PdfViewport = { width: number; height: number }
type PdfPageLike = {
  getViewport: (opts: { scale: number }) => PdfViewport
  render: (opts: unknown) => { promise: Promise<void> }
}
type PdfDocumentLike = {
  numPages: number
  getPage: (n: number) => Promise<PdfPageLike>
  destroy?: () => Promise<void>
}

export default BibliotecaPdfViewer
