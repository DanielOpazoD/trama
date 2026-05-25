import { useMemo } from 'react'
import type { Entity, Quote, Relationship } from '../types'

/**
 * π1: Calendar heatmap — un grid 7×N de los últimos 84 días (12 semanas)
 * que muestra el ritmo de actividad de la trama, tintado por la métrica
 * dominante de cada día. Inspirado por el contribution graph de GitHub
 * pero con paleta editorial (no verdes únicos).
 *
 * Mapeo de colores (mismo del WeeklyActivity de λ7):
 *   - dominante entidades  → var(--type-persona) (marrón cálido)
 *   - dominante citas      → var(--accent-gold)
 *   - dominante relaciones → var(--accent-sage)
 *   - sin actividad        → ink-100 (placeholder)
 *
 * Cada celda 11×11px, gap 3px. El alpha de la celda se modula por la
 * intensidad relativa al máximo de la ventana (0.3 → 1.0).
 *
 * Layout:
 *   - 12 columnas (12 semanas), cada columna = una semana
 *   - 7 filas (lunes a domingo)
 *   - Labels: meses arriba (cuando una nueva columna entra en un mes
 *     diferente), días en la izquierda (L, M, X, J, V, S, D, mostrando
 *     solo cada otra para ahorrar espacio)
 *
 * Si no hay datos en los últimos 84 días: devuelve null. Si hay 1-2
 * items: render igual pero todo claro (no es bug, es la realidad).
 */

const MS_PER_DAY = 86_400_000
// ρ-canvas: subimos de 12 a 24 semanas (medio año). A 12 semanas la
// card quedaba casi vacía cuando la trama llevaba poco tiempo activa
// o cuando los datos están concentrados en pocos días — mucho real
// estate "muerto". Con 24 semanas el heatmap recupera densidad y
// permite leer rachas, pausas y estacionalidad de la práctica.
const WEEKS = 24
const TOTAL_DAYS = WEEKS * 7

type DayBucket = {
  date: Date
  total: number
  entities: number
  quotes: number
  relationships: number
}

function startOfCalendarWindow(): Date {
  // Empieza el lunes que cae TOTAL_DAYS - 1 días atrás (para incluir hoy).
  // El grid termina en HOY y empieza alineado al lunes anterior.
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setDate(today.getDate() - (TOTAL_DAYS - 1))
  // Llevamos start al lunes (o el mismo día si ya es lunes).
  const startDow = start.getDay()
  const offsetToMonday = startDow === 0 ? 6 : startDow - 1
  start.setDate(start.getDate() - offsetToMonday)
  return start
}

function buildBuckets(
  entities: Entity[],
  quotes: Quote[],
  relationships: Relationship[],
): DayBucket[] {
  const start = startOfCalendarWindow()
  const days = TOTAL_DAYS + 7 // hasta 7 extra para llenar la última columna
  const buckets: DayBucket[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    buckets.push({
      date: d,
      total: 0,
      entities: 0,
      quotes: 0,
      relationships: 0,
    })
  }
  const startMs = start.getTime()
  function bump(iso: string, key: 'entities' | 'quotes' | 'relationships') {
    const t = new Date(iso).getTime()
    const offset = Math.floor((t - startMs) / MS_PER_DAY)
    if (offset >= 0 && offset < buckets.length) {
      buckets[offset].total += 1
      buckets[offset][key] += 1
    }
  }
  for (const e of entities) bump(e.createdAt, 'entities')
  for (const q of quotes) bump(q.createdAt, 'quotes')
  for (const r of relationships) bump(r.createdAt, 'relationships')
  return buckets
}

function dominantColor(b: DayBucket): string {
  if (b.total === 0) return 'rgb(var(--ink-100))'
  const top = Math.max(b.entities, b.quotes, b.relationships)
  if (top === b.entities) return 'var(--type-persona)'
  if (top === b.quotes) return 'var(--accent-gold)'
  return 'var(--accent-sage)'
}

