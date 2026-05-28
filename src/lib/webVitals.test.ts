import { describe, expect, it } from 'vitest'
import { normalizePath } from './webVitals'

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
