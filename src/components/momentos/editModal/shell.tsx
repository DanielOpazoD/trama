import {
  ModalShell as BaseModalShell,
  ModalFooter as BaseModalFooter,
} from '../../ModalShell'
import { Button } from '../../Button'

/**
 * Primitivas de los 3 sub-modales de edición de momentos (NotaEditModal,
 * RecorteEditModal, FotoEditModal).
 *
 * Tras unificar el chrome de modales, ModalShell y el footer delegan en los
 * primitivos genéricos (`components/ModalShell` + `components/Button`); este
 * módulo solo conserva las FIRMAS específicas de momentos (eyebrow/title
 * obligatorios; footer cancelar + un único botón de guardar) para no tener que
 * tocar los tres sub-modales. CapturedAtField sigue siendo propio de momentos.
 */

/** Overlay + dialog con header obligatorio (eyebrow + título) de momentos. */
export function ModalShell({
  ariaLabel,
  eyebrow,
  title,
  children,
  onClose,
}: {
  ariaLabel: string
  eyebrow: string
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <BaseModalShell
      ariaLabel={ariaLabel}
      eyebrow={eyebrow}
      title={title}
      onClose={onClose}
    >
      {children}
    </BaseModalShell>
  )
}

/** Campo de fecha — usado por los 3 sub-modales. */
export function CapturedAtField({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className="block space-y-1">
      <label htmlFor="captured-at" className="section-eyebrow">
        fecha y hora del momento
      </label>
      <input
        id="captured-at"
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-paper w-full text-sm tabular-nums"
        disabled={disabled}
      />
    </div>
  )
}

/** Footer con cancelar + botón de save (firma de momentos). */
export function ModalFooter({
  onClose,
  onSave,
  saveLabel,
  saving,
  saveDisabled,
}: {
  onClose: () => void
  onSave: () => void
  saveLabel: string
  saving: boolean
  saveDisabled?: boolean
}) {
  return (
    <BaseModalFooter>
      <Button variant="quiet" onClick={onClose} disabled={saving}>
        cancelar
      </Button>
      <Button
        variant="accent"
        className="text-xs"
        onClick={onSave}
        loading={saving}
        loadingLabel="guardando…"
        disabled={saveDisabled}
      >
        {saveLabel}
      </Button>
    </BaseModalFooter>
  )
}
