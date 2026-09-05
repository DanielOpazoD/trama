/**
 * Resumen de Core Web Vitals para el panel de salud — lógica PURA.
 *
 * `web-vitals.mts` lleva meses guardando LCP, INP y CLS en
 * `web_vitals_samples`, y hasta ahora ninguna pantalla los leía: un sensor
 * instalado sin aguja. Este módulo convierte los percentiles que calcula
 * Postgres en tres cifras con su semáforo, siguiendo los umbrales que
 * `docs/observability.md` ya declaraba como SLO informal.
 */

export type WebVitalName = 'LCP' | 'INP' | 'CLS'
export type WebVitalRating = 'good' | 'needs-improvement' | 'poor' | 'no-data'

export type WebVitalSummary = {
  metric: WebVitalName
  unit: 'ms' | 'score'
  /** p75 de la ventana; null cuando no hubo muestras. */
  p75: { d7: number | null; d28: number | null }
  samples: { d7: number; d28: number }
  /** Semáforo sobre el p75 de 7 días; si esa semana no tiene muestras, sobre 28. */
  rating: WebVitalRating
}

/** Fila tal como la devuelve la query de `health.mts` (una por métrica). */
export type WebVitalRow = {
  metric: string
  p75_7d: number | string | null
  samples_7d: string
  p75_28d: number | string | null
  samples_28d: string
}

// Umbrales de Google (https://web.dev/articles/vitals): "good" hasta el
// primero inclusive, "poor" por encima del segundo.
export const WEB_VITAL_THRESHOLDS: Record<
  WebVitalName,
  { good: number; poor: number; unit: WebVitalSummary['unit'] }
> = {
  LCP: { good: 2500, poor: 4000, unit: 'ms' },
  INP: { good: 200, poor: 500, unit: 'ms' },
  CLS: { good: 0.1, poor: 0.25, unit: 'score' },
}

export const WEB_VITAL_ORDER: WebVitalName[] = ['LCP', 'INP', 'CLS']

export function rateWebVital(metric: WebVitalName, p75: number | null): WebVitalRating {
  if (p75 === null) return 'no-data'
  const { good, poor } = WEB_VITAL_THRESHOLDS[metric]
  if (p75 <= good) return 'good'
  if (p75 > poor) return 'poor'
  return 'needs-improvement'
}

function asNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Siempre devuelve las tres métricas en el mismo orden, con `no-data` donde
 * no hubo muestras: el panel pinta tres casillas fijas, no una lista que
 * cambia de forma según qué llegó.
 */
export function summarizeWebVitals(rows: WebVitalRow[]): WebVitalSummary[] {
  const byMetric = new Map(rows.map((row) => [row.metric, row]))
  return WEB_VITAL_ORDER.map((metric) => {
    const row = byMetric.get(metric)
    const d7 = asNumberOrNull(row?.p75_7d)
    const d28 = asNumberOrNull(row?.p75_28d)
    return {
      metric,
      unit: WEB_VITAL_THRESHOLDS[metric].unit,
      p75: { d7, d28 },
      samples: { d7: Number(row?.samples_7d ?? 0), d28: Number(row?.samples_28d ?? 0) },
      rating: rateWebVital(metric, d7 ?? d28),
    }
  })
}
