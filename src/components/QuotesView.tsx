import { useEffect, useMemo, useState } from 'react'
import {
  useEntitiesQuery,
  useInfiniteQuotesQuery,
  useRelationshipsQuery,
  useDeleteQuote,
} from '../state'
import { sectionWashStyle } from '../lib/sectionWash'
import { EndMark } from './Icons'
import { EmptyMessage } from './EmptyMessage'
import { Folio } from './Folio'
import { useMainScrollVirtualizer } from '../hooks/useMainScrollVirtualizer'
import { ENTITY_TYPES } from '../types'
import type { Entity } from '../types'
import { QuoteForm } from './quotes/QuoteForm'
import { QuoteItem } from './quotes/QuoteItem'
import { useQuotesFilters } from './quotes/useQuotesFilters'
import { QuotesFiltersBar } from './quotes/QuotesFiltersBar'

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

  // FF3: state + derivaciones de filtros viven en el hook. Filtra
  // client-side sobre las páginas ya cargadas, coherente con EntitiesView.
  const {
    typeFilter,
    setTypeFilter,
    favoritesOnly,
    setFavoritesOnly,
    availableTypes,
    pinnedCount,
    quotes,
  } = useQuotesFilters({ allLoadedQuotes, entities })

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
  const deleteQuote = useDeleteQuote()

  const [showForm, setShowForm] = useState(false)

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
  const lastVisibleIndex = virtualItems.length > 0 ? virtualItems[virtualItems.length - 1]!.index : 0
  useEffect(() => {
    if (!quotesPaged.hasNextPage || quotesPaged.isFetchingNextPage) return
    if (quotes.length === 0) return
    if (lastVisibleIndex >= quotes.length - 5) {
      quotesPaged.fetchNextPage()
    }
  }, [lastVisibleIndex, quotes.length, quotesPaged])

  return (
    <>
      {/* ω-B: wash gold — el lugar donde el lenguaje pesa. */}
      <header
        className="mb-10 flex items-baseline justify-between gap-6 px-3 -mx-3 py-2 -my-2 rounded-lg"
        style={sectionWashStyle('var(--accent-gold)')}
      >
        <div className="min-w-0">
          {/* σ-followup: eyebrow editorial — coherente con Momentos,
              Escuchas, Sugerencias, Entidades. */}
          <p
            className="section-eyebrow-serif mb-2"
            style={{ color: 'var(--accent-gold)' }}
          >
            fragmentos que retuviste
          </p>
          <h2 className="font-serif text-4xl text-ink-700 leading-none">Citas</h2>
          <div className="accent-rule mt-3 mb-2" />
          <p className="mt-2 text-sm text-ink-400 leading-relaxed max-w-2xl">
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
          {showForm && <QuoteForm entities={entities} />}

          {/* Chips de filtro por tipo de entidad atribuida. Mismo patrón que
              EntitiesView: sticky al top con backdrop blur, Todos + chip por
              tipo presente. No-sticky (siguiendo el cambio en
              EntitiesView): los chips scrollean con el contenido,
              desaparecen al subir las citas en el viewport. Si quieres
              cambiar filtro, scroll up. */}
          <QuotesFiltersBar
            availableTypes={availableTypes}
            totalCount={allLoadedQuotes.length}
            pinnedCount={pinnedCount}
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            favoritesOnly={favoritesOnly}
            setFavoritesOnly={setFavoritesOnly}
          />

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
                if (!quote) return null
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
                      // ρ-micro: bajado de 3.5rem (56px) a 2.5rem (40px) entre
                      // citas. La auditoría visual contaba ~120px de margen
                      // efectivo entre items; lo bajamos para que el ritmo de
                      // lectura sea más continuo sin perder respiración.
                      paddingBottom: '2.5rem',
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
          {/* ι5: folio number — número de página de libro impreso. */}
          <Folio current={Math.min(lastVisibleIndex + 1, quotes.length)} total={quotes.length} />
        </>
      )}
    </>
  )
}
