import { useEffect, useMemo, useRef, useState } from 'react'
import { ENTITY_TYPES } from '../types'
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
import { ChevronRightIcon, EndMark, SparkleIcon, TrashIcon } from './Icons'
import { ReclassifyPanel } from './ReclassifyPanel'
import { EmptyMessage } from './EmptyMessage'
import { EntityCardSkeleton, SkeletonList } from './Skeleton'
import { Folio } from './Folio'
import { typeAccent } from './graph/GraphNode'
import { useMainScrollVirtualizer } from '../hooks/useMainScrollVirtualizer'
import type { Entity } from '../types'
import { EntityForm } from './entities/EntityForm'
import { useEntitiesFilters } from './entities/useEntitiesFilters'
import { EntitiesFiltersBar } from './entities/EntitiesFiltersBar'

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
  const { typeFilter, setTypeFilter, availableTypes, entities } =
    useEntitiesFilters({ allLoadedEntities })
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
  const lastVisibleIndex = virtualItems.length > 0 ? virtualItems[virtualItems.length - 1]!.index : 0
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
        <div className="mb-6 px-4 py-3 bg-paper-100/60 border border-ink-100/60 rounded-xl text-sm text-ink-500 leading-relaxed">
          La IA no encontró mejores clasificaciones. Si hay alguna entidad obviamente mal tipada,
          puedes corregirla a mano (próximamente desde el detalle).
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
              Las entidades son los nudos: las personas, los libros, las
              canciones, los conceptos que vale la pena retener. La trama crece
              alrededor de ellos.
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
      {!entitiesPaged.hasNextPage &&
        !entitiesPaged.isLoading &&
        entities.length >= 5 && (
          <div className="flex justify-center mt-8 mb-2 text-ink-300">
            <EndMark size={14} />
          </div>
        )}
      {/* ι5: folio number flotante — fade-in al scrollear. Muestra el
          índice del último item visible vs el total. */}
      <Folio current={Math.min(lastVisibleIndex + 1, entities.length)} total={entities.length} />

      <ConfirmDestroy
        open={pendingDelete !== null}
        title={
          pendingDelete
            ? `¿Eliminar “${pendingDelete.name}”?`
            : '¿Eliminar entidad?'
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

function EntityRow({
  entity,
  quoteCount,
  relCount,
  expanded,
  onToggleExpand,
  onSelectEntity,
  onDelete,
}: {
  entity: Entity
  quoteCount: number
  relCount: number
  expanded: boolean
  onToggleExpand: () => void
  onSelectEntity?: (id: string) => void
  onDelete: () => void
}) {
  return (
    <div
      // viewTransitionName matchea con el EntityHeader del panel. Cuando
      // el usuario abre el panel, el browser anima del card al header.
      // Inline style porque viewTransitionName aún no está en CSSProperties.
      style={{ viewTransitionName: `entity-card-${entity.id}` } as React.CSSProperties}
      className="group relative"
    >
      <button
        type="button"
        onClick={onToggleExpand}
        style={{ borderLeftColor: typeAccent(entity.type) }}
        className={`card-paper-hover w-full text-left p-3 pl-4 border-l-[3px] hover:shadow-ink-900/5 active:scale-[0.995] ${
          expanded ? 'ring-1 ring-ink-100' : ''
        }`}
        aria-label={`Ver ${entity.name}, ${quoteCount} ${
          quoteCount === 1 ? 'cita' : 'citas'
        }`}
        aria-expanded={expanded}
      >
        <div className="flex justify-between items-baseline gap-4">
          {/* μ2 reverted aquí: el sigilo de 2 letras se quitó del listado
              porque agregaba ruido sin información (el nombre ya está al
              lado). Sigue activo en el EntityHeader del panel detail,
              donde tiene más justificación como ancla visual. */}
          <div className="min-w-0">
            <span className="text-ink-700">{entity.name}</span>
            {entity.year !== undefined && (
              <span className="ml-2 text-ink-300 text-sm">({entity.year})</span>
            )}
            <span
              className="ml-3 text-micro uppercase tracking-eyebrow align-middle"
              style={{ color: typeAccent(entity.type) }}
            >
              {ENTITY_TYPES.find((t) => t.value === entity.type)?.label}
            </span>
            {entity.origin.kind === 'ai' && (
              <span className="ml-1.5 inline-flex items-center text-sky-700/70 align-middle" title="añadido por IA">
                <SparkleIcon size={10} />
              </span>
            )}
          </div>
          {/* Chevron que rota — indica si está expandida o no */}
          <ChevronRightIcon
            size={12}
            className={`text-ink-200 group-hover:text-ink-400 transition-all shrink-0 ${
              expanded ? 'rotate-90 text-ink-500' : ''
            }`}
          />
        </div>
        {entity.description && (
          <p
            className={`mt-1 text-ink-500 text-sm leading-relaxed ${
              expanded ? '' : 'line-clamp-1'
            }`}
          >
            {entity.description}
          </p>
        )}
        {(quoteCount > 0 || relCount > 0) && (
          <div className="mt-1.5 flex gap-3 text-micro uppercase tracking-eyebrow text-ink-300">
            {quoteCount > 0 && (
              <span>
                {quoteCount} {quoteCount === 1 ? 'cita' : 'citas'}
              </span>
            )}
            {relCount > 0 && (
              <span>
                {relCount} {relCount === 1 ? 'relación' : 'relaciones'}
              </span>
            )}
          </div>
        )}

        {/* Expansion inline — preview de meta + atajo a panel completo.
            Solo se renderiza cuando expanded. El virtualizer mide la
            altura dinámicamente via measureElement. */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-ink-100/60 space-y-2 animate-fade-up">
            <div className="flex items-baseline gap-3 text-micro uppercase tracking-eyebrow text-ink-400">
              <span className="font-mono normal-case tracking-normal text-ink-300">
                {entity.id.slice(0, 8)}
              </span>
              {entity.spotifyUrl && (
                <a
                  href={entity.spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-emerald-700 hover:text-emerald-900 transition-colors"
                >
                  ↗ Spotify
                </a>
              )}
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectEntity?.(entity.id)
                }}
                className="ml-auto text-ink-400 hover:text-ink-700 transition-colors cursor-pointer"
              >
                abrir panel →
              </span>
            </div>
          </div>
        )}
      </button>
      {/* Toolbar flotante de acciones — solo aparece al hover. Como
          Linear/Codex, en vez de tener botones permanentes. */}
      <div className="hover-actions">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSelectEntity?.(entity.id)
          }}
          aria-label={`Abrir ${entity.name}`}
          title="Abrir panel"
        >
          <ChevronRightIcon size={12} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="hover-action-destructive"
          aria-label={`Eliminar ${entity.name}`}
          title="Eliminar"
        >
          <TrashIcon size={12} />
        </button>
      </div>
    </div>
  )
}

