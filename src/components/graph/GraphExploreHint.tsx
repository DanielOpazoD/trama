import { CloseIcon } from '../Icons'

/**
 * Banner que aparece sobre el grafo cuando la trama está pesada (≥
 * `threshold` entidades) en modo "completo" y sugiere cambiar al modo
 * "exploratorio" — que solo pinta el vecindario del nodo focal y se
 * siente más liviano.
 *
 * Solo renderiza si pasa el threshold Y el usuario no lo dismisseó
 * antes; el dismiss persiste en localStorage (manejado por el caller).
 */
export function GraphExploreHint({
  entityCount,
  onSwitch,
  onDismiss,
}: {
  entityCount: number
  onSwitch: () => void
  onDismiss: () => void
}) {
  return (
    <div className="pointer-events-none absolute top-16 inset-x-0 z-10 flex justify-center px-3">
      <div
        className="pointer-events-auto flex items-start gap-3 pl-3 pr-1.5 py-2 bg-paper-50/95 border border-ink-100/70 rounded-lg text-xs text-ink-600 shadow-md max-w-md leading-snug"
        role="status"
      >
        <span className="flex-1">
          Tu trama ya pesa {entityCount.toLocaleString('es')} entidades. Probá{' '}
          <strong className="text-ink-700">explorar</strong> en la toolbar — pinta solo el
          vecindario del nodo focal y se siente más liviano.
        </span>
        <button
          onClick={onSwitch}
          className="shrink-0 px-2 py-0.5 rounded text-micro uppercase tracking-eyebrow text-ink-700 hover:bg-ink-50 transition-colors"
        >
          cambiar
        </button>
        <button
          onClick={onDismiss}
          aria-label="No recordar"
          className="shrink-0 p-1 -m-0.5 text-ink-300 hover:text-ink-700 rounded transition-colors"
        >
          <CloseIcon size={12} />
        </button>
      </div>
    </div>
  )
}
