import { useEffect, useMemo, useState } from 'react'
import {
  useEntitiesQuery,
  useInfiniteQuotesQuery,
  useRelationshipsQuery,
  useDeleteQuote,
} from '../state'
import { ViewHeader } from './ViewHeader'
import { EndMark } from './Icons'
import { EmptyMessage } from './EmptyMessage'
import { ErrorState } from './ErrorState'
import { QuoteSkeleton, SkeletonList } from './Skeleton'
import { Folio } from './Folio'
import { useMainScrollVirtualizer } from '../hooks/useMainScrollVirtualizer'
import { ENTITY_TYPES } from '../types'
import type { Entity } from '../types'
import { QuoteForm } from './quotes/QuoteForm'
import { QuoteItem } from './quotes/QuoteItem'
import { CopyImportPromptButton } from './quotes/CopyImportPromptButton'
import { useQuotesFilters } from './quotes/useQuotesFilters'
import { QuotesFiltersBar } from './quotes/QuotesFiltersBar'
import { PrintObject } from './print/PrintObject'
import { QuotesPrintSheet } from './print/PrintSheets'
import { DiceIcon, PrinterIcon, QuoteIcon, ReadingIcon } from './Icons'
import { LibroModal } from './quotes/LibroModal'
import { DensityToggle } from './DensityToggle'
import { useDensity } from '../hooks/useDensity'

const WORK_TYPES = new Set([
  'libro',
  'ensayo',
  'poema',
  'articulo',
  'cancion',
  'podcast',
  'album',
  'disco',
  'pelicula',
  'serie',
  'documental',
  'obra',
])
const PERSON_TYPES = new Set([
  'persona',
  'escritor',
  'filosofo',
  'musico',
  'banda',
  'director',
  'artista',
  'cientifico',
])

