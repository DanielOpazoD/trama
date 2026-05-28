import { useEffect, useRef, type ReactNode } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'

/**
 * Modal de confirmación para acciones destructivas (eliminar entidad,
 * borrar momento, deshacer fusión, etc.). Unifica el patrón que algunas
 * vistas implementaban con confirm() nativo y otras saltaban directo.
 *
 * Estilo: editorial discreto. El bloque queda en el centro con el
 * mismo backdrop blur que las modales de edición; el botón destructivo
 * usa accent-clay y un poco más de peso visual que cancelar.
 *
 * Props mínimas:
 *   - open       boolean — controlado por el padre.
 *   - title      string — pregunta corta ("¿Eliminar esta cita?").
 *   - body?      detalles opcionales sobre qué ocurre y qué no.
 *   - confirmLabel  texto del botón destructivo (ej "Eliminar"). Default
 *                   "Eliminar".
 *   - onConfirm  callback. Si devuelve Promise, se muestra "eliminando…"
 *                hasta resolver.
 *   - onCancel   callback al cancelar (cierra el modal).
 *
 * Convención: el modal NUNCA cierra solo después de confirmar — el padre
 * decide si cerrar (típicamente en el .then del onConfirm). Esto deja
 * espacio para mostrar errores sin pisarse con la animación de cierre.
 */
export function ConfirmDestroy({
  open,
  title,
  body,
  confirmLabel = 'Eliminar',
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body?: ReactNode
  confirmLabel?: string
  /** Si el padre tiene su propio isPending (mutation), pasarlo acá para
      bloquear el modal y mostrar "eliminando…". */
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, open)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pending) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel, pending])

  if (!open) return null

  return (
    <>
      <button
        onClick={onCancel}
        disabled={pending}
        aria-label="Cancelar"
        className="fixed inset-0 z-40 bg-ink-900/40 backdrop-blur-sm cursor-default animate-fade-up disabled:cursor-not-allowed"
        tabIndex={-1}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none animate-fade-up">
        <div
          ref={dialogRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-destroy-title"
          className="pointer-events-auto w-full max-w-sm border border-ink-100/80 rounded-xl shadow-xl shadow-ink-900/25"
          style={{ backgroundColor: 'rgb(var(--paper-50))' }}
        >
          <div className="px-5 py-4 space-y-2">
            <p className="section-eyebrow-serif" style={{ color: 'var(--accent-clay)' }}>
              acción irreversible
            </p>
            <h3
              id="confirm-destroy-title"
              className="font-serif text-lg text-ink-800 leading-tight"
            >
              {title}
            </h3>
            {body && <p className="text-sm text-ink-400 leading-relaxed">{body}</p>}
          </div>
          <div className="px-5 py-3 border-t border-ink-100/60 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors disabled:opacity-60"
            >
              cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="px-3 py-1.5 text-xs font-medium rounded-md text-paper-50 transition-all duration-150 active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
              style={{ backgroundColor: 'var(--accent-clay)' }}
            >
              {pending ? 'eliminando…' : confirmLabel.toLowerCase()}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
