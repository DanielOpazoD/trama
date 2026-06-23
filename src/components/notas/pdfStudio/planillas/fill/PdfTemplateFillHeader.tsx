import { ChevronLeftIcon, ChevronRightIcon, PrinterIcon } from '../../../../Icons'
import { IconButton } from '../../../../IconButton'
import { stepBtn } from '../../editor/editorStyle'
import { ZoomPercentInput } from '../../editor/ZoomPercentInput'

export function PdfTemplateFillHeader({
  completedFields,
  currentPage,
  totalFields,
  totalPages,
  zoom,
  zoomInDisabled = false,
  zoomOutDisabled = false,
  onClose,
  onNextPage,
  onPrevPage,
  onPrepareZoomAnchor,
  onPrint,
  onSaveCopy,
  onZoomChange,
  onZoomIn,
  onZoomOut,
}: {
  completedFields: number
  currentPage: number
  totalFields: number
  totalPages: number
  zoom: number
  zoomInDisabled?: boolean
  zoomOutDisabled?: boolean
  onClose: () => void
  onNextPage: () => void
  onPrevPage: () => void
  onPrepareZoomAnchor: () => void
  onPrint: () => void
  onSaveCopy?: () => void
  onZoomChange: (zoom: number) => void
  onZoomIn: () => void
  onZoomOut: () => void
}) {
  const pending = Math.max(0, totalFields - completedFields)
  const hasData = completedFields > 0
  const status =
    totalFields === 0
      ? 'Sin campos para llenar'
      : pending === 0
        ? 'Lista para imprimir'
        : `${completedFields} de ${totalFields} campos completos`

  return (
    <header
      role="banner"
      aria-label="Rellenar planilla"
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
          <p className="truncate text-sm font-semibold text-ink-800">Rellenar planilla</p>
          <p className="truncate text-micro text-ink-400">
            Solo relleno · Página {currentPage + 1} de {totalPages} · {status}
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
        <button
          type="button"
          onClick={onClose}
          aria-label={hasData ? 'Cerrar sin guardar datos' : 'Cerrar'}
          className="btn-ghost text-xs"
        >
          {hasData ? 'Cerrar sin guardar' : 'Cerrar'}
        </button>
        {onSaveCopy ? (
          <button
            type="button"
            onClick={onSaveCopy}
            disabled={completedFields === 0}
            aria-label="Guardar copia con datos"
            className="btn-ghost text-xs"
          >
            Guardar copia con datos
          </button>
        ) : null}
        <button
          type="button"
          onClick={onPrint}
          aria-label="Imprimir planilla"
          className="btn-accent inline-flex items-center gap-1 text-xs"
        >
          <PrinterIcon size={12} />
          Imprimir
        </button>
      </div>
    </header>
  )
}
