import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { RELATIONSHIP_TYPES, type Entity, type ExtractionProposal, type Relationship, type RelationshipType } from '../types'
import {
  useEntitiesQuery,
  useInfiniteRelationshipsQuery,
  useAddRelationship,
  useDeleteRelationship,
  useSuggestRelationships,
  useOffline,
} from '../state'
import { CloseIcon, EndMark, SparkleIcon, TrashIcon } from './Icons'
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
  // η2: lista acumulada (durante esta sesión de RelationshipsView) de
  // proposals que la IA ha sugerido y el usuario NO aceptó. La pasamos
  // al server en el próximo "descubrir IA" para que evite repetirlas.
  // Cap de 50 para no crecer infinitamente. Reset al mount.
  const avoidPreviousRef = useRef<Array<{ fromName: string; toName: string; type: string }>>([])

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
      // η2: pasar las propuestas previas como "evita éstas" para que la
      // IA genere relaciones distintas. La lista se acumula durante la
      // sesión y se cappea a 50.
      const proposal = await suggest.mutateAsync({
        avoidPrevious: avoidPreviousRef.current,
      })
      if (proposal.relationships.length === 0) {
        setEmptyHint(
          'Sin relaciones nuevas obvias. Añade citas o descripciones para darle más contexto.',
        )
        return
      }
      // Acumular las nuevas para el próximo intento. Si el usuario acepta
      // alguna, también termina en la lista de "evita" la próxima vez —
      // pero como ya existe en la DB, el endpoint la deduplicaría igual.
      // Lo importante: las que descartó NO se repiten.
      const fresh = proposal.relationships.map((r) => ({
        fromName: r.fromName,
        toName: r.toName,
        type: r.type,
      }))
      const merged = [...avoidPreviousRef.current, ...fresh]
      // Dedupe por (from + type + to), cap 50 (mantener las más recientes).
      const seen = new Set<string>()
      const deduped: typeof merged = []
      for (let i = merged.length - 1; i >= 0 && deduped.length < 50; i--) {
        const key = `${merged[i].fromName}|${merged[i].type}|${merged[i].toName}`
        if (seen.has(key)) continue
        seen.add(key)
        deduped.unshift(merged[i])
      }
      avoidPreviousRef.current = deduped
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
      {/* ρ-struct: header con h2 + acciones EN LA MISMA FILA — análogo a
          EntitiesView. "Descubrir con IA" y "Añadir" quedan a la altura
          del título (lo que pidió el usuario), no flotando aparte. La
          descripción contextual ("Vínculos entre dos entidades…") vive
          abajo del h2, no en el TopBar — el TopBar lleva el nombre del
          workspace ("Entidades") + las tabs. */}
      <header className="mb-8 flex items-baseline justify-between gap-6">
        <div className="min-w-0">
          {/* σ-followup: eyebrow + h2 coherente con el patrón canónico.
              El h2 dice "Vínculos" (no repite "Entidades") porque el
              TopBar ya identifica el workspace; acá especificamos la
              sub-vista. */}
          <p
            className="section-eyebrow-serif mb-2"
            style={{ color: 'var(--accent-gold)' }}
          >
            las líneas del grafo
          </p>
          <h2 className="font-serif text-4xl text-ink-700 leading-none">
            Vínculos
          </h2>
          <div className="accent-rule mt-3 mb-2" />
          <p className="mt-2 text-sm text-ink-400 leading-relaxed max-w-2xl">
            Vínculos entre dos entidades — quién influye en quién, qué cita a
            qué, qué te llegó por dónde.
          </p>
        </div>
        {entities.length >= 2 && (
          <div className="shrink-0 flex items-center gap-3 mt-1">
            <button
              onClick={handleSuggest}
              disabled={suggest.isPending || offline}
              className="ai-cta"
              title="Sugerir relaciones nuevas entre entidades ya existentes"
            >
              {suggest.isPending ? (
                <>
                  <span
                    className="size-3 border-2 rounded-full animate-spin"
                    style={{
                      borderColor: 'var(--accent-primary-ring)',
                      borderTopColor: 'var(--accent-primary)',
                    }}
                  />
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
          illustration="pair"
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
              illustration="pair"
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
          {!relsPaged.hasNextPage &&
            !relsPaged.isLoading &&
            relationships.length >= 5 && (
              <div className="flex justify-center mt-8 mb-2 text-ink-300">
                <EndMark size={14} />
              </div>
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
    RELATIONSHIP_TYPES.find((t) => t.value === rel.type)?.label ??
    // ρ-consistency: fallback defensivo — si la fila tiene un type que
    // no existe en el array fallback (e.g. tipos nuevos en la DB que el
    // cliente todavía no conoce), al menos reemplazamos los underscores
    // por espacios. Sin esto se renderea "ASOCIADO_CON" con guión bajo
    // a la vista, que se siente DB-leaky.
    rel.type.replace(/_/g, ' ')
  return (
    <div className="group card-paper-hover p-3 hover:shadow-ink-900/5">
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
