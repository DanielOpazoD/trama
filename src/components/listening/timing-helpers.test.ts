import { describe, it, expect } from 'vitest'
import {
  buildTimingBuckets,
  dayOfWeekMondayBased,
  startOfLocalDay,
} from './timing-helpers'

/**
 * Tests puros para los helpers de PlaysTiming. Todos los timestamps se
 * construyen con `new Date(year, monthIdx, day, hour, ...)` que es
 * inherentemente LOCAL — así el test no depende del TZ del entorno.
 */

function localTime(y: number, m: number, d: number, h: number, min = 0): string {
  return new Date(y, m, d, h, min, 0).toISOString()
}

describe('dayOfWeekMondayBased', () => {
  // Tomamos como referencia el lunes 4 de mayo 2026 (lun).
  it.each([
    [new Date(2026, 4, 4), 0, 'lunes'],
    [new Date(2026, 4, 5), 1, 'martes'],
    [new Date(2026, 4, 6), 2, 'miércoles'],
    [new Date(2026, 4, 7), 3, 'jueves'],
    [new Date(2026, 4, 8), 4, 'viernes'],
    [new Date(2026, 4, 9), 5, 'sábado'],
    [new Date(2026, 4, 10), 6, 'domingo'],
  ])('%s → %i (%s)', (date, expected) => {
    expect(dayOfWeekMondayBased(date)).toBe(expected)
  })
})

describe('startOfLocalDay', () => {
  it('normaliza al inicio del día (00:00:00.000 local)', () => {
    const d = new Date(2026, 4, 24, 15, 30, 45, 123)
    const start = startOfLocalDay(d)
    const startDate = new Date(start)
    expect(startDate.getFullYear()).toBe(2026)
    expect(startDate.getMonth()).toBe(4)
    expect(startDate.getDate()).toBe(24)
    expect(startDate.getHours()).toBe(0)
    expect(startDate.getMinutes()).toBe(0)
    expect(startDate.getMilliseconds()).toBe(0)
  })

  it('input no se muta (cría una copia)', () => {
    const original = new Date(2026, 4, 24, 15, 30)
    const snapshot = original.getTime()
    startOfLocalDay(original)
    expect(original.getTime()).toBe(snapshot)
  })
})

describe('buildTimingBuckets', () => {
  // Fijamos "ahora" al sábado 23 de mayo 2026 12:00 local.
  const NOW = new Date(2026, 4, 23, 12, 0, 0)

  it('lista vacía → heatmap todo 0, trend todo 0', () => {
    const r = buildTimingBuckets([], NOW)
    expect(r.total).toBe(0)
    expect(r.maxHeatmap).toBe(0)
    expect(r.maxTrend).toBe(0)
    expect(r.heatmap).toHaveLength(7)
    expect(r.heatmap.every((row) => row.length === 24)).toBe(true)
    expect(r.heatmap.every((row) => row.every((c) => c === 0))).toBe(true)
    expect(r.trend).toHaveLength(30)
    expect(r.trend.every((c) => c === 0)).toBe(true)
  })

  it('heatmap mapea hora y día correctamente (lunes 22h)', () => {
    // 4 de mayo 2026 es lunes. Tres plays a las 22h.
    const playedAts = [
      localTime(2026, 4, 4, 22, 0),
      localTime(2026, 4, 4, 22, 15),
      localTime(2026, 4, 4, 22, 45),
    ]
    const r = buildTimingBuckets(playedAts, NOW)
    expect(r.heatmap[0]![22]).toBe(3) // lunes (dow=0) × 22h
    expect(r.maxHeatmap).toBe(3)
    expect(r.total).toBe(3)
  })

  it('heatmap distingue domingo (dow=6) de lunes (dow=0)', () => {
    // 3 de mayo 2026 es domingo, 4 es lunes.
    const playedAts = [
      localTime(2026, 4, 3, 14, 0), // domingo
      localTime(2026, 4, 4, 14, 0), // lunes
    ]
    const r = buildTimingBuckets(playedAts, NOW)
    expect(r.heatmap[0]![14]).toBe(1) // lunes
    expect(r.heatmap[6]![14]).toBe(1) // domingo
  })

  it('trend cuenta los últimos 30 días con hoy en el último slot', () => {
    // NOW = 23 mayo 2026. Trend window: 24 abril..23 mayo.
    const playedAts = [
      localTime(2026, 4, 23, 10, 0), // hoy
      localTime(2026, 4, 23, 11, 0), // hoy (mismo día)
      localTime(2026, 4, 22, 10, 0), // ayer
      localTime(2026, 3, 24, 10, 0), // hace 29 días (offset 0)
      localTime(2026, 3, 23, 10, 0), // hace 30 días — FUERA del trend
    ]
    const r = buildTimingBuckets(playedAts, NOW)
    expect(r.trend[29]).toBe(2) // hoy
    expect(r.trend[28]).toBe(1) // ayer
    expect(r.trend[0]).toBe(1) // hace 29 días
    // El play de hace 30 días NO aparece en trend, pero sí en heatmap
    expect(r.total).toBe(5)
    expect(r.maxTrend).toBe(2) // dos plays hoy
  })

  it('timestamps inválidos se descartan silenciosamente', () => {
    const playedAts = [
      localTime(2026, 4, 23, 10, 0),
      'not-a-date',
      '',
      localTime(2026, 4, 23, 11, 0),
    ]
    const r = buildTimingBuckets(playedAts, NOW)
    expect(r.total).toBe(2) // solo los dos válidos
  })

  it('maxHeatmap refleja la celda más densa', () => {
    const playedAts = [
      // 5 plays el lunes 4 mayo 22h
      ...Array(5).fill(null).map(() => localTime(2026, 4, 4, 22, 0)),
      // 2 plays el martes 5 mayo 22h
      ...Array(2).fill(null).map(() => localTime(2026, 4, 5, 22, 0)),
    ]
    const r = buildTimingBuckets(playedAts, NOW)
    expect(r.maxHeatmap).toBe(5)
  })

  it('plays muy viejos (>30 días) cuentan al heatmap pero no al trend', () => {
    const playedAts = [
      // Play de hace 60 días → fuera del trend, sí entra al heatmap.
      localTime(2026, 2, 24, 22, 0),
    ]
    const r = buildTimingBuckets(playedAts, NOW)
    expect(r.total).toBe(1)
    expect(r.maxTrend).toBe(0)
    expect(r.maxHeatmap).toBe(1)
    expect(r.trend.every((c) => c === 0)).toBe(true)
  })

  it('hora 0 (medianoche) y hora 23 (11pm) caen en buckets correctos', () => {
    const playedAts = [
      localTime(2026, 4, 4, 0, 0), // lunes 00h
      localTime(2026, 4, 4, 23, 0), // lunes 23h
    ]
    const r = buildTimingBuckets(playedAts, NOW)
    expect(r.heatmap[0]![0]).toBe(1)
    expect(r.heatmap[0]![23]).toBe(1)
  })
})
