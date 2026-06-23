import { pdfCommandTooltip } from '../../../../../lib/pdfStudio/model/commands'
import { ChevronLeftIcon, ChevronRightIcon, RedoIcon, UndoIcon } from '../../../../Icons'
import { IconButton } from '../../../../IconButton'
import { stepBtn } from '../../editor/editorStyle'
import { ZoomPercentInput } from '../../editor/ZoomPercentInput'

function isMacLike(): boolean {
  if (typeof navigator === 'undefined') return true
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function PdfTemplateDesignHeader({
  currentPage,
  fieldCount,
  redoable,
  totalPages,
  undoable,
  zoom,
  zoomInDisabled = false,
  zoomOutDisabled = false,
  onApply,
  onClose,
  onCreateField,
  onNextPage,
  onPrepareZoomAnchor,
  onPrevPage,
  onRedo,
  onUndo,
  onZoomChange,
  onZoomIn,
  onZoomOut,
}: {
  currentPage: number
  fieldCount: number
  redoable: boolean
  totalPages: number
  undoable: boolean
  zoom: number
  zoomInDisabled?: boolean
  zoomOutDisabled?: boolean
  onApply: () => void
  onClose: () => void
  onCreateField: () => void
  onNextPage: () => void
  onPrepareZoomAnchor: () => void
  onPrevPage: () => void
  onRedo: () => void
  onUndo: () => void
  onZoomChange: (zoom: number) => void
  onZoomIn: () => void
  onZoomOut: () => void
}) {
  const isMac = isMacLike()
  const fieldLabel = `${fieldCount} ${fieldCount === 1 ? 'casillero' : 'casilleros'}`
  const closeLabel = fieldCount > 0 ? 'Guardar y cerrar' : 'Cerrar'
  const primaryAction =
    fieldCount === 0
      ? { label: 'Crear casillero', onClick: onCreateField }
      : { label: 'Aplicar casilleros', onClick: onApply }

  return (
    <header
      role="banner"
      aria-label="Crear plantilla"
      className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-100/70 bg-paper-50/95 px-3 py-2 shadow-sm shadow-ink-900/5"
    >
      <div className="flex min-w-0 items-center gap-1">
        <IconButton
          onClick={onPrevPage}
          disabled={currentPage === 0}
          label="Página anterior"
          title="Página anterior"
          className={stepBtn}
        >
          <ChevronLeftIcon size={14} />
        </IconButton>
        <div className="min-w-0 px-1">
          <p className="truncate text-sm font-semibold text-ink-800">Crear plantilla</p>
          <p className="truncate text-micro text-ink-400">
            Página {currentPage + 1} de {totalPages} · {fieldLabel}
          </p>
        </div>
        <IconButton
          onClick={onNextPage}
          disabled={currentPage === totalPages - 1}
          label="Página siguiente"
          title="Página siguiente"
          className={stepBtn}
        >
          <ChevronRightIcon size={14} />
        </IconButton>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div
          className="inline-flex items-center overflow-hidden rounded-md border border-ink-100 bg-paper-50"
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
        <div className="inline-flex items-center overflow-hidden rounded-md border border-ink-100 bg-paper-50 divide-x divide-ink-100">
          <IconButton
            onClick={onUndo}
            disabled={!undoable}
            label="Deshacer"
            title={pdfCommandTooltip('undo', isMac)}
            className={stepBtn}
          >
            <UndoIcon size={14} />
          </IconButton>
          <IconButton
            onClick={onRedo}
            disabled={!redoable}
            label="Rehacer"
            title={pdfCommandTooltip('redo', isMac)}
            className={stepBtn}
          >
            <RedoIcon size={14} />
          </IconButton>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="btn-ghost text-xs"
        >
          {closeLabel}
        </button>
        <button
          type="button"
          onClick={primaryAction.onClick}
          className="btn-accent text-xs"
        >
          {primaryAction.label}
        </button>
      </div>
    </header>
  )
}
