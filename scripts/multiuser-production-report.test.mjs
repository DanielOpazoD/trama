import { describe, expect, test, vi } from 'vitest'

import {
  formatProductionSmokeMarkdown,
  runProductionSmokeReport,
} from './multiuser-production-report.mjs'

describe('multiuser production smoke report', () => {
  test('compone evidencia markdown sin exponer tokens', async () => {
    const runPreflight = vi.fn(async () => ({
      status: 'ok',
      exitCode: 0,
      lines: ['cutover_preflight: ok', 'anonymous_401: ok', 'auth_strict: ok'],
      hints: [],
    }))
    const probeRuntimeApiRoutes = vi.fn(async () => ({
      ok: true,
      baseUrl: 'https://deploy-preview.example',
      results: [
        { ok: true, method: 'GET', path: '/api/recortes', status: 200 },
        { ok: true, method: 'DELETE', path: '/api/recortes/id', status: 404 },
      ],
      failures: [],
    }))
    const spawnSyncImpl = vi.fn(() => ({ status: 0 }))

    const report = await runProductionSmokeReport({
      env: {
        E2E_BASE_URL: 'https://deploy-preview.example/',
        E2E_USER_A_TOKEN: 'token-a-secret',
        E2E_USER_B_TOKEN: 'token-b-secret',
      },
      runPreflight,
      probeRuntimeApiRoutes,
      spawnSyncImpl,
    })

    expect(report.ok).toBe(true)
    expect(runPreflight).toHaveBeenCalledWith({
      baseUrl: 'https://deploy-preview.example/',
      healthToken: 'token-a-secret',
    })
    expect(probeRuntimeApiRoutes).toHaveBeenCalledWith({
      baseUrl: 'https://deploy-preview.example/',
      tokenA: 'token-a-secret',
      tokenB: 'token-b-secret',
    })
    expect(spawnSyncImpl).toHaveBeenCalledWith(
      process.execPath,
      [
        'node_modules/.bin/playwright',
        'test',
        'e2e/runtime-api-routing.spec.ts',
        'e2e/multi-user-isolation.spec.ts',
        '--project=chromium',
      ],
      expect.objectContaining({
        stdio: 'pipe',
        encoding: 'utf8',
        env: expect.objectContaining({
          E2E_USER_A_TOKEN: 'token-a-secret',
          E2E_USER_B_TOKEN: 'token-b-secret',
        }),
      }),
    )

    const markdown = formatProductionSmokeMarkdown(report)
    expect(markdown).toContain('## Multiuser production smoke evidence')
    expect(markdown).toContain('anonymous_401: ok')
    expect(markdown).toContain('runtime_api_route_probe: ok')
    expect(markdown).toContain('playwright_smoke: ok')
    expect(markdown).not.toContain('token-a-secret')
    expect(markdown).not.toContain('token-b-secret')
  })

  test('marca failed cuando preflight o rutas fallan', async () => {
    const report = await runProductionSmokeReport({
      env: {
        E2E_BASE_URL: 'https://trama.example',
        E2E_USER_A_TOKEN: 'token-a',
      },
      runPreflight: vi.fn(async () => ({
        status: 'failed',
        exitCode: 1,
        lines: ['cutover_preflight: failed', 'anonymous_401: failed_status_200'],
        hints: ['desactiva ALLOW_LEGACY_FALLBACK'],
      })),
      probeRuntimeApiRoutes: vi.fn(async () => ({
        ok: false,
        baseUrl: 'https://trama.example',
        results: [],
        failures: [{ path: '/api/notes', reason: 'received SPA/html fallback' }],
      })),
      spawnSyncImpl: vi.fn(() => ({ status: 1, stderr: 'e2e failed' })),
    })

    expect(report.ok).toBe(false)
    expect(formatProductionSmokeMarkdown(report)).toContain('production_smoke: failed')
    expect(formatProductionSmokeMarkdown(report)).toContain(
      'desactiva ALLOW_LEGACY_FALLBACK',
    )
  })
})
