import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  useEntitiesQuery,
  useInfiniteQuotesQuery,
  useRelationshipsQuery,
  useAddQuote,
  useDeleteQuote,
} from '../state'
import { EndMark, SparkleIcon, TrashIcon } from './Icons'
import { EmptyMessage } from './EmptyMessage'
import { useMainScrollVirtualizer } from '../hooks/useMainScrollVirtualizer'
import { typeAccent } from './graph/GraphNode'
import { ENTITY_TYPES } from '../types'
import type { Entity, Quote } from '../types'

/** Format an ISO date as "20 may 2026" — short, ink-on-paper style. */
function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('es', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).replace(/\./g, '')
  } catch {
    return ''
  }
}

/** Drop-cap on the first letter of a quote — adds editorial weight without
    blowing up the layout. Size aligned with the body type below. */
function withDropCap(text: string) {
  if (!text) return null
  const first = text[0]
  const rest = text.slice(1)
  return (
    <>
      <span className="float-left mr-1.5 mt-1 text-4xl leading-[0.85] font-serif text-ink-700 select-none">
        {first}
      </span>
      {rest}
    </>
  )
}

const WORK_TYPES = new Set([
  'libro', 'ensayo', 'poema', 'articulo',
  'cancion', 'podcast', 'album', 'disco',
  'pelicula', 'serie', 'documental', 'obra',
])
const PERSON_TYPES = new Set([
  'persona', 'escritor', 'filosofo', 'musico', 'banda',
  'director', 'artista', 'cientifico',
])

