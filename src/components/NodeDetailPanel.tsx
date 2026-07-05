import { useEffect, useState } from 'react'
import { useEntitiesQuery } from '../state'
import { ConnectionsList } from './nodeDetail/ConnectionsList'
import { DescriptionEditor } from './nodeDetail/DescriptionEditor'
import { EntityHeader } from './nodeDetail/EntityHeader'
import { QuotesList } from './nodeDetail/QuotesList'
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

  // Edición de la descripción: el display vive en el header, el form se monta
  // como primera sección del body cuando esto es true. Se dispara desde el
  // menú ⋯ o con doble-clic sobre la descripción. Se resetea al cambiar de
  // entidad (navegar entre conexiones sin desmontar el panel).
  const [editingDescription, setEditingDescription] = useState(false)
  useEffect(() => {
    setEditingDescription(false)
  }, [entityId])

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
      <EntityHeader
        entity={entity}
        onClose={onClose}
        onOpenThread={onOpenThread}
        onEditDescription={() => setEditingDescription(true)}
        editingDescription={editingDescription}
      />

      {/* Secciones del panel. Columna flex: el bloque principal arriba y
          Conexiones anclada al fondo (mt-auto) para que quede al final del
          panel aunque haya poco contenido. Con scroll, fluye normalmente. */}
      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col">
        <div className="space-y-6">
          {editingDescription && (
            <DescriptionEditor
              entity={entity}
              onDone={() => setEditingDescription(false)}
            />
          )}
          {entity.essay && (
            <section>
              <h3 className="section-eyebrow-serif mb-2">Ensayo</h3>
              {/* El ensayo largo como cuerpo de libro: serif, leading
                  relajado, respetando los saltos de línea del texto. */}
              <p className="whitespace-pre-wrap font-serif text-body leading-relaxed text-ink-600">
                {entity.essay}
              </p>
            </section>
          )}
          <QuotesList entity={entity} />
          <VozDe entity={entity} />
        </div>
        <div className="mt-auto pt-6">
          <ConnectionsList entity={entity} />
        </div>
      </div>
    </div>
  )
}
