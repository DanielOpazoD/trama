import { ENTITY_TYPES, type Entity, type Quote, type Relationship } from '../../types'
import { ChevronRightIcon, SparkleIcon } from '../Icons'
import { typeAccent } from '../graph/GraphNode'

/**
 * G2 (FF3-c) — "Hilos recientes": últimos 8 eventos (entidades + citas +
 * relaciones) ordenados por fecha desc. Extraído de `HomeView.tsx`.
 *
 * Cada fila lleva un payload tipado para que el renderer `TimelineRow`
 * despache correctamente. La construcción de la timeline
 * (`buildTimeline`) se exporta para que el padre decida si renderear
 * separadores ornamentales (el orquestador necesita saber si la
 * timeline está vacía sin tener que computarla dos veces).
 */

export type TimelineEvent =
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

export function RecentTimeline({
  timeline,
  entities,
  onSelectEntity,
  onNavigateToGraph,
}: {
  timeline: TimelineEvent[]
  entities: Entity[]
  onSelectEntity: (id: string) => void
  onNavigateToGraph: () => void
}) {
  if (timeline.length === 0) return null

  return (
    <section>
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-micro uppercase tracking-eyebrow text-ink-300">
          Hilos recientes
        </h3>
        <button
          onClick={onNavigateToGraph}
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
  )
}

/**
 * Recent activity: last 8 events across entities + quotes + relationships,
 * newest first. Each one keeps a typed payload so the row renders correctly.
 *
 * Se exporta para que `HomeView` lo memoize y use `.length > 0` para
 * decidir si pintar separadores ornamentales — más barato que pasarle
 * todo el array crudo al componente y descubrir el length adentro.
 */
export function buildTimeline(
  entities: Entity[],
  quotes: Quote[],
  relationships: Relationship[],
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
      ENTITY_TYPES.find((t) => t.value === event.payload.type)?.label ??
      event.payload.type
    return (
      <button
        onClick={() => onSelectEntity(event.id)}
        style={{ borderLeftColor: typeAccent(event.payload.type) }}
        className="group card-paper-hover w-full text-left p-3 pl-4 border-l-[3px]"
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
                className="ml-1.5 inline-flex items-center text-[color:var(--accent-primary)] align-middle"
                title="añadido por IA"
              >
                <SparkleIcon size={10} />
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2 shrink-0">
            <span className="text-micro text-ink-300 tabular-nums">{date}</span>
            <ChevronRightIcon
              size={12}
              className="text-ink-200 group-hover:text-ink-400"
            />
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
        className="group card-paper-hover w-full text-left p-3"
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-micro uppercase tracking-eyebrow text-ink-300">
                cita
              </span>
              <span className="text-ink-500 text-sm">— {entity?.name ?? '?'}</span>
              {event.payload.isAI && (
                <span
                  className="inline-flex items-center text-[color:var(--accent-primary)]"
                  title="propuesta por IA"
                >
                  <SparkleIcon size={10} />
                </span>
              )}
            </div>
            <p className="mt-1 font-serif italic text-ink-600 text-body leading-snug truncate">
              «{event.payload.text}»
            </p>
          </div>
          <div className="flex items-baseline gap-2 shrink-0">
            <span className="text-micro text-ink-300 tabular-nums">{date}</span>
            <ChevronRightIcon
              size={12}
              className="text-ink-200 group-hover:text-ink-400"
            />
          </div>
        </div>
      </button>
    )
  }

  // relationship
  const from = entities.find((e) => e.id === event.payload.fromId)
  const to = entities.find((e) => e.id === event.payload.toId)
  return (
    <div className="card-paper p-3">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <div className="min-w-0">
          <span className="text-micro uppercase tracking-eyebrow text-ink-300 mr-2">
            relación
          </span>
          {from ? (
            <button
              onClick={() => onSelectEntity(from.id)}
              className="text-ink-700 hover:text-ink-800 border-b border-transparent hover:border-ink-300 transition-colors"
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
              className="text-ink-700 hover:text-ink-800 border-b border-transparent hover:border-ink-300 transition-colors"
            >
              {to.name}
            </button>
          ) : (
            <span className="text-ink-400">—</span>
          )}
          {event.payload.isAI && (
            <span
              className="ml-1.5 inline-flex items-center text-[color:var(--accent-primary)] align-middle"
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