export function QuotesView({
  onSelectEntity,
  onOpenCareo,
}: {
  onSelectEntity?: (id: string) => void
  onOpenCareo?: () => void
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
  // Imprimir como objeto: ⌘P (o el botón del header) produce un pliego
  // tipografiado con las citas visibles, no un screenshot del DOM.
  const [printOpen, setPrintOpen] = useState(false)
  const [libroOpen, setLibroOpen] = useState(false)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault()
        setPrintOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // P0-densidad: modo compacto para escanear cientos de citas sin perder la
  // versión cómoda para leer pocas. measureElement corrige la altura real, así
  // que sólo bajamos el estimate inicial para que el salto sea mínimo.
  const { compact, setCompact } = useDensity(quotes.length)

  // Virtualized rendering: at 500+ quotes the previous full-list render
  // started to lag. We mount only the visible window + a small overscan.
  // estimateSize is intentionally generous (typical quote with author +
  // optional context + reflection lands around 300-360px). The measureElement
  // hook on each row corrects the estimate as soon as it's measured.
  const { listRef, virtualizer } = useMainScrollVirtualizer({
    count: quotes.length,
    estimateSize: compact ? 130 : 320,
    overscan: 8,
    deps: [showForm, quotes.length, typeFilter, compact],
  })

  // Trigger next-page fetch when the user scrolls into the last 5 items of
  // the currently rendered window. Reads the highest virtual index instead
  // of a sentinel element — keeps it tied to the virtualizer's own state.
  const virtualItems = virtualizer.getVirtualItems()
  const lastVisibleIndex =
    virtualItems.length > 0 ? virtualItems[virtualItems.length - 1]!.index : 0
  useEffect(() => {
    if (!quotesPaged.hasNextPage || quotesPaged.isFetchingNextPage) return
    if (quotes.length === 0) return
    if (lastVisibleIndex >= quotes.length - 5) {
      quotesPaged.fetchNextPage()
    }
  }, [lastVisibleIndex, quotes.length, quotesPaged])

  return (
    <>
      <ViewHeader
        title="Citas"
        eyebrow="fragmentos que retuviste"
        accent="var(--accent-gold)"
        spacing="tight"
        subtitle="Fragmentos textuales que atribuyes a una entidad. Una frase de un libro, algo que dijo una persona, un verso de una canción."
        action={
          <div className="flex items-center gap-4">
            {quotes.length > 0 && (
              <button
                onClick={() => setPrintOpen(true)}
                title="Imprimir pliego de citas (⌘P)"
                aria-label="Imprimir pliego de citas"
                className="text-xs uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors inline-flex items-center gap-1.5"
              >
                <PrinterIcon size={12} />
                Pliego
              </button>
            )}
            {quotes.length > 0 && (
              <button
                onClick={() => setLibroOpen(true)}
                title="Componer el florilegio como libro PDF"
                aria-label="Componer mi libro"
                className="text-xs uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors inline-flex items-center gap-1.5"
              >
                <ReadingIcon size={12} />
                Libro
              </button>
            )}
            <CopyImportPromptButton />
            {entities.length > 0 && (
              <button
                onClick={() => setShowForm((s) => !s)}
                className="text-xs uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
              >
                {showForm ? 'Cerrar' : 'Añadir'}
              </button>
            )}
          </div>
        }
      />

      {allLoadedQuotes.length > 0 && (
        <section
          aria-label="Taller de imprenta"
          className="mb-5 rounded-xl border border-ink-100/70 bg-paper-100/45 px-4 py-3"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-micro uppercase tracking-eyebrow text-ink-300">
                taller de imprenta
              </p>
              <p className="mt-1 font-serif text-xl text-ink-700">
                {allLoadedQuotes.length}{' '}
                {allLoadedQuotes.length === 1 ? 'cita cargada' : 'citas cargadas'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[28rem]">
              <PrintWorkshopTool
                icon={DiceIcon}
                label="Atril"
                description="en el buscador"
              />
              <PrintWorkshopTool
                icon={PrinterIcon}
                label="Lámina"
                description="desde ⋯ de cada cita"
              />
              <PrintWorkshopTool
                icon={ReadingIcon}
                label="Libro"
                description="composición PDF"
                onClick={() => setLibroOpen(true)}
              />
              <PrintWorkshopTool
                icon={QuoteIcon}
                label="Careo"
                description="abrir contrapunto"
                onClick={onOpenCareo}
              />
            </div>
          </div>
          <p className="mt-3 text-caption text-ink-400">
            Lámina vive en el menú ⋯ de cada cita; Careo abre dos voces frente a frente.
          </p>
        </section>
      )}

      {quotesPaged.isLoading ? (
        // Paridad con Entidades/Momentos/Inicio: skeleton en la carga
        // inicial en vez de dejar parpadear el empty state mientras la
        // primera página de citas viaja.
        <section className="mt-6 space-y-10">
          <SkeletonList count={4} Component={QuoteSkeleton} />
        </section>
      ) : quotesPaged.isError && allLoadedQuotes.length === 0 ? (
        <ErrorState
          title="No se pudieron cargar las citas"
          onRetry={() => quotesPaged.refetch()}
          retrying={quotesPaged.isFetching}
        />
      ) : entities.length === 0 ? (
        <EmptyMessage
          illustration="thread"
          title="No hay todavía a quién atribuir nada."
          body={
            <>
              Las citas viven pegadas a una entidad: una persona, un libro, una canción.
              Crea la primera entidad y vuelve.
            </>
          }
          hint="Pega un texto en la barra de abajo o entra a Entidades para empezar."
        />
      ) : (
        <>
          {showForm && <QuoteForm entities={entities} />}

          <div className="mb-3 flex justify-end">
            <DensityToggle compact={compact} onChange={setCompact} />
          </div>

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
                      {ENTITY_TYPES.find((t) => t.value === typeFilter)?.label ??
                        typeFilter}
                    </strong>{' '}
                    no aparece nada. Las citas se atribuyen al crearlas — si quieres
                    alguna de este tipo, atribúyela a una entidad de ese tipo.
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
                    Las citas son piezas que se quedan: una frase que te detuvo, un verso
                    que volvió. Cuando guardes la primera, su tipografía va a verse mejor
                    que esto.
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
                const author =
                  entity && WORK_TYPES.has(entity.type) ? authorOf(entity.id) : undefined
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
                      // ρ-micro: 2.5rem entre citas en cómodo; en compacto se
                      // baja a 1.25rem para escanear sin tanto desplazamiento.
                      paddingBottom: compact ? '1.25rem' : '2.5rem',
                    }}
                  >
                    <QuoteItem
                      quote={quote}
                      entity={entity}
                      author={author}
                      isFeature={isFeature}
                      compact={compact}
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
          {!quotesPaged.hasNextPage && !quotesPaged.isLoading && quotes.length >= 5 && (
            <div className="flex justify-center mt-8 mb-2 text-ink-300">
              <EndMark size={14} />
            </div>
          )}
          {/* ι5: folio number — número de página de libro impreso. */}
          <Folio
            current={Math.min(lastVisibleIndex + 1, quotes.length)}
            total={quotes.length}
          />
        </>
      )}
      {printOpen && (
        <PrintObject onDone={() => setPrintOpen(false)}>
          <QuotesPrintSheet
            quotes={quotes}
            entityName={(q) =>
              entities.find((e) => e.id === q.entityId)?.name ?? 'desconocida'
            }
            authorName={(q) => {
              const ent = entities.find((e) => e.id === q.entityId)
              return ent && !PERSON_TYPES.has(ent.type)
                ? authorOf(ent.id)?.name
                : undefined
            }}
            filterLabel={
              favoritesOnly
                ? 'favoritas'
                : typeFilter && typeFilter !== 'all'
                  ? typeFilter
                  : undefined
            }
          />
        </PrintObject>
      )}
      {libroOpen && <LibroModal onClose={() => setLibroOpen(false)} />}
    </>
  )
}

function PrintWorkshopTool({
  icon: Icon,
  label,
  description,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  description: string
  onClick?: () => void
}) {
  const className =
    'rounded-lg border border-ink-100/70 bg-paper-50/70 px-3 py-2 text-left transition-colors'
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${className} hover:border-ink-200 hover:bg-paper-50`}
      >
        <PrintWorkshopToolContent icon={Icon} label={label} description={description} />
      </button>
    )
  }

  return (
    <div className={className}>
      <PrintWorkshopToolContent icon={Icon} label={label} description={description} />
    </div>
  )
}

function PrintWorkshopToolContent({
  icon: Icon,
  label,
  description,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  description: string
}) {
  return (
    <>
      <div className="flex items-center gap-1.5 text-xs font-medium text-ink-700">
        <Icon size={13} className="text-ink-400" />
        {label}
      </div>
      <p className="mt-1 text-micro uppercase tracking-[0.16em] text-ink-300">
        {description}
      </p>
    </>
  )
}
