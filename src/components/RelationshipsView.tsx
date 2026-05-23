import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { RELATIONSHIP_TYPES, type Entity, type ExtractionProposal, type Relationship, type RelationshipType } from '../types'
import {
  useEntitiesQuery,
  useInfiniteRelationshipsQuery,
  useAddRelationship,
  useDeleteRelationship,
  useSuggestRelationships,
  useOffline,
} from '../state'
import { CloseIcon, SparkleIcon, TrashIcon } from './Icons'
import { EmptyMessage } from './EmptyMessage'
import { useMainScrollVirtualizer } from '../hooks/useMainScrollVirtualizer'
import { EntityCombobox } from './EntityCombobox'

export function RelationshipsView({
  onSelectEntity,
  onProposal,
}: {
  onSelectEntity?: (id: string) => void
  onProposal?: (text: string, proposal: ExtractionProposal) => void
}) {
  // Paginated relationships for the list. entities stays wholesale because
  // the form selects (from/to) and the row name resolution both need it.
  // Cuando entities crezca a 100k habrá que reemplazar los selects por un
  // autocomplete con /api/entities-lookup.
  const { data: entities = [] } = useEntitiesQuery()
  const relsPaged = useInfiniteRelationshipsQuery()
  const relationships = useMemo(
    () => relsPaged.data?.pages.flatMap((p) => p.items) ?? [],
    [relsPaged.data],
  )
  const addRelationship = useAddRelationship()
  const deleteRelationship = useDeleteRelationship()
  const suggest = useSuggestRelationships()
  const { offline } = useOffline()

  const [fromId, setFromId] = useState('')
  const [type, setType] = useState<RelationshipType>('influye_en')
  const [toId, setToId] = useState('')
  const [notes, setNotes] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [emptyHint, setEmptyHint] = useState<string | null>(null)

  // O(1) entity lookup so the virtualized rows aren't O(rel × entities) each frame.
  const entitiesById = useMemo(() => {
    const map = new Map<string, Entity>()
    for (const e of entities) map.set(e.id, e)
    return map
  }, [entities])

  const { listRef, virtualizer } = useMainScrollVirtualizer({
    count: relationships.length,
    estimateSize: 72,
    overscan: 10,
    deps: [showForm, relationships.length, emptyHint !== null, !!suggest.error],
  })

  // Infinite scroll trigger.
  const virtualItems = virtualizer.getVirtualItems()
  const lastVisibleIndex = virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].index : 0
  useEffect(() => {
    if (!relsPaged.hasNextPage || relsPaged.isFetchingNextPage) return
    if (relationships.length === 0) return
    if (lastVisibleIndex >= relationships.length - 5) {
      relsPaged.fetchNextPage()
    }
  }, [lastVisibleIndex, relationships.length, relsPaged])

  async function handleSuggest() {
    setEmptyHint(null)
    try {
      const proposal = await suggest.mutateAsync()
      if (proposal.relationships.length === 0) {
        setEmptyHint(
          'Sin relaciones nuevas obvias. Añade citas o descripciones para darle más contexto.',
        )
        return
      }
      onProposal?.('Sugerencias entre entidades existentes', proposal)
    } catch {
      // surfaces via suggest.error
    }
  }

  // Auto-dismiss the empty hint after 6s; the user can close it sooner with X.
  useEffect(() => {
    if (!emptyHint) return
    const id = setTimeout(() => setEmptyHint(null), 6000)
    return () => clearTimeout(id)
  }, [emptyHint])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!fromId || !toId || fromId === toId) return
    try {
      await addRelationship.mutateAsync({
        fromId,
        toId,
        type,
        notes: notes.trim() || undefined,
      })
      setFromId('')
      setToId('')
      setNotes('')
    } catch {
      /* error surfaces via addRelationship.error */
    }
  }

  return (
    <>
      <header className="mb-10 flex items-baseline justify-between gap-6">
        <div className="min-w-0">
          <h2 className="font-serif text-4xl text-ink-700 leading-none">Relaciones</h2>
          <div className="accent-rule mt-3 mb-2" />
          <p className="mt-2 text-sm text-ink-400 leading-relaxed max-w-md">
            Vínculos entre dos entidades — quién influye en quién, qué cita a qué,
            qué te llegó por dónde. Las líneas del grafo.
          </p>
        </div>
        {entities.length >= 2 && (
          <div className="flex items-baseline gap-4 shrink-0">
            <button
              onClick={handleSuggest}
              disabled={suggest.isPending || offline}
              className="ai-cta"
              title="Sugerir relaciones nuevas entre entidades ya existentes"
            >
              {suggest.isPending ? (
                <>
                  <span className="size-3 border-2 rounded-full animate-spin" style={{ borderColor: `var(--accent-primary-ring)`, borderTopColor: `var(--accent-primary)` }} />
                  pensando…
                </>
              ) : (
                <>
                  <SparkleIcon size={12} />
                  descubrir con IA
                </>
              )}
            </button>
            <button
              onClick={() => setShowForm((s) => !s)}
              className="text-xs uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
            >
              {showForm ? 'Cerrar' : 'Añadir'}
            </button>
          </div>
        )}
      </header>

      {suggest.error && (
        <div className="alert-error mb-6 flex items-start gap-2 pl-3 pr-1.5 py-2 text-xs">
          <span className="flex-1">{suggest.error.message}</span>
          <button
            onClick={() => suggest.reset()}
            aria-label="Cerrar aviso"
            className="shrink-0 p-1 -m-0.5 opacity-70 hover:opacity-100 rounded transition-opacity"
          >
            <CloseIcon size={12} />
          </button>
        </div>
      )}
      {emptyHint && !suggest.isPending && (
        <div className="mb-6 flex items-start gap-2 pl-3 pr-1.5 py-2 bg-paper-100/60 border border-ink-100/60 rounded-lg text-xs text-ink-500 leading-snug">
          <span className="flex-1">{emptyHint}</span>
          <button
            onClick={() => setEmptyHint(null)}
            aria-label="Cerrar aviso"
            className="shrink-0 p-1 -m-0.5 text-ink-300 hover:text-ink-700 rounded transition-colors"
          >
            <CloseIcon size={12} />
          </button>
        </div>
      )}

      {entities.length < 2 ? (
        <EmptyMessage
          title="Una relación necesita dos."
          body={
            <>
              Una relación es una línea entre dos entidades — sin segundo
              extremo no hay línea. Volvé cuando tengas al menos dos.
            </>
          }
        />
      ) : (
        <>
          {showForm && (
            <form
              onSubmit={handleSubmit}
              className="mb-10 p-4 bg-paper-100/50 border border-ink-100/60 rounded-xl space-y-3 animate-fade-up"
            >
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <EntityCombobox
                    value={fromId || null}
                    onChange={(entity) => setFromId(entity?.id ?? '')}
                    selectedName={fromId ? entitiesById.get(fromId)?.name ?? null : null}
                    placeholder="— origen —"
                  />
                </div>
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value as RelationshipType)}
                  className="input-paper"
                >
                  {RELATIONSHIP_TYPES.map((relType) => (
                    <option key={relType.value} value={relType.value}>{relType.label}</option>
                  ))}
                </select>
                <div className="flex-1">
                  <EntityCombobox
                    value={toId || null}
                    onChange={(entity) => setToId(entity?.id ?? '')}
                    selectedName={toId ? entitiesById.get(toId)?.name ?? null : null}
                    excludeId={fromId || null}
                    placeholder="— destino —"
                  />
                </div>
              </div>
              <input
                type="text"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Nota sobre la relación (opcional)"
                className="input-paper w-full"
              />
              <button type="submit" disabled={addRelationship.isPending} className="btn-ink">
                {addRelationship.isPending ? 'Añadiendo…' : 'Añadir'}
              </button>
            </form>
          )}

          {relsPaged.isLoading ? (
            <p className="text-ink-300 italic text-sm">cargando…</p>
          ) : relationships.length === 0 ? (
            <EmptyMessage
              title="Las entidades están sueltas."
              body={
                <>
                  Las relaciones son lo que vuelve constelación a una colección
                  de nombres. Conecta dos cosas que ya tienes y la trama
                  empieza a tener forma.
                </>
              }
              hint="Pulsa “descubrir con IA” arriba para que te sugiera las primeras."
            />
          ) : (
            <div
              ref={listRef}
              style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const rel = relationships[virtualRow.index]
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
                    <RelationshipRow
                      rel={rel}
                      from={entitiesById.get(rel.fromId)}
                      to={entitiesById.get(rel.toId)}
                      onSelectEntity={onSelectEntity}
                      onDelete={() => deleteRelationship.mutate(rel.id)}
                    />
                  </div>
                )
              })}
            </div>
          )}
          {relsPaged.isFetchingNextPage && (
            <p className="mt-4 text-center text-xs uppercase tracking-eyebrow text-ink-300">
              cargando más…
            </p>
          )}
        </>
      )}
    </>
  )
}

