import {
  CheckIcon,
  CloseIcon,
  DuplicateIcon,
  PrinterIcon,
  RotateIcon,
  TextIcon,
  TrashIcon,
} from '../../Icons'

const ACCENT = 'var(--accent-sage)'
const barBtn =
  'touch-target inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-caption text-ink-600 hover:text-ink-800 hover:bg-paper-50/80 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-600 disabled:cursor-default transition-colors'

/**
 * Barra de EDICIÓN de hojas, SIEMPRE visible cuando hay páginas. Actúa sobre las
 * hojas MARCADAS con el tick: editar texto (1 sola), rotar, duplicar, eliminar, más
 * marcar todas / desmarcar. Las marcadas son además las que entran en "Guardar
 * PDF". Cada acción se habilita según cuántas haya marcadas. Presentacional: el
 * estado y los handlers viven en `PdfStudioView`.
 */
export function BulkBar({
  count,
  total,
  onEditText,
  onRotate,
  onDuplicate,
  onDelete,
  onExport,
  onSelectAll,
  onClear,
}: {
  count: number
  total: number
  /** Abre el editor de la única hoja marcada (habilitado sólo con count === 1). */
  onEditText: () => void
  onRotate: (delta: -1 | 1) => void
  onDuplicate: () => void
  onDelete: () => void
  /** Exporta SÓLO las hojas marcadas a PDF (abre el visor). */
  onExport: () => void
  onSelectAll: () => void
  onClear: () => void
}) {
  const none = count === 0
  return (
    <div
      role="toolbar"
      aria-label="Barra de edición de hojas"
      className="flex flex-wrap items-center gap-x-0.5 gap-y-2 rounded-lg border px-2 py-1.5"
      style={{
        borderColor: 'var(--accent-sage-soft)',
        backgroundColor: 'var(--accent-sage-soft)',
      }}
    >
      {!none && (
        <>
          <span
            className="px-1.5 text-caption font-medium tabular-nums"
            style={{ color: ACCENT }}
          >
            {count} {count === 1 ? 'marcada' : 'marcadas'}
          </span>
          <span className="mx-1 h-4 w-px bg-ink-200/60" aria-hidden />
        </>
      )}
      <button
        type="button"
        onClick={onEditText}
        disabled={count !== 1}
        title="Editar el texto de la hoja marcada (marcá 1 sola)"
        className={barBtn}
      >
        <TextIcon size={14} /> Texto
      </button>
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
