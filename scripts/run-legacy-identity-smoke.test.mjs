import { describe, expect, it, vi } from 'vitest'
import { runLegacyIdentitySmoke } from './run-legacy-identity-smoke.mjs'

function stream() {
  return {
    chunks: [],
    write(chunk) {
      this.chunks.push(String(chunk))
    },
    text() {
      return this.chunks.join('')
    },
  }
}

describe('legacy identity smoke runner', () => {
  it('corre el spec legacy con tokens A/B resueltos y token owner opcional', async () => {
    const stdout = stream()
    const stderr = stream()
    const spawnSyncImpl = vi.fn().mockReturnValue({ status: 0 })
    const cleanup = vi.fn()

    const result = await runLegacyIdentitySmoke({
      env: {
        E2E_BASE_URL: 'https://deploy-preview-260--tramadaod.netlify.app',
        E2E_USER_A_TOKEN: 'token-a',
        E2E_USER_B_TOKEN: 'token-b',
        E2E_LEGACY_OWNER_TOKEN: 'token-owner',
      },
      resolveSmokeEnv: vi.fn().mockResolvedValue({
        mode: 'provided-tokens',
        env: {
          E2E_BASE_URL: 'https://deploy-preview-260--tramadaod.netlify.app',
          E2E_USER_A_TOKEN: 'token-a',
          E2E_USER_B_TOKEN: 'token-b',
          E2E_LEGACY_OWNER_TOKEN: 'token-owner',
        },
        cleanup,
      }),
      spawnSyncImpl,
      stdout,
      stderr,
    })

    expect(result.exitCode).toBe(0)
    expect(spawnSyncImpl).toHaveBeenCalledWith(
      process.execPath,
      ['node_modules/.bin/playwright', 'test', 'e2e/legacy-identity-cutover.spec.ts'],
      expect.objectContaining({
        env: expect.objectContaining({
          E2E_LEGACY_OWNER_TOKEN: 'token-owner',
        }),
      }),
    )
    expect(cleanup).toHaveBeenCalled()
    expect(stdout.text()).toContain('legacy_identity_smoke: ok')
    expect(stderr.text()).toBe('')
  })
})
