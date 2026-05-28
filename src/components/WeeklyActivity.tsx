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

type DailyBucket = {
  total: number
  entities: number
  quotes: number
  relationships: number
}

/**
 * Cuenta por día — array de 7 valores, donde [0] = hace 6 días, [6] = hoy.
 * Cada bucket distingue las tres métricas para que λ7 pueda teñir la barra
 * con el color de la métrica dominante de ese día (no todos los días son
 * iguales — algunos son "día de citas", otros "día de relaciones").
 */
function dailyTotals(
  entities: Entity[],
  quotes: Quote[],
  relationships: Relationship[],
): DailyBucket[] {
  const start = startOfNDaysAgo(7)
  const buckets: DailyBucket[] = Array.from({ length: 7 }, () => ({
    total: 0,
    entities: 0,
    quotes: 0,
    relationships: 0,
  }))
  function bump(iso: string, key: 'entities' | 'quotes' | 'relationships') {
    const t = new Date(iso).getTime()
    const days = Math.floor((t - start.getTime()) / MS_PER_DAY)
    if (days >= 0 && days < 7) {
      const bucket = buckets[days]!
      bucket.total += 1
      bucket[key] += 1
    }
  }
  for (const e of entities) bump(e.createdAt, 'entities')
  for (const q of quotes) bump(q.createdAt, 'quotes')
  for (const r of relationships) bump(r.createdAt, 'relationships')
  return buckets
}

function dominantColor(b: DailyBucket): string {
  // Devuelve el color del bucket dominante. Si todos son 0, gris.
  if (b.total === 0) return 'rgb(var(--ink-300))'
  const top = Math.max(b.entities, b.quotes, b.relationships)
  if (top === b.entities) return 'var(--type-persona)'
  if (top === b.quotes) return 'var(--accent-gold)'
  return 'var(--accent-sage)'
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

  const maxDaily = Math.max(1, ...stats.daily.map((d) => d.total))

  return (
    <section
      className="card-paper-elevated px-5 py-4 flex items-center gap-6 animate-fade-up"
      aria-label="Actividad de esta semana"
    >
      <div className="min-w-0 flex-1">
        <p className="section-eyebrow mb-1">esta semana</p>
        {/* λ7: cada métrica respira con su color de afinidad. Entidades en
            type-persona (marrón cálido), citas en accent-gold, relaciones
            en accent-sage. El número (+N) toma el color; el label sigue en
            ink para no convertir la card en arcoíris. */}
        <div className="flex items-baseline gap-x-4 gap-y-1 flex-wrap text-sm text-ink-600">
          {stats.entities > 0 && (
            <span>
              <strong className="tabular-nums" style={{ color: 'var(--type-persona)' }}>
                +{stats.entities}
              </strong>{' '}
              <span className="text-ink-400">
                {stats.entities === 1 ? 'entidad' : 'entidades'}
              </span>
            </span>
          )}
          {stats.quotes > 0 && (
            <span>
              <strong className="tabular-nums" style={{ color: 'var(--accent-gold)' }}>
                +{stats.quotes}
              </strong>{' '}
              <span className="text-ink-400">
                {stats.quotes === 1 ? 'cita' : 'citas'}
              </span>
            </span>
          )}
          {stats.relationships > 0 && (
            <span>
              <strong className="tabular-nums" style={{ color: 'var(--accent-sage)' }}>
                +{stats.relationships}
              </strong>{' '}
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
        {stats.daily.map((bucket, i) => {
          const pct = (bucket.total / maxDaily) * 100
          const isToday = i === 6
          // λ7: el color de cada barra refleja la métrica dominante de
          // ese día. Hoy mantiene un anillo más vivo (opacidad 1, color
          // pleno); días pasados con actividad usan el mismo color pero
          // con opacity 0.7 para que el "hoy" siga teniendo peso.
          const color = bucket.total > 0 ? dominantColor(bucket) : 'rgb(var(--ink-100))'
          return (
            <div
              key={i}
              className="w-1.5 rounded-sm transition-all duration-300"
              style={{
                height: bucket.total > 0 ? `${Math.max(8, pct)}%` : '4px',
                backgroundColor: color,
                opacity: bucket.total > 0 ? (isToday ? 1 : 0.7) : 0.5,
              }}
              title={
                bucket.total > 0
                  ? `${bucket.total} item${bucket.total === 1 ? '' : 's'}`
                  : 'sin actividad'
              }
            />
          )
        })}
      </div>
    </section>
  )
}