function RelationshipRow({
  rel,
  from,
  to,
  onSelectEntity,
  onDelete,
}: {
  rel: Relationship
  from: Entity | undefined
  to: Entity | undefined
  onSelectEntity?: (id: string) => void
  onDelete: () => void
}) {
  const typeLabel =
    RELATIONSHIP_TYPES.find((t) => t.value === rel.type)?.label ?? rel.type
  return (
    <div className="group p-3 bg-paper-50/40 border border-ink-100/50 rounded-xl transition-all duration-200 hover:shadow-md hover:shadow-ink-900/5 hover:border-ink-100 hover:bg-paper-50/70">
      <div className="flex justify-between items-baseline gap-4">
        <div className="text-ink-600 leading-relaxed">
          {from ? (
            <button
              onClick={() => onSelectEntity?.(from.id)}
              className="text-ink-700 hover:text-ink-900 transition-colors border-b border-transparent hover:border-ink-300"
            >
              {from.name}
            </button>
          ) : (
            <span className="text-ink-700">—</span>
          )}
          <span className="mx-2 text-micro uppercase tracking-eyebrow text-ink-300">
            {typeLabel}
          </span>
          {to ? (
            <button
              onClick={() => onSelectEntity?.(to.id)}
              className="text-ink-700 hover:text-ink-900 transition-colors border-b border-transparent hover:border-ink-300"
            >
              {to.name}
            </button>
          ) : (
            <span className="text-ink-700">—</span>
          )}
          {rel.origin.kind === 'ai' && (
            <span className="ml-1.5 inline-flex items-center text-sky-700/70 align-middle" title="propuesta por IA">
              <SparkleIcon size={10} />
            </span>
          )}
        </div>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-ink-400 hover:text-red-700 hover:bg-ink-100 rounded"
          aria-label="Eliminar"
          title="Eliminar"
        >
          <TrashIcon size={12} />
        </button>
      </div>
      {rel.notes && (
        <p className="mt-1 text-sm text-ink-400 leading-relaxed">{rel.notes}</p>
      )}
    </div>
  )
}