const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DAY_LETTER = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export function CalendarHeatmap({
  entities,
  quotes,
  relationships,
}: {
  entities: Entity[]
  quotes: Quote[]
  relationships: Relationship[]
}) {
  const { weeks, maxDaily, totalCount } = useMemo(() => {
    const buckets = buildBuckets(entities, quotes, relationships)
    // Partir en columnas de 7 (semanas lun→dom). Truncamos al número
    // necesario para que el hoy entre.
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayMs = today.getTime()
    const cols: DayBucket[][] = []
    for (let c = 0; c < Math.ceil(buckets.length / 7); c++) {
      const week = buckets.slice(c * 7, c * 7 + 7)
      cols.push(week)
      // si esta semana incluye hoy o lo pasa, paramos
      const lastDay = week[week.length - 1]
      if (lastDay && lastDay.date.getTime() >= todayMs) break
    }
    // Mantener exactamente WEEKS columnas (truncar al final si hay sobra)
    const trimmedCols = cols.slice(-WEEKS)
    const max = trimmedCols.reduce(
      (m, w) => w.reduce((mw, d) => Math.max(mw, d.total), m),
      0,
    )
    const total = trimmedCols.reduce(
      (sum, w) => sum + w.reduce((ws, d) => ws + d.total, 0),
      0,
    )
    return { weeks: trimmedCols, maxDaily: max, totalCount: total }
  }, [entities, quotes, relationships])

  if (totalCount === 0) return null

  // Etiquetas de mes encima de las columnas. Solo mostramos cuando una
  // columna abre un mes nuevo respecto a la anterior.
  const monthLabels = weeks.map((week, i) => {
    const firstDay = week[0]
    if (!firstDay) return ''
    if (i === 0) return MONTH_SHORT[firstDay.date.getMonth()]
    const prev = weeks[i - 1][0]
    if (!prev) return ''
    return firstDay.date.getMonth() !== prev.date.getMonth()
      ? MONTH_SHORT[firstDay.date.getMonth()]
      : ''
  })

  return (
    <section
      className="card-paper-elevated px-5 py-4 animate-fade-up"
      aria-label={`Heatmap de actividad — últimas ${WEEKS} semanas`}
    >
      <header className="mb-3 flex items-baseline justify-between gap-3 flex-wrap">
        <p className="section-eyebrow">últimos {Math.round(WEEKS / 4)} meses</p>
        <p className="text-caption text-ink-400 tabular-nums">
          {totalCount} {totalCount === 1 ? 'entrada' : 'entradas'}
        </p>
      </header>

      <div className="flex gap-3">
        {/* Columna de etiquetas de día — solo cada otro para ahorrar espacio */}
        <div className="flex flex-col gap-[3px] pt-[18px] shrink-0">
          {DAY_LETTER.map((letter, i) => (
            <span
              key={i}
              className="text-[9px] font-mono text-ink-300 leading-[11px] h-[11px] flex items-center"
            >
              {i % 2 === 1 ? letter : ''}
            </span>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-x-auto">
          <div className="inline-flex flex-col gap-1">
            {/* Labels de mes */}
            <div className="flex gap-[3px] h-[15px]">
              {monthLabels.map((label, i) => (
                <span
                  key={i}
                  className="text-[9px] font-mono text-ink-300 w-[11px] flex-shrink-0 leading-none"
                >
                  {label}
                </span>
              ))}
            </div>
            {/* Columnas de semanas */}
            <div className="flex gap-[3px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((day, di) => {
                    const isToday = isSameDay(day.date, new Date())
                    const isFuture = day.date.getTime() > Date.now()
                    if (isFuture) {
                      // Reservar espacio sin renderizar celda (días después de hoy
                      // dentro de la semana actual).
                      return (
                        <div
                          key={di}
                          className="w-[11px] h-[11px]"
                          aria-hidden="true"
                        />
                      )
                    }
                    const intensity =
                      day.total > 0 && maxDaily > 0
                        ? 0.3 + 0.7 * (day.total / maxDaily)
                        : 1
                    return (
                      <div
                        key={di}
                        className={`w-[11px] h-[11px] rounded-[2px] transition-opacity ${
                          isToday ? 'ring-1 ring-ink-700/40 ring-offset-1 ring-offset-paper-50' : ''
                        }`}
                        style={{
                          backgroundColor: dominantColor(day),
                          opacity: day.total > 0 ? intensity : 0.4,
                        }}
                        title={`${formatDate(day.date)}: ${tooltipFor(day)}`}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <footer className="mt-3 pt-3 border-t border-ink-100/50 flex items-baseline gap-4 flex-wrap text-caption">
        <Legend color="var(--type-persona)" label="entidades" />
        <Legend color="var(--accent-gold)" label="citas" />
        <Legend color="var(--accent-sage)" label="relaciones" />
        <span className="ml-auto text-ink-300 italic">
          el color es la métrica dominante del día
        </span>
      </footer>
    </section>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-ink-400">
      <span
        className="w-2 h-2 rounded-[1px] inline-block"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('es', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function tooltipFor(d: DayBucket): string {
  if (d.total === 0) return 'sin actividad'
  const parts: string[] = []
  if (d.entities > 0) parts.push(`${d.entities} entidades`)
  if (d.quotes > 0) parts.push(`${d.quotes} citas`)
  if (d.relationships > 0) parts.push(`${d.relationships} relaciones`)
  return parts.join(' · ')
}
