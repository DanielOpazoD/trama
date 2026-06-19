import { describe, expect, test, vi } from 'vitest'

import { runCutoverIsolationSmoke } from './run-cutover-isolation-smoke.mjs'

describe('cutover isolation smoke runner', () => {
  test('ejecuta solo el caso A/B y no exige preflight estricto de producción', async () => {
    const cleanup = vi.fn(async () => {})
    const spawnSyncImpl = vi.fn(() => ({ status: 0 }))
    const stdout = { write: vi.fn() }

    const result = await runCutoverIsolationSmoke({
      env: { E2E_BASE_URL: 'https://deploy-preview-242--tramadaod.netlify.app' },
      argv: ['--project=chromium'],
      resolveSmokeEnv: vi.fn(async () => ({
        mode: 'active-clerk-sessions',
        env: {
          E2E_BASE_URL: 'https://deploy-preview-242--tramadaod.netlify.app',
          E2E_USER_A_TOKEN: 'token-a',
          E2E_USER_B_TOKEN: 'token-b',
        },
        cleanup,
      })),
      spawnSyncImpl,
      stdout,
      stderr: { write: vi.fn() },
    })

    expect(result.exitCode).toBe(0)
    expect(spawnSyncImpl).toHaveBeenNthCalledWith(
      1,
      process.execPath,
      [
        'node_modules/.bin/playwright',
        'test',
        'e2e/runtime-api-routing.spec.ts',
        '--project=chromium',
      ],
      expect.objectContaining({
        stdio: 'inherit',
        env: expect.objectContaining({
          E2E_USER_A_TOKEN: 'token-a',
          E2E_USER_B_TOKEN: 'token-b',
        }),
      }),
    )
    expect(spawnSyncImpl).toHaveBeenNthCalledWith(
      2,
      process.execPath,
      [
        'node_modules/.bin/playwright',
        'test',
        'e2e/multi-user-isolation.spec.ts',
        '--grep',
        'user B cannot discover user A fixtures',
        '--project=chromium',
      ],
      expect.objectContaining({
        stdio: 'inherit',
        env: expect.objectContaining({
          E2E_USER_A_TOKEN: 'token-a',
          E2E_USER_B_TOKEN: 'token-b',
        }),
      }),
    )
    expect(cleanup).toHaveBeenCalled()
    expect(stdout.write.mock.calls.join('\n')).toContain('cutover_isolation_smoke: ok')
    expect(stdout.write.mock.calls.join('\n')).toContain(
      'anonymous_401: not_checked_preview_only',
    )
  })

  test('falla antes de crear fixtures cuando el preflight de rutas falla', async () => {
    const cleanup = vi.fn(async () => {})
    const stderr = { write: vi.fn() }

    const result = await runCutoverIsolationSmoke({
      env: { E2E_BASE_URL: 'https://preview.example' },
      argv: ['--project=chromium'],
      resolveSmokeEnv: vi.fn(async () => ({
        mode: 'provided-tokens',
        env: {
          E2E_BASE_URL: 'https://preview.example',
          E2E_USER_A_TOKEN: 'token-a',
          E2E_USER_B_TOKEN: 'token-b',
        },
        cleanup,
      })),
      spawnSyncImpl: vi.fn(() => ({ status: 1 })),
      stdout: { write: vi.fn() },
      stderr,
    })

    expect(result.exitCode).toBe(1)
    expect(cleanup).toHaveBeenCalled()
    expect(stderr.write.mock.calls.join('\n')).toContain('cutover_route_contract: failed')
  })

  test('limpia sesiones temporales aunque Playwright falle', async () => {
    const cleanup = vi.fn(async () => {})
    const stderr = { write: vi.fn() }

    const result = await runCutoverIsolationSmoke({
      env: { E2E_BASE_URL: 'https://preview.example' },
      argv: ['--project=chromium'],
      resolveSmokeEnv: vi.fn(async () => ({
        mode: 'minted-clerk-tokens',
        env: {
          E2E_BASE_URL: 'https://preview.example',
          E2E_USER_A_TOKEN: 'token-a',
          E2E_USER_B_TOKEN: 'token-b',
        },
        cleanup,
      })),
      spawnSyncImpl: vi.fn().mockReturnValueOnce({ status: 0 }).mockReturnValueOnce({
        status: 1,
      }),
      stdout: { write: vi.fn() },
      stderr,
    })

    expect(result.exitCode).toBe(1)
    expect(cleanup).toHaveBeenCalled()
    expect(stderr.write.mock.calls.join('\n')).toContain(
      'cutover_isolation_smoke: failed',
    )
  })
})
