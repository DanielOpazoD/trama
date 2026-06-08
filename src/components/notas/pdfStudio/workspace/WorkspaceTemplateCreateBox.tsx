import { CheckIcon, CloseIcon, PlusIcon } from '../../../Icons'

const ACCENT = 'var(--accent-sage)'
const rowBtn =
  'touch-target inline-flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:text-ink-800 hover:bg-ink-100/60 transition-colors'

export function WorkspaceTemplateCreateBox({
  canSaveTemplate,
  name,
  onCancel,
  onConfirm,
  onNameChange,
  onStart,
}: {
  canSaveTemplate: boolean
  name: string | null
  onCancel: () => void
  onConfirm: () => void
  onNameChange: (value: string) => void
  onStart: () => void
}) {
  return (
    <div
      role="group"
      aria-label="Crear plantilla"
      className="mx-2 mb-2 rounded-md border border-ink-100 bg-paper-50/75 px-2 py-1.5"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-caption font-medium text-ink-700">
          Crear plantilla
        </p>
        {name === null && (
          <button
            type="button"
            aria-label="Guardar planilla"
            onClick={onStart}
            disabled={!canSaveTemplate}
            title={
              canSaveTemplate
                ? 'Guardar la creación actual como planilla reusable (los datos de relleno no se guardan)'
                : 'Agrega campos especiales para poder guardar una planilla'
            }
            className="btn-ghost text-micro inline-flex items-center gap-1 disabled:opacity-40"
          >
            <PlusIcon size={11} /> Guardar
          </button>
        )}
      </div>

      {name !== null && (
        <div className="mt-1.5 flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onConfirm()
              else if (e.key === 'Escape') onCancel()
            }}
            placeholder="Nombre de la planilla"
            className="input-paper flex-1 min-w-0 text-caption px-2 py-1 rounded-md border border-ink-200"
          />
          <button
            type="button"
            onClick={onConfirm}
            aria-label="Guardar planilla"
            title="Guardar planilla"
            className={rowBtn}
            style={{ color: ACCENT }}
          >
            <CheckIcon size={14} />
          </button>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancelar"
            title="Cancelar"
            className={rowBtn}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
