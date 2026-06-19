import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  formatProductionSmokeMarkdown,
  runProductionSmokeReport,
} from './multiuser-production-report.mjs'

describe('multiuser production smoke report', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

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
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

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
    const events = consoleErrorSpy.mock.calls.map((call) => JSON.parse(call[0]))
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'smoke.passed',
          category: 'operational',
          severity: 'info',
          baseUrl: 'https://deploy-preview.example',
        }),
      ]),
    )
  })

  test('marca failed cuando preflight o rutas fallan', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
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
      spawnSyncImpl: vi.fn(() => ({
        status: 1,
        stderr: 'e2e failed E2E_USER_A_TOKEN=raw-token-secret',
      })),
    })

    expect(report.ok).toBe(false)
    expect(report.playwright.stderr).not.toContain('raw-token-secret')
    expect(formatProductionSmokeMarkdown(report)).toContain('production_smoke: failed')
    expect(formatProductionSmokeMarkdown(report)).toContain(
      'desactiva ALLOW_LEGACY_FALLBACK',
    )
    expect(formatProductionSmokeMarkdown(report)).not.toContain('raw-token-secret')
    const events = consoleErrorSpy.mock.calls.map((call) => JSON.parse(call[0]))
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'smoke.failed',
          category: 'operational',
          severity: 'error',
          baseUrl: 'https://trama.example',
        }),
      ]),
    )
  })

  test('puede comentar el markdown en un PR sin exponer tokens', async () => {
    const spawnSyncImpl = vi.fn(() => ({ status: 0 }))
    const report = {
      ok: true,
      baseUrl: 'https://deploy-preview.example',
      generatedAt: '2026-06-19T00:00:00.000Z',
      preflight: { lines: ['anonymous_401: ok'], hints: [] },
      routeProbe: { ok: true, results: [], failures: [] },
      playwright: { ok: true, status: 0 },
    }
    const { commentProductionSmokeReport } =
      await import('./multiuser-production-report.mjs')

    const result = commentProductionSmokeReport({
      report,
      prNumber: '249',
      repo: 'DanielOpazoD/trama',
      spawnSyncImpl,
    })

    expect(result.ok).toBe(true)
    expect(spawnSyncImpl).toHaveBeenCalledWith(
      'gh',
      ['pr', 'comment', '249', '--repo', 'DanielOpazoD/trama', '--body-file', '-'],
      expect.objectContaining({
        input: expect.stringContaining('production_smoke: ok'),
        encoding: 'utf8',
      }),
    )
  })

  test('no pasa flags propios del reporte a Playwright', async () => {
    const spawnSyncImpl = vi.fn(() => ({ status: 0 }))

    await runProductionSmokeReport({
      env: {
        E2E_BASE_URL: 'https://deploy-preview.example/',
        E2E_USER_A_TOKEN: 'token-a-secret',
        E2E_USER_B_TOKEN: 'token-b-secret',
      },
      argv: ['--comment-pr=249', '--repo=DanielOpazoD/trama', '--project=chromium'],
      runPreflight: vi.fn(async () => ({
        status: 'ok',
        exitCode: 0,
        lines: ['anonymous_401: ok'],
        hints: [],
      })),
      probeRuntimeApiRoutes: vi.fn(async () => ({
        ok: true,
        baseUrl: 'https://deploy-preview.example',
        results: [],
        failures: [],
      })),
      spawnSyncImpl,
    })

    expect(spawnSyncImpl.mock.calls[0]?.[1]).toEqual([
      'node_modules/.bin/playwright',
      'test',
      'e2e/runtime-api-routing.spec.ts',
      'e2e/multi-user-isolation.spec.ts',
      '--project=chromium',
    ])
  })
})
