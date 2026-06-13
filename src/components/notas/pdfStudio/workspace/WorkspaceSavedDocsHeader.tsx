import { FilePdfIcon, PlusIcon } from '../../../Icons'

export function WorkspaceSavedDocsHeader({
  canSave,
  count,
  onStartSave,
}: {
  canSave: boolean
  count: number
  onStartSave?: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 pt-2 pb-0.5">
      <h3 className="section-eyebrow-serif flex items-center gap-1.5 text-ink-400">
        <FilePdfIcon size={12} />
        PDFs y copias
        <span className="text-ink-300 tabular-nums">({count})</span>
      </h3>
      {onStartSave && (
        <button
          type="button"
          onClick={onStartSave}
          disabled={!canSave}
          className="btn-ghost text-micro inline-flex items-center gap-1 disabled:opacity-40"
        >
          <PlusIcon size={11} /> Guardar
        </button>
      )}
    </div>
  )
}
