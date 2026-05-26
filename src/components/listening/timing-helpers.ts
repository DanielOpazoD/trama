/**
 * π4: helpers puros para agregar timestamps de Spotify plays en buckets
 * temporales LOCALES (heatmap día×hora + trend diario).
 *
 * Vive separado de PlaysTiming.tsx para que sea testeable sin DOM. La
 * agregación es no-trivial (TZ local, lunes-based day-of-week, ventanas
 * de 30 días con relleno de ceros) — el test fija un "ahora" y verifica
 * los buckets resultantes.
 *
 * Notas:
 * - El bucketing usa el TZ del entorno donde corre (Date.getHours()
 *   y Date.getDay() son TZ-local). Esto es deliberado: "escucho a las
 *   11pm" solo tiene sentido en hora local del usuario.
 * - DOW va lunes=0 a domingo=6 (no el default de JS que es domingo=0).
 *   Más natural para mostrar en grilla calendario.
 */

const MS_PER_DAY = 86_400_000
const TREND_DAYS = 30

/** Convierte Date.getDay() (0=dom..6=sáb) a 0=lun..6=dom. */
export function dayOfWeekMondayBased(d: Date): number {
  const dow = d.getDay()
  return dow === 0 ? 6 : dow - 1
}

/** Timestamp en ms del inicio del día calendario LOCAL de `d`. */
export function startOfLocalDay(d: Date): number {
  const t = new Date(d)
  t.setHours(0, 0, 0, 0)
  return t.getTime()
}

export type TimingBuckets = {
  /** Matriz 7×24: heatmap[dow][hour] = plays. dow: 0=lun..6=dom. */
  heatmap: number[][]
  /** Array de 30: trend[i] = plays del día (i días atrás desde hoy).
   *  trend[0] = hace 29 días, trend[29] = hoy. */
  trend: number[]
  maxHeatmap: number
  maxTrend: number
  /** Cantidad total de timestamps procesados (incluye los que cayeron
   *  fuera de la ventana del trend pero sí entraron al heatmap). */
  total: number
}

/**
 * Construye el heatmap 7×24 y el trend de 30 días a partir de un array
 * de timestamps ISO. `now` es opcional — útil para tests.
 *
 * - Timestamps inválidos se descartan silenciosamente.
 * - Trend solo cuenta los últimos 30 días (inclusive de hoy). Los más
 *   viejos cuentan al heatmap pero no al trend.
 * - El heatmap procesa TODAS las timestamps del input.
 */
export function buildTimingBuckets(
  playedAts: string[],
  now: Date = new Date(),
): TimingBuckets {
  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  const trend: number[] = Array(TREND_DAYS).fill(0)
  const todayMs = startOfLocalDay(now)
  const trendStart = todayMs - (TREND_DAYS - 1) * MS_PER_DAY

  let maxHeatmap = 0
  let maxTrend = 0
  let total = 0

  for (const iso of playedAts) {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) continue

    total += 1

    // Heatmap (todo timestamp válido entra)
    const dow = dayOfWeekMondayBased(d)
    const hour = d.getHours()
    const row = heatmap[dow]!
    row[hour] = (row[hour] ?? 0) + 1
    if (row[hour]! > maxHeatmap) maxHeatmap = row[hour]!

    // Trend (solo últimos 30 días)
    const dayMs = startOfLocalDay(d)
    const offset = Math.floor((dayMs - trendStart) / MS_PER_DAY)
    if (offset >= 0 && offset < TREND_DAYS) {
      trend[offset] = (trend[offset] ?? 0) + 1
      if (trend[offset]! > maxTrend) maxTrend = trend[offset]!
    }
  }

  return { heatmap, trend, maxHeatmap, maxTrend, total }
}
