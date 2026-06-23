import { createPortal } from 'react-dom'
import { useModalOverlay } from '../../../hooks/useModalOverlay'

/**
 * Primitivas compartidas por los 3 sub-modales de edición de momentos
 * (NotaEditModal, RecorteEditModal, FotoEditModal). Vivían inline en el
 * archivo monolítico anterior — al extraerlas a este módulo el código
 * por kind queda mucho más enfocado (solo state + fields + save).
 *
 * Lo que vive acá:
 *   - ModalShell: overlay + dialog box + header (eyebrow + título)
 *   - CapturedAtField: input datetime-local con label canónico
 *   - ModalFooter: cancelar + guardar
 *
 * Nada de state propio — todos reciben props del sub-modal padre.
 */

/**
 * Overlay + dialog. Delega focus trap, Escape-to-close, scroll-lock y
 * restauración de foco a `useModalOverlay` (mismo patrón que ConfirmDestroy
 * y CommandPalette). El modal solo se monta cuando está visible, así que
 * `open: true` mientras vive el componente.
 *
 * El Escape acá no tiene lógica propia ni guard de "cambios sin guardar":
 * los tres sub-modales pasan el mismo `onClose` para backdrop/Escape/cancelar
 * y el guardado llama a `onClose` por su cuenta. Por eso basta con enrutar
 * Escape a `onClose` vía el hook.
 */
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
  const overlay = useModalOverlay({ open: true, onClose })

  return createPortal(
    <div data-momento-modal-root="">
      <button
        onClick={onClose}
        aria-label="Cerrar"
        className="fixed inset-0 z-[120] bg-ink-900/40 backdrop-blur-sm cursor-default animate-fade-up"
        tabIndex={-1}
      />
      <div className="fixed inset-0 z-[130] flex items-center justify-center px-4 pointer-events-none">
        <div
          ref={overlay.dialogRef}
          role="dialog"
          aria-label={ariaLabel}
          aria-modal="true"
          className="pointer-events-auto w-full max-w-xl max-h-[90vh] overflow-y-auto border border-ink-100/80 rounded-xl shadow-xl shadow-ink-900/25"
          style={{ backgroundColor: 'rgb(var(--paper-50))' }}
        >
          <header className="px-5 py-3 border-b border-ink-100/60">
            <p className="section-eyebrow-serif" style={{ color: 'var(--accent-gold)' }}>
              {eyebrow}
            </p>
            <h3 className="font-serif text-xl text-ink-800 leading-tight mt-1">
              {title}
            </h3>
          </header>
          {children}
        </div>
      </div>
    </div>,
    document.body,
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

/** Footer con cancelar + botón de save. */
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
    <div className="px-5 py-3 border-t border-ink-100/60 flex justify-end gap-3">
      <button
        type="button"
        onClick={onClose}
        disabled={saving}
        className="section-eyebrow hover:text-ink-700 transition-colors disabled:opacity-60"
      >
        cancelar
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving || saveDisabled}
        className="btn-accent text-xs"
      >
        {saving ? 'guardando…' : saveLabel}
      </button>
    </div>
  )
}
