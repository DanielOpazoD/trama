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

  test('usa una sesión activa si Clerk no permite crear sesiones en ese entorno', async () => {
    const clerkClient = {
      sessions: {
        createSession: vi.fn(async () => {
          const error = new Error('Bad Request')
          error.errors = [{ code: 'request_invalid_for_environment' }]
          throw error
        }),
        getSessionList: vi.fn(async ({ userId }) => ({
          data: [{ id: `active-${userId}`, status: 'active' }],
        })),
        getToken: vi.fn(async (sessionId, template, expiresInSeconds) => ({
          jwt: `jwt-${sessionId}-${template ?? 'default'}-${expiresInSeconds}`,
        })),
        revokeSession: vi.fn(async () => {}),
      },
    }

    const result = await resolveMultiuserSmokeEnv({
      env: {
        E2E_BASE_URL: 'https://trama.example',
        CLERK_SECRET_KEY: 'sk_test_real_secret',
        E2E_USER_A_ID: 'user_a',
        E2E_USER_B_ID: 'user_b',
      },
      createClerkClient: vi.fn(() => clerkClient),
    })

    expect(result.mode).toBe('active-clerk-sessions')
    expect(result.env.E2E_USER_A_TOKEN).toBe('jwt-active-user_a-default-600')
    expect(result.env.E2E_USER_B_TOKEN).toBe('jwt-active-user_b-default-600')
    expect(clerkClient.sessions.revokeSession).not.toHaveBeenCalled()
  })

  test('explica que falta login activo si no puede crear sesión ni encontrar una activa', async () => {
    const clerkClient = {
      sessions: {
        createSession: vi.fn(async () => {
          const error = new Error('Bad Request')
          error.errors = [{ code: 'request_invalid_for_environment' }]
          throw error
        }),
        getSessionList: vi.fn(async () => ({ data: [] })),
        getToken: vi.fn(),
        revokeSession: vi.fn(),
      },
    }

    await expect(
      resolveMultiuserSmokeEnv({
        env: {
          E2E_BASE_URL: 'https://trama.example',
          CLERK_SECRET_KEY: 'sk_test_real_secret',
          E2E_USER_A_ID: 'user_a',
          E2E_USER_B_ID: 'user_b',
        },
        createClerkClient: vi.fn(() => clerkClient),
      }),
    ).rejects.toThrow('no tiene sesiones activas')
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
