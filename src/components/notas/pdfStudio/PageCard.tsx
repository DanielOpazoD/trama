import { useEffect, useState } from 'react'
import {
  getSource,
  pageHasAnnotations,
  pageThumbKey,
  type PdfDoc,
  type PdfPage,
} from '../../../lib/pdfStudio/model'
import { renderPageThumb } from '../../../lib/pdfStudio/pdfRender'
import { useInViewport } from './useInViewport'
import { CheckIcon, FileIcon, FilePdfIcon, TextIcon } from '../../Icons'

const ACCENT = 'var(--accent-sage)'

/**
 * Una página en la grilla: miniatura (render pdf.js o la imagen directa) con su
 * rotación visual, badge de selección (✓ / nº) y de anotaciones, y el menú de
 * acciones (⋯). Se reordena ARRASTRANDO o con ◄ ► del teclado cuando la card tiene
 * foco. Presentacional: el estado del documento y la selección viven en
 * `PdfStudioView`/`usePageSelection`.
 */
export function PageCard({
  doc,
  page,
  index,
  total,
  selected,
  dragging,
  isDropTarget,
  onToggleSelect,
  onDragStart,
  onDragEnterCard,
  onDragEnd,
  onDropOn,
  onNudge,
  onOpenText,
  scrollRoot,
}: {
  doc: PdfDoc
  page: PdfPage
  index: number
  total: number
  selected: boolean
  dragging: boolean
  isDropTarget: boolean
  onToggleSelect: (shift: boolean) => void
  onDragStart: () => void
  onDragEnterCard: () => void
  onDragEnd: () => void
  onDropOn: () => void
  onNudge: (index: number, delta: -1 | 1) => void
  onOpenText: () => void
  scrollRoot: Element | null
}) {
  const source = getSource(doc, page.sourceId)
  const [thumb, setThumb] = useState<string | null>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  // Render PEREZOSO de la miniatura: sólo cuando la card se acerca al área visible
  // del contenedor de scroll (no del viewport entero), para no disparar cientos de
  // renders de pdf.js a la vez en documentos grandes.
  const [viewRef, inView] = useInViewport<HTMLLIElement>({ root: scrollRoot })

  useEffect(() => {
    if (!source || !inView) return
    let alive = true
    if (page.kind === 'image') {
      // La imagen entera es la página: object URL directo (lo posee la card).
      const url = URL.createObjectURL(source.file)
      setThumb(url)
      return () => {
        alive = false
        URL.revokeObjectURL(url)
      }
    }
    // Página de PDF: render con pdf.js (el cache posee/revoca el URL).
    setThumb(null)
    renderPageThumb(source.file, page.pageIndex, pageThumbKey(page))
      .then((url) => {
        if (alive) setThumb(url)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [page, source, inView])

  if (!source) return null
  const KindIcon = page.kind === 'pdf' ? FilePdfIcon : FileIcon
  const annotationTitle = page.annotations.every((a) => a.kind === 'text')
    ? 'Tiene texto'
    : 'Tiene anotaciones'

  // Rotación visual de la miniatura. En 90°/270° se reescala para que la imagen
  // rotada entre en la caja CUADRADA (depende solo de los aspectos, no de px).
  const rot = ((page.rotationQuarters % 4) + 4) % 4
  let thumbTransform = `rotate(${rot * 90}deg)`
  if (rot % 2 === 1 && nat) {
    const s0 = Math.min(1 / nat.w, 1 / nat.h)
    const dw = nat.w * s0
    const dh = nat.h * s0
    thumbTransform += ` scale(${Math.min(1 / dh, 1 / dw)})`
  }

  return (
    <li
      ref={viewRef}
      draggable
      tabIndex={0}
      aria-label={`Página ${index + 1} de ${total}. Flechas izquierda/derecha para reordenar.`}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnter={onDragEnterCard}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDropOn()
      }}
      onKeyDown={(e) => {
        // Reordenar por teclado cuando la card (no un control interno) tiene foco.
        if (e.target !== e.currentTarget) return
        if (e.key === 'ArrowLeft' && index > 0) {
          e.preventDefault()
          onNudge(index, -1)
        } else if (e.key === 'ArrowRight' && index < total - 1) {
          e.preventDefault()
          onNudge(index, 1)
        }
      }}
      style={isDropTarget || selected ? { boxShadow: `0 0 0 2px ${ACCENT}` } : undefined}
      className={`group flex flex-col rounded-lg border bg-paper-50 overflow-hidden transition-all duration-150 ${
        dragging
          ? 'opacity-40 scale-[0.97] border-ink-300'
          : isDropTarget || selected
            ? 'border-transparent'
            : 'border-ink-100 hover:border-ink-200 hover:shadow-md hover:shadow-ink-900/5'
      }`}
    >
      {/* Miniatura — doble clic la abre grande (ver y editar) */}
      <div
        onDoubleClick={onOpenText}
        title="Doble clic para ver y editar"
        className="relative aspect-square min-h-0 bg-ink-100/30 flex items-center justify-center cursor-grab active:cursor-grabbing p-1.5"
      >
        {thumb ? (
          <img
            src={thumb}
            alt={`Página ${index + 1}`}
            onLoad={(e) =>
              setNat({
                w: e.currentTarget.naturalWidth,
                h: e.currentTarget.naturalHeight,
              })
            }
            className="max-h-full max-w-full object-contain transition-transform duration-200"
            style={{
              transform: thumbTransform,
              boxShadow: '0 1px 5px rgb(0 0 0 / 0.12)',
            }}
            draggable={false}
          />
        ) : (
          // Sólo gira mientras renderiza (en viewport); fuera, anillo estático.
          <span
            aria-label={inView ? 'cargando' : undefined}
            className={`h-6 w-6 rounded-full border-2 border-ink-100 ${
              inView ? 'border-t-ink-300 animate-spin' : ''
            }`}
          />
        )}
        {/* Info (no interactiva): tipo + nº de hoja (+ texto si tiene). */}
        <span className="absolute top-1 left-1 inline-flex items-center gap-1 rounded bg-ink-900/60 px-1.5 py-0.5 text-micro tabular-nums text-paper-50">
          <KindIcon size={10} />
          {index + 1}
          {pageHasAnnotations(page) && (
            <span
              className="inline-flex items-center gap-0.5 pl-0.5"
              title={annotationTitle}
            >
              <TextIcon size={9} />
              {page.annotations.length}
            </span>
          )}
        </span>
        {/* Tick: incluir/quitar esta hoja del PDF a guardar. */}
        <button
          type="button"
          draggable={false}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect(e.shiftKey)
          }}
          aria-pressed={selected}
          aria-label={
            selected ? `Desmarcar la hoja ${index + 1}` : `Marcar la hoja ${index + 1}`
          }
          title={selected ? 'Desmarcar (Shift: rango)' : 'Marcar (Shift: rango)'}
          className={`absolute top-1 right-1 inline-flex h-5 w-5 items-center justify-center rounded border transition-colors ${
            selected
              ? 'text-paper-50'
              : 'bg-paper-50/85 border-ink-300 text-ink-300 hover:border-ink-400 hover:text-ink-500'
          }`}
          style={selected ? { backgroundColor: ACCENT, borderColor: ACCENT } : undefined}
        >
          <CheckIcon size={12} />
        </button>
      </div>
    </li>
  )
}
