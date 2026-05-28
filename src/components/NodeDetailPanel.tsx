import { useEffect } from 'react'
import { useEntitiesQuery } from '../state'
import { ConnectionsList } from './nodeDetail/ConnectionsList'
import { DeleteFooter } from './nodeDetail/DeleteFooter'
import { DescriptionEditor } from './nodeDetail/DescriptionEditor'
import { EntityHeader } from './nodeDetail/EntityHeader'
import { EssayEditor } from './nodeDetail/EssayEditor'
import { QuickNoteForm } from './nodeDetail/QuickNoteForm'
import { QuotesList } from './nodeDetail/QuotesList'
import { TalkButton } from './nodeDetail/TalkButton'
import { VozDe } from './nodeDetail/VozDe'

/**
 * Panel lateral con el detalle de UNA entidad.
 *
 * Orquesta subcomponentes en `nodeDetail/` — cada uno maneja su propio
 * drafting state y conoce los hooks de mutación que necesita. Acá solo
 * resolvemos la entidad por id, manejamos Escape para cerrar y montamos
 * las secciones en orden.
 *
 * Vista vacía: si el id no corresponde a una entidad (raro, pero
 * posible si el id viene de un deep-link viejo), mostramos un placeholder
 * con "cerrar".
 */
export function NodeDetailPanel({
  entityId,
  onClose,
  onOpenThread,
}: {
  entityId: string
  onClose: () => void
  /** Opens ChatView with a specific thread. Used by "hablar con esta
      entidad" — encontramos o creamos el hilo de la entidad y enrutamos. */
  onOpenThread?: (threadId: string) => void
}) {
  const { data: entities = [] } = useEntitiesQuery()
  const entity = entities.find((e) => e.id === entityId)

  // Escape cierra el panel. Los subcomponentes manejan sus propios escapes
  // (e.g. salir de editing) sin propagar hasta acá, así que es seguro
  // siempre cerrar acá.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  if (!entity) {
    return (
      <div className="h-full flex flex-col p-5">
        <p className="text-ink-300 italic">Entidad no encontrada.</p>
        <button onClick={onClose} className="btn-ghost mt-3 self-start">
          cerrar
        </button>
      </div>
    )
  }

  return (
    <div
      className="h-full flex flex-col"
      role="region"
      aria-label={`Detalle de ${entity.name}`}
    >
      <EntityHeader entity={entity} onClose={onClose} />

      {/* Acción IA primaria fuera del header para que tenga su espacio
          y el título no compita con ella por ancho. */}
      {onOpenThread && <TalkButton entity={entity} onOpenThread={onOpenThread} />}

      {/* θ1: padding horizontal px-6 (era p-5=20px) para acompañar el
          ancho 520px del panel. space-y-8 entre secciones grandes para
          que respiren como capítulos de un libro. */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
        <DescriptionEditor entity={entity} />
        <EssayEditor entity={entity} />
        <QuickNoteForm entity={entity} />
        <QuotesList entity={entity} />
        <VozDe entity={entity} />
        <ConnectionsList entity={entity} />
      </div>

      <DeleteFooter entity={entity} onClose={onClose} />
    </div>
  )
}
