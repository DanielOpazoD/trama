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
import { OverflowMenu, OverflowMenuItem } from '../../OverflowMenu'
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DuplicateIcon,
  FileIcon,
  FilePdfIcon,
  PrinterIcon,
  RotateIcon,
  TextIcon,
  TrashIcon,
} from '../../Icons'

const ACCENT = 'var(--accent-sage)'

/** Botón de control de la miniatura (reordenar/rotar/texto). */
const ctrlBtn =
  'touch-target inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:text-ink-800 hover:bg-ink-100/50 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-ink-400 transition-colors'

/**
 * Una página en la grilla: miniatura (render pdf.js o la imagen directa) con su
 * rotación visual, badge de selección (✓ / nº) y de anotaciones, y los controles
 * (reordenar ◄ ►, menú de acciones). Presentacional: el estado del documento y la
 * selección viven en `PdfStudioView`/`usePageSelection`.
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
  onRotate,
  onDuplicate,
  onPrint,
  onDelete,
  onOpenText,
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
  onRotate: (delta: -1 | 1) => void
  onDuplicate: () => void
  onPrint: () => void
  onDelete: (index: number) => void
  onOpenText: () => void
}) {
  const source = getSource(doc, page.sourceId)
  const [thumb, setThumb] = useState<string | null>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  // Render PEREZOSO de la miniatura: sólo cuando la card se acerca al viewport,
  // para no disparar cientos de renders de pdf.js a la vez en documentos grandes.
  const [viewRef, inView] = useInViewport<HTMLLIElement>()

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
            selected
              ? `Deseleccionar página ${index + 1}`
              : `Seleccionar página ${index + 1}`
          }
          title={selected ? 'Deseleccionar' : 'Seleccionar (Shift: rango)'}
          className={`absolute top-1 left-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-micro tabular-nums text-paper-50 transition-colors ${
            selected ? '' : 'bg-ink-900/65 hover:bg-ink-900/85'
          }`}
          style={selected ? { backgroundColor: ACCENT } : undefined}
        >
          {selected ? <CheckIcon size={10} /> : <KindIcon size={10} />}
          {index + 1}
        </button>
        {pageHasAnnotations(page) && (
          <span
            className="absolute top-1 right-1 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-micro tabular-nums text-paper-50"
            style={{ backgroundColor: ACCENT }}
            title="Tiene texto"
          >
            <TextIcon size={9} />
            {page.annotations.length}
          </span>
        )}
      </div>

      {/* Controles: reordenar · acciones */}
      <div className="flex items-center justify-between px-1 py-1 border-t border-ink-100/70">
        <div className="inline-flex items-center">
          <button
            type="button"
            onClick={() => onNudge(index, -1)}
            disabled={index === 0}
            aria-label="Mover página a la izquierda"
            title="Mover a la izquierda"
            className={ctrlBtn}
          >
            <ChevronLeftIcon size={15} />
          </button>
          <button
            type="button"
            onClick={() => onNudge(index, 1)}
            disabled={index === total - 1}
            aria-label="Mover página a la derecha"
            title="Mover a la derecha"
            className={ctrlBtn}
          >
            <ChevronRightIcon size={15} />
          </button>
        </div>
        <OverflowMenu
          label={`Acciones de la página ${index + 1}`}
          width="w-48"
          triggerClassName={ctrlBtn}
        >
          {(close) => (
            <>
              <OverflowMenuItem
                onClick={() => {
                  onOpenText()
                  close()
                }}
              >
                <TextIcon size={13} />{' '}
                {pageHasAnnotations(page) ? 'Editar texto' : 'Agregar texto'}
              </OverflowMenuItem>
              <OverflowMenuItem
                onClick={() => {
                  onRotate(1)
                  close()
                }}
              >
                <RotateIcon size={13} /> Rotar a la derecha
              </OverflowMenuItem>
              <OverflowMenuItem
                onClick={() => {
                  onRotate(-1)
                  close()
                }}
              >
                <span className="inline-flex" style={{ transform: 'scaleX(-1)' }}>
                  <RotateIcon size={13} />
                </span>{' '}
                Rotar a la izquierda
              </OverflowMenuItem>
              <OverflowMenuItem
                onClick={() => {
                  onDuplicate()
                  close()
                }}
              >
                <DuplicateIcon size={13} /> Duplicar página
              </OverflowMenuItem>
              <OverflowMenuItem
                onClick={() => {
                  onPrint()
                  close()
                }}
              >
                <PrinterIcon size={13} /> Imprimir página
              </OverflowMenuItem>
              <OverflowMenuItem
                danger
                onClick={() => {
                  onDelete(index)
                  close()
                }}
              >
                <TrashIcon size={13} /> Eliminar página
              </OverflowMenuItem>
            </>
          )}
        </OverflowMenu>
      </div>
    </li>
  )
}
