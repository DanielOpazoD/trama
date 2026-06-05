import { CheckIcon, CloseIcon, DuplicateIcon, RotateIcon, TrashIcon } from '../../Icons'

const ACCENT = 'var(--accent-sage)'
const barBtn =
  'touch-target inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-caption text-ink-600 hover:text-ink-900 hover:bg-paper-50/80 disabled:opacity-40 disabled:hover:bg-transparent transition-colors'

/**
 * Barra de acciones en LOTE sobre las hojas marcadas (rotar, duplicar, eliminar;
 * marcar todas / desmarcar). Las hojas marcadas son además las que entran en
 * "Guardar PDF". Presentacional: el estado y los handlers viven en `PdfStudioView`.
 */
export function BulkBar({
  count,
  total,
  onRotate,
  onDuplicate,
  onDelete,
  onSelectAll,
  onClear,
}: {
  count: number
  total: number
  onRotate: (delta: -1 | 1) => void
  onDuplicate: () => void
  onDelete: () => void
  onSelectAll: () => void
  onClear: () => void
}) {
  return (
    <div
      role="toolbar"
      aria-label="Acciones para las hojas marcadas"
      className="flex flex-wrap items-center gap-x-0.5 gap-y-2 rounded-lg border px-2 py-1.5"
      style={{
        borderColor: 'var(--accent-primary-soft)',
        backgroundColor: 'var(--accent-primary-soft)',
      }}
    >
      <span
        className="text-caption font-medium px-1.5 tabular-nums"
        style={{ color: ACCENT }}
      >
        {count} {count === 1 ? 'marcada' : 'marcadas'}
      </span>
      <span className="mx-1 h-4 w-px bg-ink-200/60" aria-hidden />
      <button type="button" onClick={() => onRotate(-1)} className={barBtn}>
        <span className="inline-flex" style={{ transform: 'scaleX(-1)' }}>
          <RotateIcon size={14} />
        </span>
        Rotar
      </button>
      <button type="button" onClick={() => onRotate(1)} className={barBtn}>
        <RotateIcon size={14} /> Rotar
      </button>
      <button type="button" onClick={onDuplicate} className={barBtn}>
        <DuplicateIcon size={14} /> Duplicar
      </button>
      <button
        type="button"
        onClick={onDelete}
        className={`${barBtn} hover:!text-[color:var(--accent-clay)] hover:!bg-[color:var(--accent-clay-soft)]`}
      >
        <TrashIcon size={14} /> Eliminar
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
        aria-label="Desmarcar todo"
        title="Desmarcar (Esc)"
        className={`${barBtn} !px-1.5`}
      >
        <CloseIcon size={14} />
      </button>
    </div>
  )
}
