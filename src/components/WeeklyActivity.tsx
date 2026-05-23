import { useMemo } from 'react'
import type { Entity, Quote, Relationship } from '../types'

/**
 * Hero block en Inicio que muestra el pulso de la trama esta semana:
 *
 *   "Esta semana
 *    + 12 entidades  + 8 citas  + 5 relaciones
 *    [sparkline de los últimos 7 días]"
 *
 * Calcula todo en el cliente a partir de los created_at que ya tenemos
 * en cache. No requiere endpoint nuevo. Si no hay actividad esta semana,
 * el componente no se renderiza — evita un bloque vacío en la portada.
 */

const MS_PER_DAY = 86_400_000

function startOfWeek(): Date {
  const now = new Date()
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  // ISO week: lunes como inicio. getDay() = 0 (dom), 1 (lun), ...
  // Calculamos cuántos días retroceder para llegar al lunes.
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  return d
}

function startOfNDaysAgo(n: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n + 1)
  return d
}

/**
 * Cuenta por día — array de 7 valores, donde [0] = hace 6 días, [6] = hoy.
 * Cada item es la suma de entities + quotes + relationships creadas ese día.
 */
function dailyTotals(
  entities: Entity[],
  quotes: Quote[],
  relationships: Relationship[],
): number[] {
  const start = startOfNDaysAgo(7)
  const buckets = new Array(7).fill(0)
  function bump(iso: string) {
    const t = new Date(iso).getTime()
    const days = Math.floor((t - start.getTime()) / MS_PER_DAY)
    if (days >= 0 && days < 7) buckets[days] += 1
  }
  for (const e of entities) bump(e.createdAt)
  for (const q of quotes) bump(q.createdAt)
  for (const r of relationships) bump(r.createdAt)
  return buckets
}

export function WeeklyActivity({
  entities,
  quotes,
  relationships,
}: {
  entities: Entity[]
  quotes: Quote[]
  relationships: Relationship[]
}) {
  const stats = useMemo(() => {
    const weekStart = startOfWeek().getTime()
    const inWeek = (iso: string) => new Date(iso).getTime() >= weekStart

    return {
      entities: entities.filter((e) => inWeek(e.createdAt)).length,
      quotes: quotes.filter((q) => inWeek(q.createdAt)).length,
      relationships: relationships.filter((r) => inWeek(r.createdAt)).length,
      daily: dailyTotals(entities, quotes, relationships),
    }
  }, [entities, quotes, relationships])

  const totalWeek = stats.entities + stats.quotes + stats.relationships
  if (totalWeek === 0) return null

  const maxDaily = Math.max(1, ...stats.daily)

  return (
    <section
      className="card-paper-elevated px-5 py-4 flex items-center gap-6 animate-fade-up"
      aria-label="Actividad de esta semana"
    >
      <div className="min-w-0 flex-1">
        <p className="section-eyebrow mb-1">esta semana</p>
        <div className="flex items-baseline gap-x-4 gap-y-1 flex-wrap text-sm text-ink-600">
          {stats.entities > 0 && (
            <span>
              <strong className="text-ink-800 tabular-nums">+{stats.entities}</strong>{' '}
              <span className="text-ink-400">
                {stats.entities === 1 ? 'entidad' : 'entidades'}
              </span>
            </span>
          )}
          {stats.quotes > 0 && (
            <span>
              <strong className="text-ink-800 tabular-nums">+{stats.quotes}</strong>{' '}
              <span className="text-ink-400">
                {stats.quotes === 1 ? 'cita' : 'citas'}
              </span>
            </span>
          )}
          {stats.relationships > 0 && (
            <span>
              <strong className="text-ink-800 tabular-nums">+{stats.relationships}</strong>{' '}
              <span className="text-ink-400">
                {stats.relationships === 1 ? 'relación' : 'relaciones'}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Sparkline — 7 barras verticales, una por día. Lunes a hoy.
          La altura es proporcional al máximo de la semana. */}
      <div
        className="hidden sm:flex items-end gap-[3px] h-10 shrink-0"
        role="img"
        aria-label="Distribución diaria de actividad — últimos 7 días"
      >
        {stats.daily.map((count, i) => {
          const pct = (count / maxDaily) * 100
          const isToday = i === 6
          return (
            <div
              key={i}
              className="w-1.5 rounded-sm transition-all duration-300"
              style={{
                height: count > 0 ? `${Math.max(8, pct)}%` : '4px',
                backgroundColor: isToday
                  ? 'var(--accent-primary)'
                  : count > 0
                    ? 'rgb(var(--ink-300))'
                    : 'rgb(var(--ink-100))',
                opacity: count > 0 || isToday ? 1 : 0.5,
              }}
              title={count > 0 ? `${count} item${count === 1 ? '' : 's'}` : 'sin actividad'}
            />
          )
        })}
      </div>
    </section>
  )
}
