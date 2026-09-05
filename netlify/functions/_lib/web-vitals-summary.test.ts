import { describe, expect, it } from 'vitest'
import {
  rateWebVital,
  summarizeWebVitals,
  WEB_VITAL_THRESHOLDS,
} from './web-vitals-summary'

describe('rateWebVital', () => {
  it('aplica los umbrales de Google: bueno hasta el límite inclusive, pobre por encima del segundo', () => {
    expect(rateWebVital('LCP', 2500)).toBe('good')
    expect(rateWebVital('LCP', 2501)).toBe('needs-improvement')
    expect(rateWebVital('LCP', 4000)).toBe('needs-improvement')
    expect(rateWebVital('LCP', 4001)).toBe('poor')
    expect(rateWebVital('INP', 199)).toBe('good')
    expect(rateWebVital('INP', 501)).toBe('poor')
    expect(rateWebVital('CLS', 0.1)).toBe('good')
    expect(rateWebVital('CLS', 0.26)).toBe('poor')
    expect(rateWebVital('CLS', null)).toBe('no-data')
  })

  it('los umbrales son los que documenta docs/observability.md', () => {
    expect(WEB_VITAL_THRESHOLDS.LCP).toMatchObject({ good: 2500, poor: 4000 })
    expect(WEB_VITAL_THRESHOLDS.INP).toMatchObject({ good: 200, poor: 500 })
    expect(WEB_VITAL_THRESHOLDS.CLS).toMatchObject({ good: 0.1, poor: 0.25 })
  })
})

describe('summarizeWebVitals', () => {
  it('devuelve siempre LCP, INP y CLS en ese orden, aunque falten filas', () => {
    expect(summarizeWebVitals([]).map((v) => [v.metric, v.rating])).toEqual([
      ['LCP', 'no-data'],
      ['INP', 'no-data'],
      ['CLS', 'no-data'],
    ])
  })

  it('convierte lo que Postgres devuelve como texto y semaforiza sobre 7 días', () => {
    const [lcp] = summarizeWebVitals([
      {
        metric: 'LCP',
        p75_7d: '2612.4',
        samples_7d: '14',
        p75_28d: '4400',
        samples_28d: '60',
      },
    ])
    expect(lcp).toEqual({
      metric: 'LCP',
      unit: 'ms',
      p75: { d7: 2612.4, d28: 4400 },
      samples: { d7: 14, d28: 60 },
      rating: 'needs-improvement',
    })
  })

  it('si la semana no tiene muestras, el semáforo usa los 28 días', () => {
    const [, inp] = summarizeWebVitals([
      { metric: 'INP', p75_7d: null, samples_7d: '0', p75_28d: 620, samples_28d: '5' },
    ])
    expect(inp?.rating).toBe('poor')
    expect(inp?.p75.d7).toBeNull()
  })

  it('ignora métricas que no son core (FCP, TTFB) sin romper', () => {
    const out = summarizeWebVitals([
      { metric: 'TTFB', p75_7d: 80, samples_7d: '3', p75_28d: 80, samples_28d: '3' },
    ])
    expect(out).toHaveLength(3)
    expect(out.every((v) => v.rating === 'no-data')).toBe(true)
  })
})
