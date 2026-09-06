import type { ReactNode } from 'react'
import { ModalFooter, ModalShell } from './ModalShell'

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
  if (!open) return null

  // Mientras la acción está en vuelo no se puede cancelar a medias: ni por
  // Escape ni por el backdrop. ModalShell aporta portal, backdrop, foco y
  // scroll; acá solo queda el contenido.
  const cancel = pending ? () => {} : onCancel

  return (
    <ModalShell
      role="alertdialog"
      ariaLabel={title}
      size="xs"
      lockScroll={false}
      closeOnEscape={!pending}
      backdropLabel="Cancelar"
      onClose={cancel}
    >
      <div className="px-5 py-4 space-y-2">
        <p className="section-eyebrow-serif" style={{ color: 'var(--accent-clay)' }}>
          acción irreversible
        </p>
        <h3 className="font-serif text-lg text-ink-800 leading-tight">{title}</h3>
        {body && <p className="text-body text-ink-400 leading-relaxed">{body}</p>}
      </div>
      <ModalFooter>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="section-eyebrow hover:text-ink-700 transition-colors disabled:opacity-60"
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
      </ModalFooter>
    </ModalShell>
  )
}