/**
 * AA-B: menú IA en el header de Entidades. Por ahora una sola opción
 * (reclasificar). El patrón está pensado para crecer — agregar
 * "describir con IA" / "sugerir vínculos" / "limpiar tipos huérfanos"
 * sin tener que repensar el header. Cierra al click afuera o ESC.
 */
function AIMenu({
  onReclassify,
  reclassifyPending,
  disabled,
}: {
  onReclassify: () => void
  reclassifyPending: boolean
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || reclassifyPending}
        className="ai-cta"
        title="Acciones con IA"
        aria-label="Acciones con IA"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {reclassifyPending ? (
          <>
            <span
              className="size-3 border-2 rounded-full animate-spin"
              style={{
                borderColor: 'var(--accent-primary-ring)',
                borderTopColor: 'var(--accent-primary)',
              }}
            />
            revisando…
          </>
        ) : (
          <>
            <SparkleIcon size={12} />
            IA
            <span aria-hidden className="text-ink-400 ml-0.5">
              ▾
            </span>
          </>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 min-w-[200px] bg-paper-50 border border-ink-100/80 rounded-md shadow-md shadow-ink-900/15 py-1 z-20 animate-fade-up"
          style={{ backgroundColor: 'rgb(var(--paper-50))' }}
        >
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onReclassify()
            }}
            className="w-full text-left px-3 py-2 text-sm text-ink-700 hover:bg-paper-100/70 transition-colors flex items-center gap-2"
          >
            <SparkleIcon size={12} className="text-ink-400" />
            Reclasificar tipos
          </button>
          {/* Espacio futuro para más opciones IA. */}
        </div>
      )}
    </div>
  )
}
