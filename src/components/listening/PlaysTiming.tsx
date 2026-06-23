import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api'
import { LoadingHint } from '../LoadingHint'
import { ErrorState } from '../ErrorState'
import { buildTimingBuckets } from './timing-helpers'

/**
 * π4: visualizaciones temporales de Spotify plays.
 *
 *   - Heatmap 7×24: día de la semana × hora del día. Cada celda es el
 *     conteo de reproducciones en ese slot. Intensidad por opacity
 *     relativo al máximo. Muestra el patrón "cuándo escucho".
 *
 *   - Sparkline daily trend: 30 días hacia atrás. Cada barra es plays
 *     de ese día.
 *
 * Las dos vistas se agregan client-side en TZ local porque "escucho a
 * las 11pm" es una afirmación que solo tiene sentido en hora local.
 *
 * Toda la lógica de bucketing vive en `timing-helpers.ts` (puro, testeable
 * sin DOM). Este archivo solo orquesta query + render.
 *
 * Si no hay datos en el período el componente devuelve null — la vista
 * padre decide qué mostrar.
 */

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] // lun..dom
const HOUR_TICKS = [0, 6, 12, 18] // labels en el eje horizontal

export function PlaysTiming({ since, enabled }: { since: string; enabled: boolean }) {
  const timingQuery = useQuery({
    queryKey: ['spotify', 'timing', since],
    queryFn: () => api.spotifyTiming(since),
    retry: false,
    enabled,
  })

  const data = useMemo(() => {
    if (!timingQuery.data) return null
    const playedAts = timingQuery.data.playedAts
    if (playedAts.length === 0) return null
    return buildTimingBuckets(playedAts)
  }, [timingQuery.data])

  if (timingQuery.isLoading) {
    return <LoadingHint text="cargando patrón temporal" />
  }
  // Un fetch fallido NO es "no escuchaste nada": sin esta rama el componente
  // caía a `return null` y se confundía con el vacío real, ocultando el fallo.
  if (timingQuery.isError) {
    return (
      <ErrorState
        title="No se pudo cargar el patrón temporal"
        onRetry={() => timingQuery.refetch()}
        retrying={timingQuery.isFetching}
      />
    )
  }
  if (!data) return null

  return (
    <section
      className="card-paper-elevated px-5 py-4 mb-6 animate-fade-up"
      aria-label="Patrón temporal de escuchas"
    >
      <header className="mb-3 flex items-baseline justify-between gap-3 flex-wrap">
        <p className="section-eyebrow">cuándo escuchas</p>
        <p className="text-caption text-ink-300 italic">
          hora local · {data.total.toLocaleString('es')} plays
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        <Heatmap heatmap={data.heatmap} max={data.maxHeatmap} />
        <Trend trend={data.trend} max={data.maxTrend} />
      </div>
    </section>
  )
}

function Heatmap({ heatmap, max }: { heatmap: number[][]; max: number }) {
  return (
    <div>
      <h4 className="section-eyebrow mb-2">semana × hora</h4>
      {/* Excepción documentada al sistema de type scale (filosofía §4.1):
          los ticks del heatmap usan text-[9px] mono — el `text-micro` (10px)
          rompe la altura de cada celda (10px) y desalinea labels con grid.
          Es metadata técnica densa, no UI textual. Acotado a PlaysTiming +
          CalendarHeatmap. NO replicar este patrón en cards o forms. */}
      <div className="flex gap-1.5">
        {/* Etiquetas de día */}
        <div className="flex flex-col gap-[2px] pt-[14px] shrink-0">
          {DAY_LABELS.map((label, i) => (
            <span
              key={i}
              className="text-[9px] font-mono text-ink-300 leading-[10px] h-[10px] flex items-center"
            >
              {label}
            </span>
          ))}
        </div>
        <div className="flex-1 min-w-0">
          {/* Eje x — labels de hora en 4 ticks (0, 6, 12, 18) */}
          <div className="flex justify-between mb-1 px-[1px]">
            {HOUR_TICKS.map((h) => (
              <span key={h} className="text-[9px] font-mono text-ink-300">
                {h.toString().padStart(2, '0')}
              </span>
            ))}
          </div>
          {/* Grid 7×24 */}
          <div className="flex flex-col gap-[2px]">
            {heatmap.map((row, dow) => (
              <div key={dow} className="flex gap-[2px]">
                {row.map((count, hour) => {
                  const intensity = max > 0 ? count / max : 0
                  return (
                    <div
                      key={hour}
                      className="flex-1 h-[10px] rounded-[1px]"
                      style={{
                        backgroundColor:
                          count > 0 ? 'var(--type-musico)' : 'rgb(var(--ink-100))',
                        opacity: count > 0 ? 0.25 + 0.75 * intensity : 0.35,
                      }}
                      title={
                        count > 0
                          ? `${DAY_LABELS[dow]} ${hour.toString().padStart(2, '0')}h — ${count} ${count === 1 ? 'play' : 'plays'}`
                          : ''
                      }
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Trend({ trend, max }: { trend: number[]; max: number }) {
  // Etiquetas: cada 5 días desde -30 hasta hoy.
  return (
    <div>
      <h4 className="section-eyebrow mb-2">últimos 30 días</h4>
      <div
        className="flex items-end gap-[3px] h-[60px]"
        role="img"
        aria-label="Trend diario de plays — últimos 30 días"
      >
        {trend.map((count, i) => {
          const pct = max > 0 ? (count / max) * 100 : 0
          const isToday = i === trend.length - 1
          return (
            <div
              key={i}
              className="flex-1 rounded-sm transition-all duration-300"
              style={{
                height: count > 0 ? `${Math.max(8, pct)}%` : '4px',
                backgroundColor: count > 0 ? 'var(--type-musico)' : 'rgb(var(--ink-100))',
                opacity: isToday ? 1 : count > 0 ? 0.7 : 0.4,
              }}
              title={`hace ${trend.length - 1 - i} días: ${count} ${count === 1 ? 'play' : 'plays'}`}
            />
          )
        })}
      </div>
      <div className="flex justify-between mt-1 px-[1px] text-[9px] font-mono text-ink-300">
        <span>hace 30d</span>
        <span>hoy</span>
      </div>
    </div>
  )
}
