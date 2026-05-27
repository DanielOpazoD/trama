import { useMemo } from 'react'

/**
 * Hero numérico del header de Escuchas. Cuatro stats grandes en grid
 * (reproducciones · canciones · artistas · álbumes) + un total en
 * horas como contexto. No es un dashboard de KPIs frío sino una
 * "página de inicio" para tu música — los números viven en serif.
 */
export function PlaysSummary({
  summary,
  periodDays,
  loading,
}: {
  summary?: {
    totalPlays: number
    uniqueTracks: number
    uniqueArtists: number
    uniqueAlbums: number
    totalMinutes: number
  }
  periodDays: number
  loading: boolean
}) {
  const formatNum = (n: number | undefined) => {
    if (loading || n == null) return '—'
    return n.toLocaleString('es')
  }
  const hours = useMemo(() => {
    if (loading || !summary) return null
    return Math.round(summary.totalMinutes / 60)
  }, [summary, loading])

  const periodLabel =
    periodDays === 7 ? 'última semana'
    : periodDays === 30 ? 'último mes'
    : periodDays === 90 ? 'últimos 90 días'
    : 'último año'

  return (
    <section
      className="card-paper-elevated px-5 py-4 mb-6 animate-fade-up"
      aria-label={`Resumen de escuchas — ${periodLabel}`}
    >
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <p className="section-eyebrow">{periodLabel}</p>
        {hours !== null && hours > 0 && (
          <p className="text-caption text-ink-400 tabular-nums">
            {hours} {hours === 1 ? 'hora' : 'horas'} de música
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryStat
          label="reproducciones"
          value={formatNum(summary?.totalPlays)}
          color="var(--type-musico)"
        />
        <SummaryStat
          label="canciones"
          value={formatNum(summary?.uniqueTracks)}
          color="var(--accent-gold)"
        />
        <SummaryStat
          label="artistas"
          value={formatNum(summary?.uniqueArtists)}
          color="var(--type-persona)"
        />
        <SummaryStat
          label="álbumes"
          value={formatNum(summary?.uniqueAlbums)}
          color="var(--accent-sage)"
        />
      </div>
    </section>
  )
}

function SummaryStat({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: string
}) {
  return (
    <div>
      <p
        className="font-serif text-2xl leading-none tabular-nums"
        style={{ color }}
      >
        {value}
      </p>
      <p className="text-caption text-ink-400 mt-1">{label}</p>
    </div>
  )
}