export function QuotesView({
  onSelectEntity,
}: {
  onSelectEntity?: (id: string) => void
}) {
  const { data: entities = [] } = useEntitiesQuery()
  const quotesPaged = useInfiniteQuotesQuery()
  const allLoadedQuotes = useMemo(
    () => quotesPaged.data?.pages.flatMap((p) => p.items) ?? [],
    [quotesPaged.data],
  )
  const { data: relationships = [] } = useRelationshipsQuery()

  // Filtro por tipo de la entidad atribuida (chips arriba, mismo patrón que
  // EntitiesView). null = todos. Filtra client-side sobre las páginas ya
  // cargadas — coherente con cómo filtra Entidades.
  const [typeFilter, setTypeFilter] = useState<string | null>(null)

  // Mapa entityId → type, para evitar O(n×m) cuando hay muchas citas y entidades.
  const entityTypeById = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of entities) map.set(e.id, e.type)
    return map
  }, [entities])

  // Conteos por tipo en las citas YA cargadas — alimenta los chips.
  const availableTypes = useMemo(() => {
    const counts = new Map<string, number>()
    for (const q of allLoadedQuotes) {
      const t = entityTypeById.get(q.entityId)
      if (t) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
  }, [allLoadedQuotes, entityTypeById])

  const quotes = useMemo(
    () =>
      typeFilter
        ? allLoadedQuotes.filter((q) => entityTypeById.get(q.entityId) === typeFilter)
        : allLoadedQuotes,
    [allLoadedQuotes, typeFilter, entityTypeById],
  )

  // For "work" entities, find the linked person/writer so we can show
  // "— Marco Aurelio · Meditaciones" instead of just "— Meditaciones".
  function authorOf(workId: string): Entity | undefined {
    for (const rel of relationships) {
      if (rel.toId === workId) {
        const candidate = entities.find((e) => e.id === rel.fromId)
        if (candidate && PERSON_TYPES.has(candidate.type)) return candidate
      }
      if (rel.fromId === workId) {
        const candidate = entities.find((e) => e.id === rel.toId)
        if (candidate && PERSON_TYPES.has(candidate.type)) return candidate
      }
    }
    return undefined
  }
  const addQuote = useAddQuote()
  const deleteQuote = useDeleteQuote()

  const [entityId, setEntityId] = useState('')
  const [text, setText] = useState('')
  const [source, setSource] = useState('')
  const [context, setContext] = useState('')
  const [userReflection, setUserReflection] = useState('')
  const [showForm, setShowForm] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmedText = text.trim()
    if (!trimmedText || !entityId) return
    try {
      await addQuote.mutateAsync({
        entityId,
        text: trimmedText,
        source: source.trim() || undefined,
        context: context.trim() || undefined,
        userReflection: userReflection.trim() || undefined,
      })
      setText('')
      setSource('')
      setContext('')
      setUserReflection('')
    } catch {
      /* error surfaces via addQuote.error */
    }
  }

  // Virtualized rendering: at 500+ quotes the previous full-list render
  // started to lag. We mount only the visible window + a small overscan.
  // estimateSize is intentionally generous (typical quote with author +
  // optional context + reflection lands around 300-360px). The measureElement
  // hook on each row corrects the estimate as soon as it's measured.
  const { listRef, virtualizer } = useMainScrollVirtualizer({
    count: quotes.length,
    estimateSize: 320,
    overscan: 8,
    deps: [showForm, quotes.length, typeFilter],
  })

  // Trigger next-page fetch when the user scrolls into the last 5 items of
  // the currently rendered window. Reads the highest virtual index instead
  // of a sentinel element — keeps it tied to the virtualizer's own state.
  const virtualItems = virtualizer.getVirtualItems()
  const lastVisibleIndex = virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].index : 0
  useEffect(() => {
    if (!quotesPaged.hasNextPage || quotesPaged.isFetchingNextPage) return
    if (quotes.length === 0) return
    if (lastVisibleIndex >= quotes.length - 5) {
      quotesPaged.fetchNextPage()
    }
  }, [lastVisibleIndex, quotes.length, quotesPaged])

  return (
    <>
      <header className="mb-10 flex items-baseline justify-between gap-6">
        <div className="min-w-0">
          <h2 className="font-serif text-4xl text-ink-700 leading-none">Citas</h2>
          <div className="accent-rule mt-3 mb-2" />
          <p className="mt-2 text-sm text-ink-400 leading-relaxed max-w-xl">
            Fragmentos textuales que atribuyes a una entidad. Una frase de un libro,
            algo que dijo una persona, un verso de una canción.
          </p>
        </div>
        {entities.length > 0 && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="text-xs uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
          >
            {showForm ? 'Cerrar' : 'Añadir'}
          </button>
        )}
      </header>

      {entities.length === 0 ? (
        <EmptyMessage
          illustration="thread"
          title="No hay todavía a quién atribuir nada."
          body={
            <>
              Las citas viven pegadas a una entidad: una persona, un libro,
              una canción. Crea la primera entidad y vuelve.
            </>
          }
          hint="Pega un texto en la barra de abajo o entra a Entidades para empezar."
        />
      ) : (
        <>
          {showForm && (
            <form
              onSubmit={handleSubmit}
              className="mb-12 p-4 bg-paper-100/50 border border-ink-100/60 rounded-xl space-y-3 animate-fade-up"
            >
              <select
                value={entityId}
                onChange={(event) => setEntityId(event.target.value)}
                className="input-paper w-full"
              >
                <option value="">— elige a quién pertenece —</option>
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name}
                  </option>
                ))}
              </select>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="La cita"
                rows={4}
                className="input-paper w-full resize-none"
              />
              <input
                type="text"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="Fuente (libro, página, año — opcional)"
                className="input-paper w-full"
              />
              <textarea
                value={context}
                onChange={(event) => setContext(event.target.value)}
                placeholder="Contexto de la cita (de qué habla, dónde aparece — opcional)"
                rows={2}
                className="input-paper w-full resize-none"
              />
              <textarea
                value={userReflection}
                onChange={(event) => setUserReflection(event.target.value)}
                placeholder="Tu reflexión propia (qué viste en esto, por qué la guardas — opcional)"
                rows={2}
                className="input-paper w-full resize-none"
              />
              <button type="submit" disabled={addQuote.isPending} className="btn-ink">
                {addQuote.isPending ? 'Añadiendo…' : 'Añadir'}
              </button>
            </form>
          )}

          {/* Chips de filtro por tipo de entidad atribuida. Mismo patrón que
              EntitiesView: sticky al top con backdrop blur, Todos + chip por
              tipo presente. Solo aparece si hay >1 tipo (con un solo tipo el
              chip no aporta nada). bg-paper-50 fully opaque + shadow sutil
              para que las quotes scrolleen "al pasado" sin translucirse. */}
          {availableTypes.length > 1 && (
            <div className="sticky top-0 z-10 -mx-8 px-8 py-2 mb-4 bg-paper-50 border-b border-ink-100/60 shadow-[0_4px_8px_-6px_rgba(0,0,0,0.06)] flex flex-wrap gap-1.5">
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
                Todas
                <span className="ml-1.5 text-micro tabular-nums opacity-70">
                  {allLoadedQuotes.length}
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

          {quotes.length === 0 ? (
            typeFilter ? (
              // Hay quotes cargadas, pero ninguna matchea el filtro actual.
              // Distinto del empty state global: acá hay datos, sólo no este tipo.
              <EmptyMessage
                illustration="thread"
                title="No hay citas de ese tipo todavía."
                body={
                  <>
                    Filtrando por{' '}
                    <strong>
                      {ENTITY_TYPES.find((t) => t.value === typeFilter)?.label ?? typeFilter}
                    </strong>{' '}
                    no aparece nada. Las citas se atribuyen al crearlas — si
                    quieres alguna de este tipo, atribúyela a una entidad de
                    ese tipo.
                  </>
                }
                hint={
                  <button
                    onClick={() => setTypeFilter(null)}
                    className="underline hover:text-ink-700 transition-colors"
                  >
                    Mostrar todas
                  </button>
                }
              />
            ) : (
              <EmptyMessage
                illustration="thread"
                title="Una página todavía en blanco."
                body={
                  <>
                    Las citas son piezas que se quedan: una frase que te detuvo,
                    un verso que volvió. Cuando guardes la primera, su tipografía
                    va a verse mejor que esto.
                  </>
                }
                hint="Pega texto abajo o usa el botón de cámara para empezar."
              />
            )
          ) : (
            <div
              ref={listRef}
              style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const quote = quotes[virtualRow.index]
                const entity = entities.find((e) => e.id === quote.entityId)
                const author = entity && WORK_TYPES.has(entity.type) ? authorOf(entity.id) : undefined
                const isFeature = virtualRow.index === 0
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
                      paddingBottom: '3.5rem', // space-y-14 equivalent between items
                    }}
                  >
                    <QuoteItem
                      quote={quote}
                      entity={entity}
                      author={author}
                      isFeature={isFeature}
                      onSelectEntity={onSelectEntity}
                      onDelete={() => deleteQuote.mutate(quote.id)}
                    />
                  </div>
                )
              })}
            </div>
          )}
          {quotesPaged.isFetchingNextPage && (
            <p className="mt-4 text-center text-xs uppercase tracking-eyebrow text-ink-300">
              cargando más…
            </p>
          )}
          {!quotesPaged.hasNextPage &&
            !quotesPaged.isLoading &&
            quotes.length >= 5 && (
              <div className="flex justify-center mt-8 mb-2 text-ink-300">
                <EndMark size={14} />
              </div>
            )}
        </>
      )}
    </>
  )
}

