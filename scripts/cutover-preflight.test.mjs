import { describe, expect, test } from 'vitest'
import { URL } from 'node:url'

import { formatPreflightMarkdown, runCutoverPreflight } from './cutover-preflight.mjs'

function jsonResponse(body, status = 200) {
  return {
    status,
    async json() {
      return body
    },
  }
}

function textResponse(body, status = 200) {
  return {
    status,
    async json() {
      throw new Error('not json')
    },
    async text() {
      return body
    },
  }
}

function createFetch(routes) {
  return async (url, options = {}) => {
    const path = new URL(url).pathname
    const route = routes[path]
    if (!route) throw new Error(`unexpected fetch ${path}`)
    if (typeof route === 'function') return route(options)
    return route
  }
}

describe('cutover preflight', () => {
  test('aprueba un entorno estricto sin fallback y anónimo 401', async () => {
    const result = await runCutoverPreflight({
      baseUrl: 'https://trama.example/',
      fetchImpl: createFetch({
        '/api/health': jsonResponse({
          auth: {
            clerkConfigured: true,
            legacyFallbackAllowed: false,
            mode: 'clerk-strict',
          },
        }),
        '/api/entities': textResponse('unauthorized', 401),
      }),
    })

    expect(result.status).toBe('ok')
    expect(result.exitCode).toBe(0)
    expect(result.lines).toContain('cutover_preflight: ok')
    expect(result.lines).toContain('auth_strict: ok')
    expect(result.lines).toContain('anonymous_401: ok')
  })

  test('falla cuando Clerk está en fallback legacy y anónimo no da 401', async () => {
    const result = await runCutoverPreflight({
      baseUrl: 'https://preview.example',
      fetchImpl: createFetch({
        '/api/health': jsonResponse({
          auth: {
            clerkConfigured: true,
            legacyFallbackAllowed: true,
            mode: 'clerk-with-legacy-fallback',
          },
        }),
        '/api/entities': jsonResponse([{ id: 'legacy-row' }], 200),
      }),
    })

    expect(result.status).toBe('failed')
    expect(result.exitCode).toBe(1)
    expect(result.lines).toContain('cutover_preflight: failed')
    expect(result.lines).toContain('auth_strict: failed_legacy_fallback')
    expect(result.lines).toContain('anonymous_401: failed_status_200')
    expect(result.hints.join('\n')).toContain('ALLOW_LEGACY_FALLBACK')
  })

  test('acepta preflight parcial cuando health requiere auth pero anónimo ya es 401', async () => {
    const result = await runCutoverPreflight({
      baseUrl: 'https://trama.example',
      fetchImpl: createFetch({
        '/api/health': textResponse('unauthorized', 401),
        '/api/entities': textResponse('unauthorized', 401),
      }),
    })

    expect(result.status).toBe('partial_health_auth_required')
    expect(result.exitCode).toBe(0)
    expect(result.lines).toContain('cutover_preflight: partial_health_auth_required')
    expect(result.lines).toContain('health: skipped_auth_required')
    expect(result.lines).toContain('anonymous_401: ok')
    expect(result.hints.join('\n')).toContain('CUTOVER_HEALTH_TOKEN')
  })

  test('usa token solo para health cuando está disponible', async () => {
    const result = await runCutoverPreflight({
      baseUrl: 'https://trama.example',
      healthToken: 'token-a',
      fetchImpl: createFetch({
        '/api/health': (options) => {
          expect(options.headers.authorization).toBe('Bearer token-a')
          return jsonResponse({
            auth: {
              clerkConfigured: true,
              legacyFallbackAllowed: false,
              mode: 'clerk',
            },
          })
        },
        '/api/entities': (options) => {
          expect(options.headers?.authorization).toBeUndefined()
          return textResponse('unauthorized', 401)
        },
      }),
    })

    expect(result.status).toBe('ok')
    expect(result.lines).toContain('auth_strict: ok')
  })

  test('permite preview con fallback solo como dry run explícito', async () => {
    const result = await runCutoverPreflight({
      baseUrl: 'https://deploy-preview-242--tramadaod.netlify.app',
      allowLegacyPreview: true,
      fetchImpl: createFetch({
        '/api/health': jsonResponse({
          auth: {
            clerkConfigured: true,
            legacyFallbackAllowed: true,
            mode: 'clerk-with-legacy-fallback',
          },
        }),
        '/api/entities': jsonResponse([{ id: 'legacy-row' }], 200),
      }),
    })

    expect(result.status).toBe('preview_fallback')
    expect(result.exitCode).toBe(0)
    expect(result.lines).toContain('cutover_preflight: skipped_preview_fallback')
    expect(result.lines).toContain('auth_strict: skipped_preview_fallback')
    expect(result.lines).toContain('anonymous_401: skipped_preview_fallback')
  })

  test('el markdown de evidencia no imprime secretos ni payloads crudos', async () => {
    const result = await runCutoverPreflight({
      baseUrl: 'https://trama.example',
      fetchImpl: createFetch({
        '/api/health': jsonResponse({
          auth: {
            clerkConfigured: true,
            legacyFallbackAllowed: false,
            mode: 'clerk-strict',
          },
          CLERK_SECRET_KEY: 'sk_live_should_not_leak',
        }),
        '/api/entities': textResponse('Bearer should-not-leak', 401),
      }),
    })

    const markdown = formatPreflightMarkdown(result)
    expect(markdown).toContain('cutover_preflight: ok')
    expect(markdown).not.toContain('sk_live_should_not_leak')
    expect(markdown).not.toContain('should-not-leak')
  })
})
