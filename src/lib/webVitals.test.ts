import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Metric } from 'web-vitals'

const callbacks = vi.hoisted(() => ({
  cls: undefined as ((metric: Metric) => void) | undefined,
  fcp: undefined as ((metric: Metric) => void) | undefined,
  inp: undefined as ((metric: Metric) => void) | undefined,
  lcp: undefined as ((metric: Metric) => void) | undefined,
  ttfb: undefined as ((metric: Metric) => void) | undefined,
}))

vi.mock('web-vitals', () => ({
  onCLS: vi.fn((reporter: (metric: Metric) => void) => {
    callbacks.cls = reporter
  }),
  onFCP: vi.fn((reporter: (metric: Metric) => void) => {
    callbacks.fcp = reporter
  }),
  onINP: vi.fn((reporter: (metric: Metric) => void) => {
    callbacks.inp = reporter
  }),
  onLCP: vi.fn((reporter: (metric: Metric) => void) => {
    callbacks.lcp = reporter
  }),
  onTTFB: vi.fn((reporter: (metric: Metric) => void) => {
    callbacks.ttfb = reporter
  }),
}))

import { initWebVitals, normalizePath } from './webVitals'

/**
 * Tests para R3 — la normalización del path antes de enviarlo a
 * `/api/web-vitals`. El objetivo es evitar leak de IDs sensibles en
 * la tabla de samples.
 */
describe('normalizePath', () => {
  it('devuelve "/" para entrada vacía o no-string', () => {
    expect(normalizePath('')).toBe('/')
    expect(normalizePath(undefined)).toBe('/')
    expect(normalizePath(null as unknown as string)).toBe('/')
  })

  it('preserva paths simples sin tokens dinámicos', () => {
    expect(normalizePath('/')).toBe('/')
    expect(normalizePath('/inicio')).toBe('/inicio')
    expect(normalizePath('/grafo')).toBe('/grafo')
    expect(normalizePath('/momentos')).toBe('/momentos')
  })

  it('reemplaza UUIDs por ":id" (case-insensitive)', () => {
    expect(normalizePath('/entities/550e8400-e29b-41d4-a716-446655440000')).toBe(
      '/entities/:id',
    )
    expect(normalizePath('/quotes/AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE/edit')).toBe(
      '/quotes/:id/edit',
    )
  })

  it('reemplaza varios UUIDs en el mismo path', () => {
    const result = normalizePath(
      '/relationships/550e8400-e29b-41d4-a716-446655440000/links/AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
    )
    expect(result).toBe('/relationships/:id/links/:id')
  })

  it('reemplaza tramos numéricos largos (≥6 dígitos) por ":n"', () => {
    expect(normalizePath('/orders/123456')).toBe('/orders/:n')
    expect(normalizePath('/feed/20260528')).toBe('/feed/:n')
    // 5 dígitos NO se reemplazan — pueden ser pagination, no IDs.
    expect(normalizePath('/page/12345')).toBe('/page/12345')
  })

  it('descarta query string si viene incluida en pathname', () => {
    // `window.location.pathname` no debería incluir query, pero somos
    // defensivos para no leakear si el caller hace algo raro.
    expect(normalizePath('/inicio?entity=secret')).toBe('/inicio')
  })

  it('combina UUIDs + números largos en un solo path', () => {
    expect(
      normalizePath('/u/550e8400-e29b-41d4-a716-446655440000/posts/9876543210'),
    ).toBe('/u/:id/posts/:n')
  })
})

describe('initWebVitals', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false)
    callbacks.cls = undefined
    callbacks.fcp = undefined
    callbacks.inp = undefined
    callbacks.lcp = undefined
    callbacks.ttfb = undefined
    window.history.replaceState({}, '', '/entities/550e8400-e29b-41d4-a716-446655440000')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('registra todas las métricas y usa sendBeacon para el reporte default', () => {
    const sendBeacon = vi.fn().mockReturnValue(true)
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    })

    initWebVitals()

    callbacks.lcp?.({
      name: 'LCP',
      value: 2100,
      rating: 'good',
      delta: 2100,
      id: 'v1',
      navigationType: 'navigate',
    } as Metric)

    expect(callbacks.cls).toBeTypeOf('function')
    expect(callbacks.fcp).toBeTypeOf('function')
    expect(callbacks.inp).toBeTypeOf('function')
    expect(callbacks.lcp).toBeTypeOf('function')
    expect(callbacks.ttfb).toBeTypeOf('function')
    expect(sendBeacon).toHaveBeenCalledWith('/api/web-vitals', expect.any(Blob))
  })

  it('usa fetch keepalive si sendBeacon existe pero rechaza el envío', async () => {
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    })
    const fetchMock = vi.spyOn(window, 'fetch').mockResolvedValue(new Response('{}'))

    initWebVitals()
    callbacks.cls?.({
      name: 'CLS',
      value: 0.04,
      rating: 'good',
      delta: 0.04,
      id: 'v2',
      navigationType: 'navigate',
    } as Metric)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/web-vitals',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }),
    )
  })
})
