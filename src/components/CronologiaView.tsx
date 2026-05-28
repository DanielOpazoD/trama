import { useMemo } from 'react'
import { useInfiniteCronologiaQuery } from '../state'
import type { CronologiaEntrada } from '../api'
import { seasonOf, seasonKeyString, formatSeason } from '../lib/season'
import { ViewHeader } from './ViewHeader'
import { Paginator } from './Paginator'
import { EmptyMessage } from './EmptyMessage'
import { SkeletonList, TimelineRowSkeleton } from './Skeleton'

/**
 * Cronología (Bloque #4) — la superficie de lectura del tiempo.
 *
 * No es Momentos (captura) ni Crónicas (síntesis de la IA): es *hojear* el
 * tiempo. Un stream plano newest-first que el servidor teje de las cuatro
 * corrientes del archivo (citas, momentos, escuchas semanales, crónicas) y
 * que acá agrupamos por estación — un ritmo editorial más amplio que el día.
 *
 * Cada entrada hereda el color de su sección de origen (cita → gold,
 * momento → bronce, escucha → rojo-tierra, crónica → prusia) para que el ojo
 * lea de un vistazo de qué corriente viene sin perder el hilo cronológico.
 */

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** Config visual por corriente: etiqueta + color heredado de su sección. */
const KIND_META: Record<CronologiaEntrada['kind'], { label: string; color: string }> = {
  cita: { label: 'cita', color: 'var(--accent-gold)' },
  momento: { label: 'momento', color: 'var(--type-evento)' },
  escucha: { label: 'escucha', color: 'var(--type-musico)' },
  cronica: { label: 'crónica', color: 'var(--accent-primary)' },
}

/** "23 may" — gutter izquierdo de cada entrada. */
function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

/**
 * Agrupa entradas (ya newest-first) por estación. Map preserva el orden
 * de inserción, así las estaciones también salen newest-first. Entradas
 * con fecha inválida se descartan en silencio.
 */
function groupBySeason(
  entradas: CronologiaEntrada[],
): Array<{ key: string; label: string; entries: CronologiaEntrada[] }> {
  const groups = new Map<string, { label: string; entries: CronologiaEntrada[] }>()
  for (const e of entradas) {
    const d = new Date(e.occurredAt)
    if (Number.isNaN(d.getTime())) continue
    const sk = seasonOf(d)
    const key = seasonKeyString(sk)
    const existing = groups.get(key)
    if (existing) existing.entries.push(e)
    else groups.set(key, { label: formatSeason(sk), entries: [e] })
  }
  return Array.from(groups.entries()).map(([key, { label, entries }]) => ({
    key,
    label,
    entries,
  }))
}

export function CronologiaView({
  onSelectEntity,
}: {
  onSelectEntity: (id: string) => void
}) {
  const query = useInfiniteCronologiaQuery()

  // Dedup defensivo por (kind,id): la paginación por watermark usa un cursor
  // estrictamente-menor, pero un empate de timestamp en el borde podría
  // colar una repetición — y dos keys iguales rompen React. Barato y seguro.
  const entradas = useMemo(() => {
    const seen = new Set<string>()
    const out: CronologiaEntrada[] = []
    for (const page of query.data?.pages ?? []) {
      for (const e of page.entradas) {
        const k = `${e.kind}-${e.id}`
        if (seen.has(k)) continue
        seen.add(k)
        out.push(e)
      }
    }
    return out
  }, [query.data])

  const seasons = useMemo(() => groupBySeason(entradas), [entradas])

  return (
    <>
      <ViewHeader
        title="Cronología"
        eyebrow="✦ hojear el tiempo"
        accent="var(--accent-sage)"
        subtitle="Las cuatro corrientes del archivo en un solo hilo: lo que el lenguaje fijó, lo que capturaste, lo que sonó, lo que la IA escribió del mes. Leído como un diario, por estaciones."
        spacing="tight"
      />

      {query.isLoading ? (
        <div className="space-y-4">
          <SkeletonList count={6} Component={TimelineRowSkeleton} />
        </div>
      ) : entradas.length === 0 ? (
        <EmptyMessage
          illustration="thread"
          title="El tiempo todavía está en blanco"
          body={
            <>
              A medida que guardes citas, momentos, escuchas y crónicas, esta página los
              va tejiendo en un solo hilo cronológico para releer.
            </>
          }
        />
      ) : (
        <div className="space-y-10">
          {seasons.map(({ key, label, entries }) => (
            <section key={key} className="animate-fade-up">
              <div className="mb-4 flex items-baseline gap-3">
                <h3
                  className="section-eyebrow-serif"
                  style={{ color: 'var(--accent-sage)' }}
                >
                  {label}
                </h3>
                <span className="flex-1 h-px bg-ink-100/40" />
                <span className="text-caption text-ink-300 tabular-nums">
                  {entries.length} {entries.length === 1 ? 'entrada' : 'entradas'}
                </span>
              </div>
              <ul className="space-y-6">
                {entries.map((e) => (
                  <li key={`${e.kind}-${e.id}`} className="flex gap-4">
                    <time className="w-14 shrink-0 text-caption text-ink-300 tabular-nums pt-0.5">
                      {shortDate(e.occurredAt)}
                    </time>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-micro uppercase tracking-eyebrow mb-1"
                        style={{ color: KIND_META[e.kind].color }}
                      >
                        {e.kind === 'cronica'
                          ? `crónica · ${MONTH_NAMES[e.month - 1]} ${e.year}`
                          : KIND_META[e.kind].label}
                      </p>
                      <EntryBody entry={e} onSelectEntity={onSelectEntity} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <Paginator
            hasNext={query.hasNextPage ?? false}
            loading={query.isFetchingNextPage}
            onLoadMore={() => query.fetchNextPage()}
            showEndMark={entradas.length >= 5}
          />
        </div>
      )}
    </>
  )
}

/** Render del cuerpo de una entrada según su corriente. */
function EntryBody({
  entry,
  onSelectEntity,
}: {
  entry: CronologiaEntrada
  onSelectEntity: (id: string) => void
}) {
  switch (entry.kind) {
    case 'cita':
      return (
        <button
          type="button"
          onClick={() => onSelectEntity(entry.entityId)}
          className="text-left w-full group"
        >
          <p className="font-serif text-ink-700 italic leading-relaxed group-hover:text-ink-900 transition-colors">
            «{entry.text}»
          </p>
          <p className="mt-1 text-caption text-ink-400">
            — {entry.entityName}
            {entry.source ? `, ${entry.source}` : ''}
          </p>
        </button>
      )
    case 'momento':
      return entry.text ? (
        <p className="text-ink-600 leading-relaxed">{entry.text}</p>
      ) : (
        <p className="text-ink-300 italic">(sin texto)</p>
      )
    case 'escucha':
      return (
        <p className="text-ink-600 leading-relaxed">
          La semana sonó a{' '}
          <span className="text-ink-800 font-medium">{entry.topArtist ?? '—'}</span>
          <span className="text-ink-300">
            {' · '}
            {entry.topArtistPlays} de {entry.totalPlays}{' '}
            {entry.totalPlays === 1 ? 'reproducción' : 'reproducciones'}
          </span>
        </p>
      )
    case 'cronica':
      return (
        <p className="font-serif text-ink-700 leading-relaxed">
          {entry.text}
          {entry.text.length >= 600 ? '…' : ''}
        </p>
      )
  }
}
