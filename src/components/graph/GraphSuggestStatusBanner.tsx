import { CloseIcon } from '../Icons'

/**
 * Banner flotante sobre el grafo que comunica el resultado de
 * `useSuggestRelationships`:
 *   - Si hubo un error: estilo `alert-error` con el mensaje del backend
 *     o del fetch.
 *   - Si no hubo error pero el LLM no devolvió pares nuevos: estilo
 *     neutro con una explicación amable.
 *
 * El caller maneja el auto-dismiss (timer) y la limpieza de estado al
 * cerrar — acá solo recibimos lo que mostrar y un `onClose`.
 */
export function GraphSuggestStatusBanner({
  error,
  onClose,
}: {
  /** Si hay error, mostramos `error.message` en rojo; si es null y el
   *  banner está visible, asumimos "sin relaciones nuevas". */
  error: Error | null
  onClose: () => void
}) {
  const isError = Boolean(error)
  return (
    <div className="pointer-events-none absolute top-16 inset-x-0 z-10 flex justify-center px-3">
      <div
        className={
          isError
            ? 'alert-error pointer-events-auto flex items-start gap-2 pl-3 pr-1.5 py-1.5 text-xs shadow-md max-w-xs'
            : 'pointer-events-auto flex items-start gap-2 pl-3 pr-1.5 py-1.5 bg-paper-50/95 border border-ink-100/70 rounded-lg text-xs text-ink-500 shadow-md max-w-xs leading-snug'
        }
        role="status"
      >
        <span className="flex-1">
          {error
            ? error.message
            : 'Sin relaciones nuevas obvias. Añade citas o descripciones para darle más contexto.'}
        </span>
        <button
          onClick={onClose}
          aria-label="Cerrar aviso"
          className={
            isError
              ? 'shrink-0 p-1 -m-0.5 text-red-600 hover:text-red-900 rounded transition-colors'
              : 'shrink-0 p-1 -m-0.5 text-ink-300 hover:text-ink-700 rounded transition-colors'
          }
        >
          <CloseIcon size={12} />
        </button>
      </div>
    </div>
  )
}
