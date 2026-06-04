import { describe, expect, test, vi } from 'vitest'

import {
  resolveMultiuserSmokeEnv,
  getMissingMultiuserSmokeEnvMessage,
} from './multiuser-smoke-env.mjs'

describe('multiuser smoke env', () => {
  test('usa tokens manuales cuando vienen configurados', async () => {
    const createClerkClient = vi.fn()

    const result = await resolveMultiuserSmokeEnv({
      env: {
        E2E_BASE_URL: 'https://trama.example',
        E2E_USER_A_TOKEN: 'token-a',
        E2E_USER_B_TOKEN: 'token-b',
      },
      createClerkClient,
    })

    expect(result.mode).toBe('provided-tokens')
    expect(result.env.E2E_USER_A_TOKEN).toBe('token-a')
    expect(result.env.E2E_USER_B_TOKEN).toBe('token-b')
    expect(createClerkClient).not.toHaveBeenCalled()
    await expect(result.cleanup()).resolves.toBeUndefined()
  })

  test('crea tokens efimeros con Clerk y revoca las sesiones al terminar', async () => {
    const createdSessions = []
    const revokedSessions = []
    const clerkClient = {
      sessions: {
        createSession: vi.fn(async ({ userId }) => {
          const session = { id: `sess-${userId}` }
          createdSessions.push(session.id)
          return session
        }),
        getToken: vi.fn(async (sessionId, template, expiresInSeconds) => ({
          jwt: `jwt-${sessionId}-${template ?? 'default'}-${expiresInSeconds}`,
        })),
        revokeSession: vi.fn(async (sessionId) => {
          revokedSessions.push(sessionId)
        }),
      },
    }
    const createClerkClient = vi.fn(() => clerkClient)

    const result = await resolveMultiuserSmokeEnv({
      env: {
        E2E_BASE_URL: 'https://trama.example',
        CLERK_SECRET_KEY: 'sk_test_real_secret',
        E2E_USER_A_ID: 'user_a',
        E2E_USER_B_ID: 'user_b',
        E2E_CLERK_TOKEN_TTL_SECONDS: '900',
      },
      createClerkClient,
    })

    expect(result.mode).toBe('minted-clerk-tokens')
    expect(result.env.E2E_USER_A_TOKEN).toBe('jwt-sess-user_a-default-900')
    expect(result.env.E2E_USER_B_TOKEN).toBe('jwt-sess-user_b-default-900')
    expect(createClerkClient).toHaveBeenCalledWith({ secretKey: 'sk_test_real_secret' })
    expect(createdSessions).toEqual(['sess-user_a', 'sess-user_b'])
    expect(clerkClient.sessions.getToken).toHaveBeenCalledWith(
      'sess-user_a',
      undefined,
      900,
    )
    expect(clerkClient.sessions.getToken).toHaveBeenCalledWith(
      'sess-user_b',
      undefined,
      900,
    )

    await result.cleanup()

    expect(revokedSessions).toEqual(['sess-user_a', 'sess-user_b'])
  })

  test('explica las dos configuraciones validas cuando falta entorno', () => {
    expect(
      getMissingMultiuserSmokeEnvMessage({
        E2E_BASE_URL: 'https://trama.example',
        CLERK_SECRET_KEY: 'sk_test_real_secret',
        E2E_USER_A_ID: 'user_a',
      }),
    ).toContain('CLERK_SECRET_KEY + E2E_USER_A_ID + E2E_USER_B_ID')
  })
})
