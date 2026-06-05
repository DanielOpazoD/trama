import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { assemble } from '../../../lib/pdfStudio/assemble'
import { openPdfPreview, type PdfPreview } from '../../../lib/pdfStudio/pdfRender'
import { type PdfDoc } from '../../../lib/pdfStudio/model'
import { LoadingHint } from '../../LoadingHint'
import { CloseIcon, DownloadIcon } from '../../Icons'
import { useInViewport } from './useInViewport'

/** Una página del preview: render PEREZOSO (sólo al acercarse al scroll del modal),
 *  como la grilla, para no renderizar 200 páginas de golpe. */
function PreviewPage({
  preview,
  index,
  root,
}: {
  preview: PdfPreview
  index: number
  root: Element | null
}) {
  const [ref, inView] = useInViewport<HTMLDivElement>({ root, rootMargin: '600px' })
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!inView || url) return
    let alive = true
    preview
      .renderPage(index)
      .then((u) => alive && setUrl(u))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [inView, url, index, preview])
  return (
    <div
      ref={ref}
      className="relative w-full bg-white rounded-sm ring-1 ring-ink-900/10 shadow-sm overflow-hidden"
      // Placeholder con alto real (A4) para que el lazy-load mida bien; al cargar,
      // la imagen impone su propio aspecto.
      style={url ? undefined : { aspectRatio: '1 / 1.414' }}
    >
      {url ? (
        <img
          src={url}
          alt={`Página ${index + 1}`}
          className="block w-full h-auto"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <span className="h-6 w-6 rounded-full border-2 border-ink-100 border-t-ink-300 animate-spin" />
        </div>
      )}
      <span className="absolute bottom-1 right-1 rounded bg-ink-900/55 px-1.5 py-0.5 text-micro tabular-nums text-paper-50">
        {index + 1}
      </span>
    </div>
  )
}

/**
 * Vista previa del PDF ENSAMBLADO antes de descargar (cierra el lazo WYSIWYG).
 * Ensambla una vez (`assemble`), abre el resultado con pdf.js y muestra las páginas
 * finales —con anotaciones, rotaciones e imágenes ya aplicadas— en un modal
 * scrolleable. "Descargar" reusa ESE mismo blob (no re-ensambla). Browser-only.
 */
export function PdfPreviewModal({
  doc,
  onClose,
  onDownload,
}: {
  doc: PdfDoc
  onClose: () => void
  onDownload: (blob: Blob) => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<PdfPreview | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [skipped, setSkipped] = useState<{ name: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    let p: PdfPreview | null = null
    let alive = true
    void (async () => {
      try {
        const res = await assemble(doc)
        if (!alive) return
        setBlob(res.blob)
        setSkipped(res.skipped)
        p = await openPdfPreview(res.blob)
        if (!alive) {
          p.dispose()
          return
        }
        setPreview(p)
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : 'No se pudo generar la vista previa.')
        }
      }
    })()
    return () => {
      alive = false
      p?.dispose()
    }
  }, [doc])

  // Esc cierra (el focus-trap completo lo agrega useFocusTrap).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Vista previa del PDF ensamblado"
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-ink-900/40 backdrop-blur-sm"
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl h-[95vh] overflow-hidden rounded-xl border border-ink-100 bg-paper-50 shadow-xl shadow-ink-900/20 flex flex-col"
      >
        <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-ink-100/70 shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-700">Vista previa</p>
            {preview && (
              <p className="text-micro text-ink-400 tabular-nums">
                {preview.numPages} {preview.numPages === 1 ? 'página' : 'páginas'} ·
                resultado final
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => blob && onDownload(blob)}
              disabled={!blob}
              className="btn-ink text-xs inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <DownloadIcon size={13} /> Descargar
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar vista previa"
              title="Cerrar (Esc)"
              className="touch-target inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:text-ink-800 hover:bg-ink-100/50 transition-colors"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        </header>

        {skipped.length > 0 && (
          <p
            className="px-4 py-1.5 text-caption shrink-0 border-b border-ink-100/70"
            style={{
              color: 'var(--accent-clay)',
              backgroundColor: 'var(--accent-clay-soft)',
            }}
          >
            Se saltearon {skipped.length} archivo(s):{' '}
            {skipped.map((s) => s.name).join(', ')}.
          </p>
        )}

        <div
          ref={setScrollEl}
          className="flex-1 min-h-0 overflow-auto bg-ink-100/30 p-3 sm:p-4 grid place-items-start justify-center"
        >
          {error ? (
            <div
              className="m-auto text-caption text-center"
              style={{ color: 'var(--accent-clay)' }}
            >
              {error}
            </div>
          ) : !preview ? (
            <div className="m-auto">
              <LoadingHint text="generando vista previa" size="sm" />
            </div>
          ) : (
            <div className="flex w-full max-w-[760px] flex-col gap-3">
              {Array.from({ length: preview.numPages }, (_, i) => (
                <PreviewPage key={i} preview={preview} index={i} root={scrollEl} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
