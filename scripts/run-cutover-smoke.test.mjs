import { describe, expect, test, vi } from 'vitest'

import { runCutoverSmoke } from './run-cutover-smoke.mjs'

describe('cutover smoke runner', () => {
  test('no ejecuta e2e si el preflight estricto falla', async () => {
    const spawnSyncImpl = vi.fn()
    const resolveSmokeEnv = vi.fn(async () => ({
      mode: 'provided-tokens',
      env: {
        E2E_BASE_URL: 'https://trama.example',
        E2E_USER_A_TOKEN: 'token-a',
        E2E_USER_B_TOKEN: 'token-b',
      },
      cleanup: vi.fn(async () => {}),
    }))
    const runPreflight = vi.fn(async () => ({
      status: 'failed',
      exitCode: 1,
      lines: ['cutover_preflight: failed', 'anonymous_401: failed_status_200'],
      hints: ['desactiva ALLOW_LEGACY_FALLBACK'],
    }))

    const result = await runCutoverSmoke({
      env: { E2E_BASE_URL: 'https://trama.example' },
      argv: ['--project=chromium'],
      runPreflight,
      resolveSmokeEnv,
      spawnSyncImpl,
      stdout: { write: vi.fn() },
      stderr: { write: vi.fn() },
    })

    expect(result.exitCode).toBe(1)
    expect(runPreflight).toHaveBeenCalledWith({
      baseUrl: 'https://trama.example',
      healthToken: 'token-a',
    })
    expect(spawnSyncImpl).not.toHaveBeenCalled()
  })

  test('ejecuta Playwright con entorno resuelto y resume evidencia cuando pasa', async () => {
    const spawnSyncImpl = vi.fn(() => ({ status: 0 }))
    const stdout = { write: vi.fn() }

    const result = await runCutoverSmoke({
      env: { E2E_BASE_URL: 'https://trama.example' },
      argv: ['--project=chromium'],
      runPreflight: vi.fn(async () => ({
        status: 'ok',
        exitCode: 0,
        lines: ['cutover_preflight: ok', 'auth_strict: ok', 'anonymous_401: ok'],
        hints: [],
      })),
      resolveSmokeEnv: vi.fn(async () => ({
        mode: 'provided-tokens',
        env: {
          E2E_BASE_URL: 'https://trama.example',
          E2E_USER_A_TOKEN: 'token-a',
          E2E_USER_B_TOKEN: 'token-b',
        },
        cleanup: vi.fn(async () => {}),
      })),
      spawnSyncImpl,
      stdout,
      stderr: { write: vi.fn() },
    })

    expect(result.exitCode).toBe(0)
    expect(spawnSyncImpl).toHaveBeenCalledWith(
      process.execPath,
      [
        'node_modules/.bin/playwright',
        'test',
        'e2e/multi-user-isolation.spec.ts',
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
    expect(stdout.write.mock.calls.join('\n')).toContain('cutover_smoke: ok')
  })
})
