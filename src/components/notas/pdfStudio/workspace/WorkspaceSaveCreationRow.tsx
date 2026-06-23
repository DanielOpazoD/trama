import { CheckIcon, CloseIcon } from '../../../Icons'
import { IconButton } from '../../../IconButton'

const rowBtn =
  'touch-target inline-flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:text-ink-800 hover:bg-ink-100/60 transition-colors'

export function WorkspaceSaveCreationRow({
  name,
  onCancel,
  onChangeName,
  onConfirm,
}: {
  name: string
  onCancel: () => void
  onChangeName: (name: string) => void
  onConfirm: () => void
}) {
  return (
    <div className="flex items-center gap-1 px-2.5 pb-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => onChangeName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onConfirm()
          else if (e.key === 'Escape') onCancel()
        }}
        aria-label="Nombre de la creación"
        placeholder="Nombre de la creación"
        className="input-paper flex-1 min-w-0 text-caption px-2 py-1 rounded-md border border-ink-200"
      />
      <IconButton
        onClick={onConfirm}
        label="Guardar"
        className={`${rowBtn} text-[color:var(--accent-sage)]`}
      >
        <CheckIcon size={14} />
      </IconButton>
      <IconButton onClick={onCancel} label="Cancelar" className={rowBtn}>
        <CloseIcon size={14} />
      </IconButton>
    </div>
  )
}
