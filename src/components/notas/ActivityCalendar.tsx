import { useMemo, useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '../Icons'
import { CountBadge } from '../CountBadge'

const ACCENT = 'var(--accent-sage)'
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MONTHS = [
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

/** ISO → 'YYYY-MM-DD' en hora LOCAL (sin desfase de zona). Exportado para que
 *  las vistas filtren con el mismo criterio de "día" que usa el calendario. */
export function localDayKey(iso: string): string {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function dayKey(y: number, m0: number, day: number): string {
  return `${y}-${String(m0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Nivel de intensidad 0–4 según cuántos ítems tiene el día. */
function levelFor(count: number): number {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count <= 3) return 2
  if (count <= 6) return 3
  return 4
}
// % de mezcla del sage para cada nivel (idx 0 = sin actividad).
const FILL = [0, 16, 34, 58, 82]

/** 'YYYY-MM-DD' → "12 de mayo". */
function formatDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  if (!y || !m || !d) return key
  return `${d} de ${MONTHS[m - 1]}`
}

export type CalendarStat = { n: number; label: string }

/**
 * Calendario de actividad reutilizable — un heatmap mensual al estilo de los
 * "contribution graphs": cada día se tiñe (sage) según cuántos ítems tiene.
 * Clic en un día con actividad lo selecciona (filtro); volver a hacer clic lo
 * deselecciona.
 *
 * Es agnóstico al dominio: el caller le pasa `dayKeys` (un 'YYYY-MM-DD' por
 * ítem fechado — notas por creación, tareas por vencimiento, etc.), la `unit`
 * para los textos y las `stats` a mostrar al costado.
 */
export function ActivityCalendar({
  dayKeys,
  selectedDay,
  onSelectDay,
  unit = { one: 'nota', many: 'notas' },
  stats,
}: {
  dayKeys: string[]
  selectedDay: string | null
  onSelectDay: (day: string | null) => void
  unit?: { one: string; many: string }
  stats: CalendarStat[]
}) {
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const k of dayKeys) m.set(k, (m.get(k) ?? 0) + 1)
    return m
  }, [dayKeys])

  const now = new Date()
  const [view, setView] = useState<{ y: number; m: number }>({
    y: now.getFullYear(),
    m: now.getMonth(),
  })

  const todayKey = dayKey(now.getFullYear(), now.getMonth(), now.getDate())

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1)
    const startOffset = (first.getDay() + 6) % 7 // lunes primero
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
    const arr: Array<{ day: number; key: string; count: number } | null> = []
    for (let i = 0; i < startOffset; i++) arr.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      const key = dayKey(view.y, view.m, d)
      arr.push({ day: d, key, count: counts.get(key) ?? 0 })
    }
    while (arr.length % 7 !== 0) arr.push(null)
    return arr
  }, [view, counts])

  const canNext =
    view.y < now.getFullYear() ||
    (view.y === now.getFullYear() && view.m < now.getMonth())

  function prev() {
    setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))
  }
  function next() {
    if (!canNext) return
    setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))
  }

  return (
    <div className="card-paper-soft rounded-xl border border-ink-100/70 p-4 mb-5 flex flex-col sm:flex-row gap-5">
      {/* Calendario */}
      <div className="sm:w-[19rem] shrink-0">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={prev}
            aria-label="Mes anterior"
            className="p-1 rounded text-ink-300 hover:text-ink-700 hover:bg-ink-100 transition-colors"
          >
            <ChevronLeftIcon size={14} />
          </button>
          <span className="text-caption text-ink-600 tabular-nums">
            {MONTHS[view.m]} {view.y}
          </span>
          <button
            onClick={next}
            disabled={!canNext}
            aria-label="Mes siguiente"
            className="p-1 rounded text-ink-300 hover:text-ink-700 hover:bg-ink-100 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRightIcon size={14} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((w, i) => (
            <span key={i} className="text-center text-micro text-ink-300">
              {w}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c, i) => {
            if (!c) return <span key={i} aria-hidden />
            const level = levelFor(c.count)
            const isToday = c.key === todayKey
            const isSelected = c.key === selectedDay
            const clickable = c.count > 0
            const boxShadow = isSelected
              ? `0 0 0 2px ${ACCENT}`
              : isToday
                ? '0 0 0 1px rgb(var(--ink-300) / 0.7)'
                : undefined
            const word = c.count === 1 ? unit.one : unit.many
            return (
              <button
                key={i}
                disabled={!clickable}
                onClick={() => onSelectDay(isSelected ? null : c.key)}
                title={`${c.count} ${word} · ${c.day} ${MONTHS[view.m]}`}
                aria-label={`${c.day} de ${MONTHS[view.m]}: ${c.count} ${word}`}
                className={`relative aspect-square rounded-md text-micro tabular-nums flex items-center justify-center transition-opacity ${
                  clickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                } ${level === 0 ? 'text-ink-300' : 'text-ink-800'}`}
                style={{
                  backgroundColor:
                    level === 0
                      ? 'transparent'
                      : `color-mix(in srgb, ${ACCENT} ${FILL[level]}%, transparent)`,
                  boxShadow,
                }}
              >
                {c.day}
                {/* Contador en la esquina: cuántas notas/tareas hay ese día. */}
                <CountBadge
                  count={c.count}
                  className="absolute -top-0.5 -right-0.5 min-w-[13px] h-[13px] px-0.5 inline-flex items-center justify-center rounded-full text-[8px] font-semibold leading-none text-paper-50"
                  style={{ backgroundColor: ACCENT }}
                />
              </button>
            )
          })}
        </div>
      </div>

      {/* Estadísticas + estado del filtro por día */}
      <div className="flex-1 flex flex-row sm:flex-col flex-wrap gap-x-6 gap-y-3 sm:gap-y-4 sm:border-l sm:border-ink-100/70 sm:pl-5">
        {stats.map((s) => (
          <Stat key={s.label} n={s.n} label={s.label} />
        ))}
        {selectedDay && (
          <div className="basis-full sm:mt-auto">
            <p className="text-micro text-ink-400 leading-snug">
              Mostrando el {formatDayLabel(selectedDay)}
            </p>
            <button
              onClick={() => onSelectDay(null)}
              className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
            >
              ver todas
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="leading-none">
      <div className="font-serif text-2xl text-ink-700 tabular-nums">{n}</div>
      <div className="text-micro uppercase tracking-eyebrow text-ink-300 mt-1">
        {label}
      </div>
    </div>
  )
}
