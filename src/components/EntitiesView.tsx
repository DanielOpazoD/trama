import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ENTITY_TYPES, type EntityType } from '../types'
import {
  useInfiniteEntitiesQuery,
  useQuotesQuery,
  useRelationshipsQuery,
  useAddEntity,
  useDeleteEntity,
  useOffline,
  useReclassifyEntities,
  useUpdateEntityType,
} from '../state'
import type { Reclassification } from '../api'
import { ChevronRightIcon, EndMark, SparkleIcon, TrashIcon } from './Icons'
import { ReclassifyPanel } from './ReclassifyPanel'
import { EmptyMessage } from './EmptyMessage'
import { EntityCardSkeleton, SkeletonList } from './Skeleton'
import { typeAccent } from './graph/GraphNode'
import { useMainScrollVirtualizer } from '../hooks/useMainScrollVirtualizer'
import type { Entity } from '../types'
import { DuplicateEntityError } from '../api'

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
  // por type habría que mover el filtro al server.
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const availableTypes = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of allLoadedEntities) {
      counts.set(e.type, (counts.get(e.type) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
  }, [allLoadedEntities])

  const entities = useMemo(
    () => (typeFilter ? allLoadedEntities.filter((e) => e.type === typeFilter) : allLoadedEntities),
    [allLoadedEntities, typeFilter],
  )
  const { data: quotes = [] } = useQuotesQuery()
  const { data: relationships = [] } = useRelationshipsQuery()
  const addEntity = useAddEntity()
  const deleteEntity = useDeleteEntity()
  const reclassify = useReclassifyEntities()
  const updateType = useUpdateEntityType()
  const { offline } = useOffline()

  const [name, setName] = useState('')
  const [type, setType] = useState<EntityType>('persona')
  const [year, setYear] = useState('')
  const [description, setDescription] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [pending, setPending] = useState<Reclassification[] | null>(null)
  const [emptyHint, setEmptyHint] = useState(false)
  // Inline expansion — solo una entidad expandida a la vez. Si el
  // usuario expande otra, la actual colapsa. El virtualizer mide la
  // altura dinámicamente via measureElement.
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // When the server detects a near-duplicate during create, we surface its
  // suggestions here so the user can pick one — or override and create
  // anyway via the "crear igual" action.
  const [dupCandidates, setDupCandidates] = useState<
    DuplicateEntityError['suggestions'] | null
  >(null)

  // Build O(1) counts so the virtualized rows don't have to filter the full
  // arrays on every render. Without this, scrolling 500+ entities would do
  // 500 × (quotes.length + relationships.length) work each frame.
  const quoteCountById = (() => {
    const map = new Map<string, number>()
    for (const q of quotes) map.set(q.entityId, (map.get(q.entityId) ?? 0) + 1)
    return map
  })()
  const relCountById = (() => {
    const map = new Map<string, number>()
    for (const r of relationships) {
      map.set(r.fromId, (map.get(r.fromId) ?? 0) + 1)
      if (r.fromId !== r.toId) {
        map.set(r.toId, (map.get(r.toId) ?? 0) + 1)
      }
    }
    return map
  })()

  const { listRef, virtualizer } = useMainScrollVirtualizer({
    count: entities.length,
    estimateSize: 88,
    overscan: 10,
    deps: [showForm, entities.length, pending !== null, emptyHint],
  })

  // Fetch next page when the virtualizer enters the last few items.
  const virtualItems = virtualizer.getVirtualItems()
  const lastVisibleIndex = virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].index : 0
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

  async function handleSubmit(event: FormEvent, force = false) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setDupCandidates(null)
    try {
      await addEntity.mutateAsync({
        type,
        name: trimmed,
        year: year ? Number(year) : undefined,
        description: description.trim() || undefined,
        _force: force,
      })
      setName('')
      setYear('')
      setDescription('')
    } catch (err) {
      if (err instanceof DuplicateEntityError) {
        setDupCandidates(err.suggestions)
      }
      // otros errores ya salen vía addEntity.error
    }
  }

  return (
    <>
      <header className="mb-10 flex items-baseline justify-between gap-6">
        <div className="min-w-0">
          <h2 className="font-serif text-4xl text-ink-700 leading-none">Entidades</h2>
          <div className="accent-rule mt-3 mb-2" />
          <p className="mt-2 text-sm text-ink-400 leading-relaxed max-w-xl">
            Las cosas que conectas: personas, libros, canciones, álbumes, películas,
            obras, conceptos, ideas. Cada nodo del grafo es una entidad.
          </p>
        </div>
        <div className="flex items-baseline gap-4 shrink-0">
          {entities.length > 0 && (
            <button
              onClick={handleReclassify}
              disabled={reclassify.isPending || offline}
              className="ai-cta"
              title="La IA revisa los tipos actuales y propone reclasificaciones cuando hay uno mejor"
            >
              {reclassify.isPending ? (
                <>
                  <span className="size-3 border-2 rounded-full animate-spin" style={{ borderColor: `var(--accent-primary-ring)`, borderTopColor: `var(--accent-primary)` }} />
                  revisando…
                </>
              ) : (
                <>
                  <SparkleIcon size={12} />
                  reclasificar con IA
                </>
              )}
            </button>
          )}
          <button
            onClick={() => setShowForm((s) => !s)}
            className="text-xs uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
          >
            {showForm ? 'Cerrar' : 'Añadir'}
          </button>
        </div>
      </header>

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
        <form
          onSubmit={handleSubmit}
          className="mb-10 p-4 bg-paper-100/50 border border-ink-100/60 rounded-xl space-y-3 animate-fade-up"
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nombre"
              className="input-paper flex-1"
              autoFocus
            />
            <select
              value={type}
              onChange={(event) => setType(event.target.value as EntityType)}
              className="input-paper"
            >
              {ENTITY_TYPES.map((entityType) => (
                <option key={entityType.value} value={entityType.value}>
                  {entityType.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={year}
              onChange={(event) => setYear(event.target.value)}
              placeholder="Año"
              className="input-paper w-full sm:w-24"
            />
          </div>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Nota o descripción (opcional)"
            rows={2}
            className="input-paper w-full resize-none"
          />
          <button type="submit" disabled={addEntity.isPending} className="btn-ink">
            {addEntity.isPending ? 'Añadiendo…' : 'Añadir'}
          </button>
          {dupCandidates && dupCandidates.length > 0 && (
            <div
              className="rounded-lg p-3 mt-2"
              style={{
                backgroundColor: 'var(--accent-primary-soft)',
                border: '1px solid var(--accent-primary-ring)',
              }}
            >
              <p
                className="text-micro uppercase tracking-eyebrow font-medium mb-2"
                style={{ color: 'var(--accent-primary)' }}
              >
                ¿es la misma entidad?
              </p>
              <p className="text-xs text-ink-500 mb-2 leading-relaxed">
                Ya tienes una entidad muy parecida. Si es la misma, mejor
                quédate con la existente:
              </p>
              <ul className="space-y-1 mb-2">
                {dupCandidates.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectEntity?.(c.id)
                        setDupCandidates(null)
                        setName('')
                        setYear('')
                        setDescription('')
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded text-sm hover:bg-paper-50/70 transition-colors flex items-baseline justify-between gap-3"
                    >
                      <span>
                        <span className="text-ink-700">{c.name}</span>
                        <span className="ml-2 text-micro uppercase tracking-eyebrow text-ink-300">
                          {c.type}
                        </span>
                      </span>
                      <span className="text-micro uppercase tracking-eyebrow text-ink-300 tabular-nums">
                        {(c.similarity * 100).toFixed(0)}%
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={(e) => handleSubmit(e as unknown as FormEvent, true)}
                  className="text-caption uppercase tracking-eyebrow text-ink-500 hover:text-ink-700 transition-colors"
                >
                  crear igual ↪
                </button>
                <button
                  type="button"
                  onClick={() => setDupCandidates(null)}
                  className="text-caption uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
                >
                  cerrar
                </button>
              </div>
            </div>
          )}
        </form>
      )}

      {/* Filtro por tipo. Solo aparece si hay más de un tipo en la trama. */}
      {availableTypes.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <button
            onClick={() => setTypeFilter(null)}
            className={
              typeFilter === null
                ? 'px-2.5 py-1 rounded-full text-xs font-medium transition-colors'
                : 'px-2.5 py-1 rounded-full text-xs text-ink-500 hover:text-ink-800 hover:bg-ink-100 transition-colors'
            }
            style={
              typeFilter === null
                ? {
                    backgroundColor: 'var(--accent-primary-soft)',
                    color: 'var(--accent-primary)',
                  }
                : undefined
            }
          >
            Todos
            <span className="ml-1.5 text-micro tabular-nums opacity-70">
              {allLoadedEntities.length}
            </span>
          </button>
          {availableTypes.map(({ type, count }) => {
            const active = typeFilter === type
            const label = ENTITY_TYPES.find((t) => t.value === type)?.label ?? type
            return (
              <button
                key={type}
                onClick={() => setTypeFilter(active ? null : type)}
                className={
                  active
                    ? 'px-2.5 py-1 rounded-full text-xs font-medium transition-colors'
                    : 'px-2.5 py-1 rounded-full text-xs text-ink-500 hover:text-ink-800 hover:bg-ink-100 transition-colors'
                }
                style={
                  active
                    ? {
                        backgroundColor: `${typeAccent(type)}22`,
                        color: typeAccent(type),
                      }
                    : undefined
                }
              >
                {label}
                <span className="ml-1.5 text-micro tabular-nums opacity-70">{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {entitiesPaged.isLoading ? (
        <div className="space-y-2">
          <SkeletonList count={6} Component={EntityCardSkeleton} />
        </div>
      ) : entities.length === 0 ? (
        <EmptyMessage
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
                  onDelete={() => {
                    if (
                      confirm(
                        `¿Eliminar "${entity.name}"? Sus citas y relaciones también se borrarán.`,
                      )
                    ) {
                      deleteEntity.mutate(entity.id)
                    }
                  }}
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
    <div className="group relative">
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
