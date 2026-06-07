import {
  CheckIcon,
  CloseIcon,
  DuplicateIcon,
  PrinterIcon,
  RotateIcon,
  TrashIcon,
} from '../../Icons'

const barBtn =
  'touch-target inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-caption text-ink-600 hover:text-ink-800 hover:bg-paper-50/80 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-600 disabled:cursor-default transition-colors'

/**
 * Barra de EDICIÓN de hojas, SIEMPRE visible cuando hay páginas. Actúa sobre las
 * hojas MARCADAS con el tick: rotar, duplicar, eliminar, exportar, marcar todas
 * / desmarcar. Presentacional: el estado y los handlers viven en `PdfStudioView`.
 */
export function BulkBar({
  context = 'editor',
  count,
  total,
  onRotate,
  onDuplicate,
  onDelete,
  onExport,
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
  onSelectAll: () => void
  onClear: () => void
}) {
  const none = count === 0
  const label = context === 'templates' ? 'Hojas base' : 'Hojas'
  const ariaLabel =
    context === 'templates' ? 'Barra de hojas base de planilla' : 'Barra de hojas de PDF'
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      className="flex flex-wrap items-center gap-x-0.5 gap-y-2 rounded-lg border border-ink-100 bg-paper-50/80 px-2 py-1.5 shadow-sm shadow-ink-900/5"
    >
      <span className="px-1.5 text-caption font-medium text-ink-500">{label}</span>
      {!none && (
        <>
          <span className="px-1.5 text-caption font-medium tabular-nums text-ink-500">
            {count} {count === 1 ? 'marcada' : 'marcadas'}
          </span>
          <span className="mx-1 h-4 w-px bg-ink-200/60" aria-hidden />
        </>
      )}
      <button
        type="button"
        onClick={() => onRotate(-1)}
        disabled={none}
        aria-label="Rotar a la izquierda"
        className={barBtn}
      >
        <span className="inline-flex" style={{ transform: 'scaleX(-1)' }}>
          <RotateIcon size={14} />
        </span>
        Rotar
      </button>
      <button
        type="button"
        onClick={() => onRotate(1)}
        disabled={none}
        aria-label="Rotar a la derecha"
        className={barBtn}
      >
        <RotateIcon size={14} /> Rotar
      </button>
      <button type="button" onClick={onDuplicate} disabled={none} className={barBtn}>
        <DuplicateIcon size={14} /> Duplicar
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={none}
        className={`${barBtn} hover:!bg-[color:var(--accent-clay-soft)] hover:!text-[color:var(--accent-clay)]`}
      >
        <TrashIcon size={14} /> Eliminar
      </button>
      <span className="mx-1 h-4 w-px bg-ink-200/60" aria-hidden />
      <button
        type="button"
        onClick={onExport}
        disabled={none}
        title="Abrir el visor para guardar/imprimir sólo las hojas marcadas"
        className={barBtn}
      >
        <PrinterIcon size={14} /> Exportar
      </button>
      <span className="flex-1" />
      <button
        type="button"
        onClick={onSelectAll}
        disabled={count === total}
        className={barBtn}
      >
        <CheckIcon size={14} /> Todo
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={none}
        aria-label="Desmarcar todo"
        title="Desmarcar (Esc)"
        className={`${barBtn} !px-1.5`}
      >
        <CloseIcon size={14} />
      </button>
    </div>
  )
}
