import { useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, PrinterIcon } from '../../../../Icons'
import { IconButton } from '../../../../IconButton'
import { stepBtn } from '../../editor/editorStyle'
import { ZoomPercentInput } from '../../editor/ZoomPercentInput'

export function PdfTemplateFillHeader({
  completedFields,
  currentPage,
  requiredPendingFields = 0,
  totalFields,
  totalPages,
  zoom,
  zoomInDisabled = false,
  zoomOutDisabled = false,
  onClose,
  onGuidedFill,
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
  /** Requeridos aún vacíos: imprimir pide confirmación mientras haya alguno. */
  requiredPendingFields?: number
  totalFields: number
  totalPages: number
  zoom: number
  zoomInDisabled?: boolean
  zoomOutDisabled?: boolean
  onClose: () => void
  /** Salta al primer campo pendiente; Enter sigue avanzando desde ahí. */
  onGuidedFill?: () => void
  onNextPage: () => void
  onPrevPage: () => void
  onPrepareZoomAnchor: () => void
  onPrint: () => void
  onSaveCopy?: () => void
  onZoomChange: (zoom: number) => void
  onZoomIn: () => void
  onZoomOut: () => void
}) {
  const [confirmingPrint, setConfirmingPrint] = useState(false)
  const pending = Math.max(0, totalFields - completedFields)
  const hasData = completedFields > 0
  const needsPreflight = requiredPendingFields > 0
  const status =
    totalFields === 0
      ? 'Sin campos para llenar'
      : needsPreflight
        ? `${requiredPendingFields} ${requiredPendingFields === 1 ? 'requerido vacío' : 'requeridos vacíos'}`
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
          {totalFields > 0 ? (
            <div
              role="progressbar"
              aria-label="Progreso del llenado"
              aria-valuemin={0}
              aria-valuemax={totalFields}
              aria-valuenow={completedFields}
              className="mt-1 h-[3px] w-40 max-w-full overflow-hidden rounded-full bg-ink-100/80"
            >
              <div
                className="h-full rounded-full bg-[color:var(--accent-sage)] transition-[width] duration-200"
                style={{ width: `${(completedFields / totalFields) * 100}%` }}
              />
            </div>
          ) : null}
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
        {onGuidedFill && totalFields > 0 && pending > 0 ? (
          <button
            type="button"
            onClick={onGuidedFill}
            aria-label="Ir al siguiente campo pendiente"
            title="Salta al siguiente campo pendiente. Enter avanza, ⇧Enter retrocede."
            className="btn-ghost text-xs"
          >
            {hasData ? 'Siguiente pendiente ⏎' : 'Empezar a llenar ⏎'}
          </button>
        ) : null}
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
        {confirmingPrint && needsPreflight ? (
          <div
            role="group"
            aria-label="Confirmar impresión con requeridos vacíos"
            className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--accent-clay)]/30 bg-[color:var(--accent-clay)]/5 px-2 py-1"
          >
            <span className="text-micro font-medium text-[color:var(--accent-clay)]">
              {requiredPendingFields === 1
                ? 'Falta 1 requerido'
                : `Faltan ${requiredPendingFields} requeridos`}
            </span>
            <button
              type="button"
              onClick={() => setConfirmingPrint(false)}
              className="btn-ghost h-6 px-1.5 text-micro"
            >
              Seguir llenando
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingPrint(false)
                onPrint()
              }}
              aria-label="Imprimir igual con requeridos vacíos"
              className="btn-accent inline-flex h-6 items-center gap-1 px-2 text-micro"
            >
              <PrinterIcon size={11} />
              Imprimir igual
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => (needsPreflight ? setConfirmingPrint(true) : onPrint())}
            aria-label="Imprimir planilla"
            title={
              needsPreflight
                ? 'Hay campos requeridos sin completar: se pedirá confirmación'
                : 'Imprimir la copia rellenada'
            }
            className="btn-accent inline-flex items-center gap-1 text-xs"
          >
            <PrinterIcon size={12} />
            Imprimir
          </button>
        )}
      </div>
    </header>
  )
}
