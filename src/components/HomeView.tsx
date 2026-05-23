import { useMemo, useState } from 'react'
import {
  useEntitiesQuery,
  useProactiveQuery,
  useQuotesQuery,
  useRelationshipsQuery,
} from '../state'
import { ENTITY_TYPES, type Entity, type Quote } from '../types'
import { ChevronRightIcon, EndMark, OrnamentBreak, SparkleIcon } from './Icons'
import { EmptyMessage } from './EmptyMessage'
import {
  QuoteSkeleton,
  SkeletonList,
  TimelineRowSkeleton,
} from './Skeleton'
import { typeAccent } from './graph/GraphNode'

/**
 * Home is the first thing the user sees. It's not the graph (intimidating
 * when there are 21 nodes; useless when there are 5) and it's not a form.
 * It's a small daily front page made out of the user's own trama.
 *
 * Sections, in order of "you'll actually read this":
 *   1. A featured quote, picked at random, drop-cap'd. Re-discovery.
 *   2. Last things added — entities + quotes + relationships in one timeline.
 *   3. Pending AI suggestions (if any) — a small CTA to the Sugerencias tab.
 *
 * Everything is clickable and routes to the right place.
 */
export function HomeView({
  onNavigate,
  onSelectEntity,
}: {
  onNavigate: (view: 'grafo' | 'entidades' | 'citas' | 'relaciones' | 'sugerencias') => void
  onSelectEntity: (id: string) => void
}) {
  const { data: entities = [], isLoading: entitiesLoading } = useEntitiesQuery()
  const { data: quotes = [] } = useQuotesQuery()
  const { data: relationships = [] } = useRelationshipsQuery()
  const proactive = useProactiveQuery()
  const pendingCount = proactive.data?.length ?? 0

  // Featured quote: rotación aleatoria.
  // Antes era determinístico por día (mismo destacado durante 24h). El
  // usuario pidió que rote. Cada montaje de HomeView elige al azar; un
  // contador (rollCounter) deja que el botón "rotar" pida otra.
  const [rollCounter, setRollCounter] = useState(0)
  const featuredQuote = useMemo(
    () => pickFeaturedQuote(quotes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quotes, rollCounter],
  )

  // Recent activity: last 8 events across entities + quotes + relationships,
  // newest first. Each one keeps a typed payload so the row renders correctly.
  const timeline = useMemo(
    () => buildTimeline(entities, quotes, relationships),
    [entities, quotes, relationships],
  )

  const greeting = greetingForNow()
  const totalEntities = entities.length

  if (entitiesLoading) {
    // Skeleton de Home — header placeholder + featured quote silueta +
    // timeline de 5 filas con stagger. Reemplaza al "cargando…" italic
    // que se sentía amateur en la portada del producto.
    return (
      <div>
        <header className="mb-12 space-y-3">
          <div className="h-3 w-32 bg-ink-100/40 rounded animate-pulse-subtle" />
          <div className="h-10 w-40 bg-ink-100/40 rounded animate-pulse-subtle" />
          <div className="h-3 w-80 bg-ink-100/40 rounded animate-pulse-subtle mt-4" />
        </header>
        <div className="mb-12">
          <QuoteSkeleton />
        </div>
        <section className="space-y-2">
          <SkeletonList count={5} Component={TimelineRowSkeleton} />
        </section>
      </div>
    )
  }

  return (
    <>
      <header className="mb-12 flex items-baseline justify-between gap-6">
        <div className="min-w-0">
          <p className="text-micro uppercase tracking-shout text-ink-300">
            {greeting}
          </p>
          <h2 className="font-serif text-4xl text-ink-700 leading-none mt-2">
            Inicio
          </h2>
          <div className="accent-rule mt-3 mb-2" />
          <p className="mt-2 text-sm text-ink-400 leading-relaxed max-w-md">
            {totalEntities === 0
              ? 'Todavía vacía. Pega un texto abajo y la trama empieza.'
              : `${totalEntities} ${totalEntities === 1 ? 'entidad' : 'entidades'} ·` +
                ` ${quotes.length} ${quotes.length === 1 ? 'cita' : 'citas'} ·` +
                ` ${relationships.length} ${relationships.length === 1 ? 'relación' : 'relaciones'}`}
          </p>
        </div>
        {pendingCount > 0 && (
          <button
            onClick={() => onNavigate('sugerencias')}
            className="ai-cta"
          >
            <SparkleIcon size={12} />
            {pendingCount} {pendingCount === 1 ? 'sugerencia' : 'sugerencias'} pendiente
            {pendingCount === 1 ? '' : 's'}
          </button>
        )}
      </header>

      {totalEntities === 0 ? (
        <EmptyMessage
          title="Una trama recién empieza así, en silencio."
          body={
            <>
              Pega un párrafo abajo — algo que te llegó, una conversación que
              quieres retener, un libro que estás leyendo. La IA propone qué
              entidades, relaciones y citas extraer. Tú apruebas.
            </>
          }
          hint="Si tienes Spotify conectado, también puedes pegar una playlist."
        />
      ) : (
        <div className="space-y-14">
          {featuredQuote && (
            <FeaturedQuote
              quote={featuredQuote}
              entity={entities.find((e) => e.id === featuredQuote.entityId)}
              onSelectEntity={onSelectEntity}
              onReroll={quotes.length > 1 ? () => setRollCounter((c) => c + 1) : undefined}
            />
          )}

          {featuredQuote && timeline.length > 0 && (
            <div className="flex justify-center -my-4">
              <OrnamentBreak className="ornament" />
            </div>
          )}

          {timeline.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between mb-4">
                <h3 className="text-micro uppercase tracking-eyebrow text-ink-300">
                  Hilos recientes
                </h3>
                <button
                  onClick={() => onNavigate('grafo')}
                  className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
                >
                  ver grafo →
                </button>
              </div>
              <ul className="space-y-2">
                {timeline.map((event, idx) => (
                  <li
                    key={`${event.kind}-${event.id}`}
                    className="animate-fade-up"
                    style={{ animationDelay: `${Math.min(idx * 40, 280)}ms` }}
                  >
                    <TimelineRow
                      event={event}
                      entities={entities}
                      onSelectEntity={onSelectEntity}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(featuredQuote || timeline.length > 0) && (
            <div className="flex justify-center pt-2 pb-1">
              <EndMark className="ornament" />
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ---------- featured quote ----------

function pickFeaturedQuote(quotes: Quote[]): Quote | null {
  if (quotes.length === 0) return null
  // Pick aleatorio. Si hay más de una cita, evitamos repetir la primera
  // del array por sesgo del orden — simplemente Math.random sobre todo.
  const idx = Math.floor(Math.random() * quotes.length)
  return quotes[idx]
}

function FeaturedQuote({
  quote,
  entity,
  onSelectEntity,
  onReroll,
}: {
  quote: Quote
  entity: Entity | undefined
  onSelectEntity: (id: string) => void
  onReroll?: () => void
}) {
  const first = quote.text[0]
  const rest = quote.text.slice(1)
  return (
    <section className="animate-fade-up">
      <div className="mb-3 flex items-baseline justify-between">
        <p
          className="text-micro uppercase tracking-eyebrow"
          style={{ color: 'var(--accent-gold)' }}
        >
          ◆ una cita de tu trama
        </p>
        {onReroll && (
          <button
            onClick={onReroll}
            className="text-xs uppercase tracking-wider text-ink-300 hover:text-ink-700 transition-colors"
            title="Rotar a otra cita"
          >
            Otra
          </button>
        )}
      </div>
      <blockquote className="quote-block text-lg md:text-xl text-ink-700 leading-snug clear-both overflow-hidden">
        <span className="float-left mr-1.5 mt-1 text-4xl leading-[0.85] font-serif text-ink-700 select-none">
          {first}
        </span>
        {rest}
      </blockquote>
      <div className="mt-4 text-sm text-ink-400">
        {entity ? (
          <button
            onClick={() => onSelectEntity(entity.id)}
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
      </div>
      {quote.userReflection && (
        <div className="mt-4">
          <p className="text-micro uppercase tracking-eyebrow text-ink-300 mb-1">
            tu reflexión
          </p>
          <p className="text-ink-600 text-sm leading-relaxed whitespace-pre-wrap font-serif italic">
            {quote.userReflection}
          </p>
        </div>
      )}
    </section>
  )
}

// ---------- timeline ----------

type TimelineEvent =
  | {
      kind: 'entity'
      id: string
      at: string
      payload: { name: string; type: string; isAI: boolean }
    }
  | {
      kind: 'quote'
      id: string
      at: string
      payload: { text: string; entityId: string; isAI: boolean }
    }
  | {
      kind: 'relationship'
      id: string
      at: string
      payload: { fromId: string; toId: string; type: string; isAI: boolean }
    }

function buildTimeline(
  entities: Entity[],
  quotes: Quote[],
  relationships: Array<{
    id: string
    fromId: string
    toId: string
    type: string
    origin: { kind: string }
    createdAt: string
  }>,
): TimelineEvent[] {
  const events: TimelineEvent[] = [
    ...entities.map(
      (e): TimelineEvent => ({
        kind: 'entity' as const,
        id: e.id,
        at: e.createdAt,
        payload: { name: e.name, type: e.type, isAI: e.origin.kind === 'ai' },
      }),
    ),
    ...quotes.map(
      (q): TimelineEvent => ({
        kind: 'quote' as const,
        id: q.id,
        at: q.createdAt,
        payload: { text: q.text, entityId: q.entityId, isAI: q.origin.kind === 'ai' },
      }),
    ),
    ...relationships.map(
      (r): TimelineEvent => ({
        kind: 'relationship' as const,
        id: r.id,
        at: r.createdAt,
        payload: {
          fromId: r.fromId,
          toId: r.toId,
          type: r.type,
          isAI: r.origin.kind === 'ai',
        },
      }),
    ),
  ]
  events.sort((a, b) => b.at.localeCompare(a.at))
  return events.slice(0, 8)
}

function TimelineRow({
  event,
  entities,
  onSelectEntity,
}: {
  event: TimelineEvent
  entities: Entity[]
  onSelectEntity: (id: string) => void
}) {
  const date = formatRelative(event.at)

  if (event.kind === 'entity') {
    const typeLabel =
      ENTITY_TYPES.find((t) => t.value === event.payload.type)?.label ?? event.payload.type
    return (
      <button
        onClick={() => onSelectEntity(event.id)}
        style={{ borderLeftColor: typeAccent(event.payload.type) }}
        className="group w-full text-left p-3 pl-4 bg-paper-50/40 border border-ink-100/50 border-l-[3px] rounded-xl hover:border-ink-100 hover:bg-paper-50/70 transition-all"
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <span className="text-micro uppercase tracking-eyebrow text-ink-300 mr-2">
              entidad
            </span>
            <span className="text-ink-700">{event.payload.name}</span>
            <span
              className="ml-2 text-micro uppercase tracking-eyebrow"
              style={{ color: typeAccent(event.payload.type) }}
            >
              {typeLabel}
            </span>
            {event.payload.isAI && (
              <span
                className="ml-1.5 inline-flex items-center text-sky-700/70 align-middle"
                title="añadido por IA"
              >
                <SparkleIcon size={10} />
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2 shrink-0">
            <span className="text-micro text-ink-300 tabular-nums">{date}</span>
            <ChevronRightIcon size={12} className="text-ink-200 group-hover:text-ink-400" />
          </div>
        </div>
      </button>
    )
  }

  if (event.kind === 'quote') {
    const entity = entities.find((e) => e.id === event.payload.entityId)
    return (
      <button
        onClick={() => entity && onSelectEntity(entity.id)}
        className="group w-full text-left p-3 bg-paper-50/40 border border-ink-100/50 rounded-xl hover:border-ink-100 hover:bg-paper-50/70 transition-all"
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-micro uppercase tracking-eyebrow text-ink-300">cita</span>
              <span className="text-ink-500 text-sm">— {entity?.name ?? '?'}</span>
              {event.payload.isAI && (
                <span
                  className="inline-flex items-center text-sky-700/70"
                  title="propuesta por IA"
                >
                  <SparkleIcon size={10} />
                </span>
              )}
            </div>
            <p className="mt-1 font-serif italic text-ink-600 text-sm leading-snug truncate">
              «{event.payload.text}»
            </p>
          </div>
          <div className="flex items-baseline gap-2 shrink-0">
            <span className="text-micro text-ink-300 tabular-nums">{date}</span>
            <ChevronRightIcon size={12} className="text-ink-200 group-hover:text-ink-400" />
          </div>
        </div>
      </button>
    )
  }

  // relationship
  const from = entities.find((e) => e.id === event.payload.fromId)
  const to = entities.find((e) => e.id === event.payload.toId)
  return (
    <div className="p-3 bg-paper-50/40 border border-ink-100/50 rounded-xl">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <div className="min-w-0">
          <span className="text-micro uppercase tracking-eyebrow text-ink-300 mr-2">
            relación
          </span>
          {from ? (
            <button
              onClick={() => onSelectEntity(from.id)}
              className="text-ink-700 hover:text-ink-900 border-b border-transparent hover:border-ink-300 transition-colors"
            >
              {from.name}
            </button>
          ) : (
            <span className="text-ink-400">—</span>
          )}
          <span className="mx-2 text-micro uppercase tracking-eyebrow text-ink-300">
            {event.payload.type}
          </span>
          {to ? (
            <button
              onClick={() => onSelectEntity(to.id)}
              className="text-ink-700 hover:text-ink-900 border-b border-transparent hover:border-ink-300 transition-colors"
            >
              {to.name}
            </button>
          ) : (
            <span className="text-ink-400">—</span>
          )}
          {event.payload.isAI && (
            <span
              className="ml-1.5 inline-flex items-center text-sky-700/70 align-middle"
              title="propuesta por IA"
            >
              <SparkleIcon size={10} />
            </span>
          )}
        </div>
        <span className="text-micro text-ink-300 tabular-nums shrink-0">{date}</span>
      </div>
    </div>
  )
}

// ---------- helpers ----------

function greetingForNow(): string {
  const h = new Date().getHours()
  if (h < 6) return 'Aún de noche'
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'recién'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `hace ${days} d`
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' })
}
