import { pdfCommandTooltip } from '../../../lib/pdfStudio/commands'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PrinterIcon,
  RedoIcon,
  UndoIcon,
} from '../../Icons'
import { stepBtn } from './editorStyle'
import { ZoomPercentInput } from './ZoomPercentInput'

function isMacLike(): boolean {
  if (typeof navigator === 'undefined') return true
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function PdfTextEditorHeader({
  currentPage,
  redoable,
  total,
  undoable,
  onCancel,
  onDone,
  onNextPage,
  onPrint,
  onPrevPage,
  onRedo,
  onUndo,
  onPrepareZoomAnchor,
  onZoomIn,
  onZoomOut,
  onZoomChange,
  primaryLabel = 'Listo',
  showHistory = true,
  showPrimaryAction = true,
  title,
  zoom,
  zoomInDisabled,
  zoomOutDisabled,
}: {
  currentPage: number
  redoable: boolean
  total: number
  undoable: boolean
  onCancel: () => void
  onDone: () => void
  onNextPage: () => void
  onPrint?: () => void
  onPrevPage: () => void
  onRedo: () => void
  onUndo: () => void
  onPrepareZoomAnchor?: () => void
  onZoomIn?: () => void
  onZoomOut?: () => void
  onZoomChange?: (zoom: number) => void
  primaryLabel?: string
  showHistory?: boolean
  showPrimaryAction?: boolean
  title?: string
  zoom?: number
  zoomInDisabled?: boolean
  zoomOutDisabled?: boolean
}) {
  const isMac = isMacLike()
  return (
    <header className="flex items-center justify-between gap-3 border-b border-ink-100/70 bg-paper-50/95 px-3 py-2 shadow-sm shadow-ink-900/5 shrink-0">
      <div className="flex items-center gap-1 min-w-0">
        <button
          type="button"
          onClick={onPrevPage}
          disabled={currentPage === 0}
          aria-label="Página anterior"
          title="Página anterior"
          className={stepBtn}
        >
          <ChevronLeftIcon size={16} />
        </button>
        <p className="text-sm font-medium text-ink-700 whitespace-nowrap">
          {title ? `${title} · ` : null}
          <span className="tabular-nums">
            Página {currentPage + 1}{' '}
            <span className="font-normal text-ink-400">de {total}</span>
          </span>
        </p>
        <button
          type="button"
          onClick={onNextPage}
          disabled={currentPage === total - 1}
          aria-label="Página siguiente"
          title="Página siguiente"
          className={stepBtn}
        >
          <ChevronRightIcon size={16} />
        </button>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onZoomIn && onZoomOut && onZoomChange && typeof zoom === 'number' ? (
          <div
            className="inline-flex items-center rounded-md border border-ink-100 bg-paper-50 overflow-hidden"
            aria-label="Zoom del documento"
          >
            <button
              type="button"
              onPointerDown={onPrepareZoomAnchor}
              onMouseDown={onPrepareZoomAnchor}
              onFocus={onPrepareZoomAnchor}
              onClick={onZoomOut}
              disabled={zoomOutDisabled}
              aria-label="Zoom del documento: reducir"
              className={stepBtn}
            >
              -
            </button>
            <ZoomPercentInput
              zoom={zoom}
              onBeforeChange={onPrepareZoomAnchor}
              onZoomChange={onZoomChange}
            />
            <button
              type="button"
              onPointerDown={onPrepareZoomAnchor}
              onMouseDown={onPrepareZoomAnchor}
              onFocus={onPrepareZoomAnchor}
              onClick={onZoomIn}
              disabled={zoomInDisabled}
              aria-label="Zoom del documento: aumentar"
              className={stepBtn}
            >
              +
            </button>
          </div>
        ) : null}
        {showHistory ? (
          <div className="inline-flex items-center rounded-md border border-ink-100 bg-paper-50 overflow-hidden divide-x divide-ink-100">
            <button
              type="button"
              onClick={onUndo}
              disabled={!undoable}
              aria-label="Deshacer"
              title={pdfCommandTooltip('undo', isMac)}
              className={stepBtn}
            >
              <UndoIcon size={15} />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!redoable}
              aria-label="Rehacer"
              title={pdfCommandTooltip('redo', isMac)}
              className={stepBtn}
            >
              <RedoIcon size={15} />
            </button>
          </div>
        ) : null}
        <button onClick={onCancel} className="btn-ghost text-xs">
          Cerrar
        </button>
        {onPrint ? (
          <button
            onClick={onPrint}
            aria-label="Imprimir planilla"
            className="btn-accent inline-flex items-center gap-1 text-xs"
          >
            <PrinterIcon size={13} />
            Imprimir
          </button>
        ) : null}
        {showPrimaryAction ? (
          <button onClick={onDone} className="btn-accent text-xs">
            {primaryLabel}
          </button>
        ) : null}
      </div>
    </header>
  )
}
