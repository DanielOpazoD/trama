import { useMemo, useState } from 'react'
import {
  useEntitiesQuery,
  useProactiveQuery,
  useQuotesQuery,
  useRelationshipsQuery,
} from '../state'
import { EmptyMessage } from './EmptyMessage'
import { EndMark, OrnamentBreak } from './Icons'
import {
  QuoteSkeleton,
  SkeletonList,
  TimelineRowSkeleton,
} from './Skeleton'
import { WeeklyActivity } from './WeeklyActivity'
import { useHiloOfTheDay } from '../hooks/useHiloOfTheDay'
import { Greeting } from './home/Greeting'
import { FeaturedQuote, pickFeaturedQuote } from './home/FeaturedQuote'
import { ActivityHeatmap } from './home/ActivityHeatmap'
import { RecentTimeline, buildTimeline } from './home/RecentTimeline'

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
 * G2 (FF3-c) — HomeView ahora es un orquestador delgado: queries +
 * memoizaciones + layout. Cada sección visual vive en su propio
 * archivo bajo `src/components/home/`:
 *   - Greeting → header con saludo + fecha + CTA sugerencias
 *   - FeaturedQuote → pull-quote editorial con backplate cálido
 *   - ActivityHeatmap → wrapper de CalendarHeatmap con navegación
 *   - RecentTimeline → "Hilos recientes"
 *
 * Las queries siguen viviendo acá (single source of truth) y la data
 * fluye por props a los sub-componentes.
 */
export function HomeView({
  onNavigate,
  onSelectEntity,
}: {
  onNavigate: (view: 'grafo' | 'entidades' | 'citas' | 'momentos' | 'sugerencias') => void
  onSelectEntity: (id: string) => void
}) {
  const { data: entities = [], isLoading: entitiesLoading } = useEntitiesQuery()
  const { data: quotes = [] } = useQuotesQuery()
  const { data: relationships = [] } = useRelationshipsQuery()
  const proactive = useProactiveQuery()
  const pendingCount = proactive.data?.length ?? 0

  // δ7: una vez por día, detectamos aniversarios en la data del usuario
  // y cacheamos un "hilo del día" en localStorage. El próximo splash lo
  // lee y reemplaza el aforismo random. Si no hay aniversario para hoy,
  // queda null y el splash sigue con random — degrada silenciosamente.
  useHiloOfTheDay(entities, quotes)

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

  // Timeline memoizada acá para que el orquestador pueda decidir si
  // pintar ornamentos sin computar dos veces.
  const timeline = useMemo(
    () => buildTimeline(entities, quotes, relationships),
    [entities, quotes, relationships],
  )

  const totalEntities = entities.length

  if (entitiesLoading) {
    // Skeleton de Home — header placeholder + featured quote silueta +
    // timeline de 5 filas con stagger. Reemplaza al "cargando…" italic
    // que se sentía amateur en la portada del producto.
    return (
      <div>
        <header className="mb-10 space-y-3">
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
      {/* Header del HomeView: greeting + título + accent rule.
          Antes había un párrafo con los totales "63 entidades · 77 citas
          · 160 relaciones" pero era información duplicada: el sidebar
          ya muestra los counts (con NumberTicker), y la sección "ESTA
          SEMANA" abajo muestra los deltas de actividad. La portada queda
          más limpia sin esa fila — el ojo va directo a la Cita destacada
          en vez de pasar por una métrica.

          Caso empty (totalEntities === 0): el EmptyMessage abajo cubre
          la guía con su illustration + body completos. */}
      <Greeting
        pendingCount={pendingCount}
        onNavigateToSuggestions={() => onNavigate('sugerencias')}
      />

      {totalEntities === 0 ? (
        <EmptyMessage
          illustration="weave"
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
        // Reorden δ2: la Cita primero, Weekly después.
        // Razón: Trama es un cuaderno de citas + entidades. La cita
        // destacada ES la portada editorial; el dashboard de actividad
        // es el dato secundario. Antes era al revés y el primer impacto
        // visual era una gráfica de barras — útil pero no característico.
        // Ahora arrancás con tipografía serif y atribución, como abrir
        // un libro al azar. El ritmo total es --space-8 entre secciones.
        <div className="space-y-12">
          {featuredQuote && (
            <FeaturedQuote
              quote={featuredQuote}
              entity={entities.find((e) => e.id === featuredQuote.entityId)}
              onSelectEntity={onSelectEntity}
              onReroll={
                quotes.length > 1 ? () => setRollCounter((c) => c + 1) : undefined
              }
            />
          )}

          {featuredQuote && (
            <div className="flex justify-center -my-2">
              <OrnamentBreak className="ornament" />
            </div>
          )}

          {/* Pulso de la semana — solo aparece si hubo actividad en
              los últimos 7 días. Si no, no contamina la portada. */}
          <WeeklyActivity
            entities={entities}
            quotes={quotes}
            relationships={relationships}
          />

          <ActivityHeatmap
            entities={entities}
            quotes={quotes}
            relationships={relationships}
            onNavigateToMomentos={() => onNavigate('momentos')}
          />

          {timeline.length > 0 && (
            <div className="flex justify-center -my-2">
              <OrnamentBreak className="ornament" />
            </div>
          )}

          <RecentTimeline
            timeline={timeline}
            entities={entities}
            onSelectEntity={onSelectEntity}
            onNavigateToGraph={() => onNavigate('grafo')}
          />

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