function QuoteItem({
  quote,
  entity,
  author,
  isFeature,
  onSelectEntity,
  onDelete,
}: {
  quote: Quote
  entity: Entity | undefined
  author: Entity | undefined
  isFeature: boolean
  onSelectEntity?: (id: string) => void
  onDelete: () => void
}) {
  return (
    <div className="group">
      {isFeature ? (
        <blockquote className="quote-block text-lg md:text-xl text-ink-700 leading-snug clear-both overflow-hidden">
          {withDropCap(quote.text)}
        </blockquote>
      ) : (
        <blockquote className="quote-block text-base md:text-lg text-ink-600 leading-relaxed border-l-2 border-ink-200 pl-4">
          «{quote.text}»
        </blockquote>
      )}
      <div
        className={`mt-3 flex justify-between items-baseline gap-4 ${
          isFeature ? '' : 'pl-5'
        }`}
      >
        <div className="text-sm">
          {author && entity ? (
            <>
              <button
                onClick={() => onSelectEntity?.(author.id)}
                className="text-ink-500 hover:text-ink-700 transition-colors border-b border-transparent hover:border-ink-300"
              >
                — {author.name}
              </button>
              <span className="text-ink-300 mx-1.5">·</span>
              <button
                onClick={() => onSelectEntity?.(entity.id)}
                className="text-ink-400 italic hover:text-ink-700 transition-colors border-b border-transparent hover:border-ink-300"
              >
                {entity.name}
              </button>
            </>
          ) : entity ? (
            <button
              onClick={() => onSelectEntity?.(entity.id)}
              className="text-ink-500 hover:text-ink-700 transition-colors border-b border-transparent hover:border-ink-300"
            >
              — {entity.name}
            </button>
          ) : (
            <span className="text-ink-300">— entidad eliminada</span>
          )}
          {quote.source && (
            <span className="text-ink-300 ml-2 italic">· {quote.source}</span>
          )}
          {quote.origin.kind === 'ai' && (
            <span className="ml-1.5 inline-flex items-center text-sky-700/70" title="propuesta por IA">
              <SparkleIcon size={10} />
            </span>
          )}
          <span
            className="ml-3 text-caption text-ink-300 tabular-nums"
            title={`Añadida el ${new Date(quote.createdAt).toLocaleString('es')}`}
          >
            añadida {formatDate(quote.createdAt)}
          </span>
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
      {quote.context && (
        <p
          className={`mt-2 text-ink-400 text-sm leading-relaxed italic ${
            isFeature ? '' : 'pl-5'
          }`}
        >
          {quote.context}
        </p>
      )}
      {quote.userReflection && (
        <div className={`mt-3 ${isFeature ? '' : 'pl-5'}`}>
          <div className="text-micro uppercase tracking-eyebrow text-ink-400 mb-1">
            tu reflexión
          </div>
          <p className="text-ink-600 text-sm leading-relaxed whitespace-pre-wrap">
            {quote.userReflection}
          </p>
        </div>
      )}
      {quote.aiReflection && (
        <div className={`mt-3 ${isFeature ? '' : 'pl-5'}`}>
          <div className="flex items-baseline gap-1.5 text-micro uppercase tracking-eyebrow text-sky-700/80 mb-1">
            <SparkleIcon size={10} />
            interpretación de la IA
          </div>
          <p className="text-ink-500 text-sm leading-relaxed whitespace-pre-wrap">
            {quote.aiReflection}
          </p>
        </div>
      )}
    </div>
  )
}
