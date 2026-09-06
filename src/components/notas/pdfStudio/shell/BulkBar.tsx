import {
  CheckIcon,
  CropIcon,
  DuplicateIcon,
  PrinterIcon,
  RotateIcon,
  TrashIcon,
} from '../../../Icons'
import { CloseButton } from '../../../CloseButton'
import { IconButton } from '../../../IconButton'

const barBtn =
  'touch-target inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-caption text-ink-600 transition-colors hover:bg-ink-100/60 hover:text-ink-800 motion-reduce:transition-none'

const iconBtn =
  'touch-target inline-flex h-7 w-8 items-center justify-center rounded-md text-ink-600 transition-colors hover:bg-ink-100/60 hover:text-ink-800 motion-reduce:transition-none'

/**
 * Barra de edición de hojas — **flotante y contextual**.
 *
 * Antes vivía fija en el flujo del documento, ocupando su franja incluso sin
 * nada marcado: seis acciones apagadas y un rótulo "Hojas" que era un título
 * disfrazado de botón. Ahora aparece solo cuando hay hojas marcadas, igual que
 * la de la Biblioteca, y desaparece al desmarcar.
 *
 * Marcar la primera hoja se hace en la propia miniatura (su tick está siempre
 * visible) o con ⌘A / Ctrl+A, que ya existía y está documentado en la ayuda de
 * atajos; ocultar esta barra no deja ninguna acción sin camino.
 *
 * Detalles que cambian:
 *
 *   - **Los dos "Rotar" pasan a iconos direccionales.** Se veían dos botones con
 *     la palabra idéntica y la dirección solo estaba en el `aria-label`: la
 *     información existía y se le escondía justo a quien mira la pantalla.
 *   - **"Exportar" dice su alcance**: "Guardar 2 hojas". Antes convivía con
 *     "Guardar PDF" de la barra principal —dos verbos distintos para la misma
 *     acción con distinto alcance— sin que ninguno dijera sobre qué actuaba.
 *
 * Presentacional: el estado y los handlers viven en `PdfStudioView`.
 */
export function BulkBar({
  context = 'editor',
  count,
  total,
  onRotate,
  onDuplicate,
  onDelete,
  onExport,
  onCrop,
  onSelectAll,
  onClear,
}: {
  context?: 'editor' | 'templates'
  count: number
  total: number
  onRotate: (delta: -1 | 1) => void
  onDuplicate: () => void
  onDelete: () => void
  /** Exporta SÓLO las hojas marcadas a PDF (abre el visor). */
  onExport: () => void
  onCrop?: () => void
  onSelectAll: () => void
  onClear: () => void
}) {
  // Sin nada marcado la barra no existe: no hay sobre qué actuar.
  if (count === 0) return null

  const ariaLabel =
    context === 'templates' ? 'Barra de hojas base de planilla' : 'Barra de hojas de PDF'

  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      /* Centrado por márgenes automáticos, NO por `-translate-x-1/2`: los
         keyframes de `fade-up` terminan en `transform: translateY(0)` y
         borrarían el centrado en X. */
      className="fixed bottom-6 inset-x-0 z-40 mx-auto w-fit max-w-[calc(100%-2rem)] animate-fade-up"
    >
      <div
        className="flex flex-wrap items-center gap-x-1 gap-y-2 rounded-xl border border-ink-100/80 px-3 py-2 shadow-xl shadow-ink-900/15"
        style={{ backgroundColor: 'rgb(var(--paper-50))' }}
      >
        <span className="px-1.5 text-caption font-medium tabular-nums text-ink-700">
          {count} {count === 1 ? 'marcada' : 'marcadas'}
        </span>
        <span className="mx-1 h-4 w-px bg-ink-200/60" aria-hidden />

        <IconButton
          onClick={() => onRotate(-1)}
          label="Rotar a la izquierda"
          title="Rotar a la izquierda"
          className={iconBtn}
        >
          <span className="inline-flex" style={{ transform: 'scaleX(-1)' }}>
            <RotateIcon size={14} />
          </span>
        </IconButton>
        <IconButton
          onClick={() => onRotate(1)}
          label="Rotar a la derecha"
          title="Rotar a la derecha"
          className={iconBtn}
        >
          <RotateIcon size={14} />
        </IconButton>

        <button type="button" onClick={onDuplicate} className={barBtn}>
          <DuplicateIcon size={14} /> Duplicar
        </button>
        {onCrop ? (
          <button
            type="button"
            onClick={onCrop}
            aria-label="Recortar imagen"
            title="Recortar la hoja marcada como imagen"
            className={barBtn}
          >
            <CropIcon size={14} /> Recortar
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDelete}
          className={`${barBtn} hover:!bg-[color:var(--accent-clay-soft)] hover:!text-[color:var(--accent-clay)]`}
        >
          <TrashIcon size={14} /> Eliminar
        </button>

        <span className="mx-1 h-4 w-px bg-ink-200/60" aria-hidden />
        <button
          type="button"
          onClick={onExport}
          title="Descargar un PDF sólo con las hojas marcadas"
          className={barBtn}
        >
          <PrinterIcon size={14} /> Guardar {count} {count === 1 ? 'hoja' : 'hojas'}
        </button>

        {count < total && (
          <button type="button" onClick={onSelectAll} className={barBtn}>
            <CheckIcon size={14} /> Todo
          </button>
        )}
        <CloseButton
          onClick={onClear}
          label="Desmarcar todo"
          title="Desmarcar (Esc)"
          className={`${barBtn} !px-1.5`}
        />
      </div>
    </div>
  )
}
