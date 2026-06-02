import { ChevronLeftIcon, ChevronRightIcon } from '../Icons'

const MONTHS_ABBR = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]

/**
 * Navegador temporal de Tareas: elige año (‹ › ) y mes. El mes seleccionado
 * decide qué semanas se muestran. Los meses con pendientes llevan un punto, y
 * el mes/año actual real va marcado para no perder el "hoy".
 */
export function MonthNavigator({
  year,
  month0,
  currentYear,
  currentMonth0,
  pendingMonths,
  onChange,
}: {
  year: number
  month0: number
  currentYear: number
  currentMonth0: number
  pendingMonths: Set<number>
  onChange: (year: number, month0: number) => void
}) {
  return (
    <div className="card-paper-soft rounded-xl border border-ink-100/70 p-3 mb-4">
      <div className="flex items-center justify-between mb-2.5">
        <button
          onClick={() => onChange(year - 1, month0)}
          aria-label="Año anterior"
          className="p-1 rounded text-ink-300 hover:text-ink-700 hover:bg-ink-100 transition-colors"
        >
          <ChevronLeftIcon size={15} />
        </button>
        <span className="font-serif text-lg text-ink-700 tabular-nums tracking-tight">
          {year}
        </span>
        <button
          onClick={() => onChange(year + 1, month0)}
          aria-label="Año siguiente"
          className="p-1 rounded text-ink-300 hover:text-ink-700 hover:bg-ink-100 transition-colors"
        >
          <ChevronRightIcon size={15} />
        </button>
      </div>
      <div className="grid grid-cols-6 gap-1">
        {MONTHS_ABBR.map((label, m) => {
          const selected = m === month0
          const isCurrent = year === currentYear && m === currentMonth0
          const hasPending = pendingMonths.has(m)
          return (
            <button
              key={m}
              onClick={() => onChange(year, m)}
              aria-current={selected ? 'true' : undefined}
              aria-label={`Mes ${label}${hasPending ? ', con pendientes' : ''}`}
              className={`relative py-1.5 rounded-md text-caption capitalize transition-colors ${
                selected
                  ? 'bg-ink-100/70 text-ink-700 font-medium'
                  : 'text-ink-400 hover:text-ink-700 hover:bg-ink-100/40'
              }`}
            >
              {label}
              {isCurrent && !selected && (
                <span
                  aria-hidden
                  className="absolute inset-x-3 bottom-1 h-px"
                  style={{ backgroundColor: 'var(--accent-sage)' }}
                />
              )}
              {hasPending && (
                <span
                  aria-hidden
                  className="absolute top-1 right-1.5 size-1.5 rounded-full"
                  style={{ backgroundColor: 'var(--priority-alta)' }}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
