import { useEffect, useMemo, useState } from 'react'
import { ViewHeader } from './ViewHeader'
import { ConfirmDestroy } from './ConfirmDestroy'
import {
  useInfiniteEntitiesQuery,
  useEntityRefsCountQuery,
  useDeleteEntity,
  useOffline,
  useReclassifyEntities,
  useUpdateEntityType,
} from '../state'
import { type Reclassification } from '../api'
import { EndMark } from './Icons'
import { ReclassifyPanel } from './ReclassifyPanel'
import { EmptyMessage } from './EmptyMessage'
import { EntityCardSkeleton, SkeletonList } from './Skeleton'
import { Folio } from './Folio'
import { useMainScrollVirtualizer } from '../hooks/useMainScrollVirtualizer'
import type { Entity } from '../types'
import { EntityForm } from './entities/EntityForm'
import { useEntitiesFilters } from './entities/useEntitiesFilters'
import { EntitiesFiltersBar } from './entities/EntitiesFiltersBar'
import { EntityRow } from './entities/EntityRow'
import { AIMenu } from './entities/AIMenu'

export function EntitiesView({
  onSelectEntity,
}: {
  onSelectEntity?: (id: string) => void
}) {
  // Paginated for the list view. La AI flow de reclasificar no consume
  // entidades del cliente — el endpoint las trae solo. quotes y rels siguen
  // wholesale para que quoteCountById/relCountById sean coherentes.
  const entitiesPaged = useInfiniteEntitiesQuery()
  const allLoadedEntities = useMemo(
    () => entitiesPaged.data?.pages.flatMap((p) => p.items) ?? [],
    [entitiesPaged.data],
  )

  // Filtro por tipo (chips arriba de la lista). null = todos.
  // Por ahora filtra client-side sobre las páginas ya cargadas; a 100k+
  // por type habría que mover el filtro al server. State y derivaciones
  // viven en `useEntitiesFilters` (FF3-b).
  const { typeFilter, setTypeFilter, availableTypes, entities } = useEntitiesFilters({
    allLoadedEntities,
  })
  // DD3: counts de citas + relaciones se traen pre-agregados desde el
  // server (un query con dos GROUP BY) en vez de descargar las listas
  // wholesome. A 100 entidades es invisible; a 10k+ ahorra MBs de payload.
  const { data: refsCount } = useEntityRefsCountQuery()
  const deleteEntity = useDeleteEntity()
  const reclassify = useReclassifyEntities()
  const updateType = useUpdateEntityType()
  const { offline } = useOffline()

  // Confirmación de borrado — antes usaba confirm() nativo.
  const [pendingDelete, setPendingDelete] = useState<Entity | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [pending, setPending] = useState<Reclassification[] | null>(null)
  const [emptyHint, setEmptyHint] = useState(false)
  // Inline expansion — solo una entidad expandida a la vez. Si el
  // usuario expande otra, la actual colapsa. El virtualizer mide la
  // altura dinámicamente via measureElement.
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const quoteCountById = useMemo(() => {
    const map = new Map<string, number>()
    if (refsCount) {
      for (const [id, c] of refsCount) map.set(id, c.quoteCount)
    }
    return map
  }, [refsCount])
  const relCountById = useMemo(() => {
    const map = new Map<string, number>()
    if (refsCount) {
      for (const [id, c] of refsCount) map.set(id, c.relCount)
    }
    return map
  }, [refsCount])

  const { listRef, virtualizer } = useMainScrollVirtualizer({
    count: entities.length,
    estimateSize: 88,
    overscan: 10,
    deps: [showForm, entities.length, pending !== null, emptyHint],
  })

  // Fetch next page when the virtualizer enters the last few items.
  const virtualItems = virtualizer.getVirtualItems()
  const lastVisibleIndex =
    virtualItems.length > 0 ? virtualItems[virtualItems.length - 1]!.index : 0
  useEffect(() => {
    if (!entitiesPaged.hasNextPage || entitiesPaged.isFetchingNextPage) return
    if (entities.length === 0) return
    if (lastVisibleIndex >= entities.length - 5) {
      entitiesPaged.fetchNextPage()
    }
  }, [lastVisibleIndex, entities.length, entitiesPaged])

  async function handleReclassify() {
    setEmptyHint(false)
    try {
      const res = await reclassify.mutateAsync()
      if (res.reclassifications.length === 0) {
        setEmptyHint(true)
        return
      }
      setPending(res.reclassifications)
    } catch {
      // surfaces via reclassify.error
    }
  }

  return (
    <>
      {/* ρ-struct: header con h2 + acciones EN LA MISMA FILA. Antes el
          h2 vivía en EntitiesWorkbench y las acciones flotaban abajo
          alineadas a la derecha — quedaban "huérfanas" visualmente.
          Ahora "Reclasificar con IA" y "Añadir" están a la altura del
          título, lo que pidió el usuario en el sprint ρ. La descripción
          de la sección bajó debajo del h2 (sigue siendo identidad
          editorial) y la accent-rule mantiene la firma cromática. */}
      <ViewHeader
        title="Entidades"
        eyebrow="personas, obras, conceptos"
        accent="var(--type-persona)"
        eyebrowColor="var(--accent-gold)"
        spacing="normal"
        subtitle="Las cosas que conectas: personas, libros, canciones, álbumes, películas, obras, conceptos, ideas. Cada nodo del grafo es una entidad."
        action={
          <div className="flex items-center gap-3 mt-1">
            {entities.length > 0 && (
              <AIMenu
                onReclassify={handleReclassify}
                reclassifyPending={reclassify.isPending}
                disabled={offline}
              />
            )}
            <button
              onClick={() => setShowForm((s) => !s)}
              className="text-xs uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
            >
              {showForm ? 'Cerrar' : 'Añadir'}
            </button>
          </div>
        }
      />

      {reclassify.error && (
        <div className="alert-error mb-6 px-4 py-3 rounded-xl text-sm">
          {reclassify.error.message}
        </div>
      )}
      {emptyHint && !reclassify.isPending && (
        <div className="card-paper-soft mb-6 px-4 py-3 text-sm text-ink-500 leading-relaxed">
          La IA no encontró mejores clasificaciones. Si hay alguna entidad obviamente mal
          tipada, puedes corregirla a mano (próximamente desde el detalle).
        </div>
      )}
      {pending && (
        <ReclassifyPanel
          proposals={pending}
          onClose={() => setPending(null)}
          onApply={async (selected) => {
            // Fire updates sequentially to avoid hitting the same row twice.
            for (const r of selected) {
              try {
                await updateType.mutateAsync({ id: r.id, type: r.newType })
              } catch {
                /* skip; surface in mutation state */
              }
            }
            setPending(null)
          }}
        />
      )}

      {showForm && (
        <EntityForm
          onClose={() => setShowForm(false)}
          onSelectEntity={onSelectEntity}
          allLoadedEntities={allLoadedEntities}
        />
      )}

      {/* Filtro por tipo. Solo aparece si hay más de un tipo en la trama.
          La barra desaparece al scrollear como cualquier sección normal
          (no-sticky por diseño). State y derivaciones viven en
          `useEntitiesFilters`; el chrome presentacional en
          `EntitiesFiltersBar` (FF3-b). */}
      <EntitiesFiltersBar
        availableTypes={availableTypes}
        totalCount={allLoadedEntities.length}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
      />

      {entitiesPaged.isLoading ? (
        <div className="space-y-2">
          <SkeletonList count={6} Component={EntityCardSkeleton} />
        </div>
      ) : entities.length === 0 ? (
        <EmptyMessage
          illustration="weave"
          title="Todavía nadie habita la trama."
          body={
            <>
              Las entidades son los nudos: las personas, los libros, las canciones, los
              conceptos que vale la pena retener. La trama crece alrededor de ellos.
            </>
          }
          hint="Pega un párrafo en la barra de abajo y la IA propone las primeras."
        />
      ) : (
        <div
          ref={listRef}
          style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const entity = entities[virtualRow.index]
            if (!entity) return null
            const quoteCount = quoteCountById.get(entity.id) ?? 0
            const relCount = relCountById.get(entity.id) ?? 0
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                  paddingBottom: '0.5rem',
                }}
              >
                <EntityRow
                  entity={entity}
                  quoteCount={quoteCount}
                  relCount={relCount}
                  expanded={expandedId === entity.id}
                  onToggleExpand={() => {
                    setExpandedId((cur) => (cur === entity.id ? null : entity.id))
                  }}
                  onSelectEntity={onSelectEntity}
                  onDelete={() => setPendingDelete(entity)}
                />
              </div>
            )
          })}
        </div>
      )}
      {entitiesPaged.isFetchingNextPage && (
        <p className="mt-4 text-center text-xs uppercase tracking-eyebrow text-ink-300">
          cargando más…
        </p>
      )}
      {!entitiesPaged.hasNextPage && !entitiesPaged.isLoading && entities.length >= 5 && (
        <div className="flex justify-center mt-8 mb-2 text-ink-300">
          <EndMark size={14} />
        </div>
      )}
      {/* ι5: folio number flotante — fade-in al scrollear. Muestra el
          índice del último item visible vs el total. */}
      <Folio
        current={Math.min(lastVisibleIndex + 1, entities.length)}
        total={entities.length}
      />

      <ConfirmDestroy
        open={pendingDelete !== null}
        title={
          pendingDelete ? `¿Eliminar “${pendingDelete.name}”?` : '¿Eliminar entidad?'
        }
        body="Sus citas y relaciones también desaparecen del catálogo. No se borra del todo — si te arrepientes, se puede restaurar."
        confirmLabel="Eliminar"
        pending={deleteEntity.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return
          try {
            await deleteEntity.mutateAsync(pendingDelete.id)
            setPendingDelete(null)
          } catch {
            /* mutation error queda en deleteEntity.error */
          }
        }}
      />
    </>
  )
}
