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
        E2E_USER_B_EMAIL: 'b@example.com',
      },
      createClerkClient,
    })

    expect(result.mode).toBe('provided-tokens')
    expect(result.env.E2E_USER_A_TOKEN).toBe('token-a')
    expect(result.env.E2E_USER_B_TOKEN).toBe('token-b')
    expect(result.env.E2E_USER_B_EMAIL).toBe('b@example.com')
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
      users: {
        getUser: vi.fn(async (userId) => ({
          id: userId,
          primaryEmailAddressId: `email-${userId}`,
          emailAddresses: [
            {
              id: `email-${userId}`,
              emailAddress: `${userId}@example.com`,
            },
          ],
        })),
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
    expect(result.env.E2E_USER_B_EMAIL).toBe('user_b@example.com')
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
    expect(clerkClient.users.getUser).toHaveBeenCalledWith('user_b')

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
    ).toContain('E2E_USER_A_TOKEN + E2E_USER_B_TOKEN + E2E_USER_B_EMAIL')
  })

  test('exige email del usuario B cuando se usan tokens manuales', async () => {
    await expect(
      resolveMultiuserSmokeEnv({
        env: {
          E2E_BASE_URL: 'https://trama.example',
          E2E_USER_A_TOKEN: 'token-a',
          E2E_USER_B_TOKEN: 'token-b',
        },
        createClerkClient: vi.fn(),
      }),
    ).rejects.toThrow('E2E_USER_B_EMAIL')
  })

  test('agrega contexto seguro cuando Clerk rechaza una operacion', async () => {
    const clerkClient = {
      sessions: {
        createSession: vi.fn(async () => {
          const error = new Error('Bad Request')
          error.status = 400
          error.clerkError = true
          throw error
        }),
        getToken: vi.fn(),
        revokeSession: vi.fn(),
      },
      users: {
        getUser: vi.fn(async (userId) => ({
          id: userId,
          primaryEmailAddressId: `email-${userId}`,
          emailAddresses: [
            {
              id: `email-${userId}`,
              emailAddress: `${userId}@example.com`,
            },
          ],
        })),
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
        allowBrowserTokenFallback: false,
      }),
    ).rejects.toThrow(
      'Clerk rechazo createSession para E2E_USER_A_ID (status 400): Bad Request',
    )
  })

  test('usa sign-in token en navegador cuando Clerk rechaza createSession', async () => {
    const clerkClient = {
      sessions: {
        createSession: vi.fn(async () => {
          const error = new Error('Bad Request')
          error.status = 400
          throw error
        }),
        getToken: vi.fn(),
        revokeSession: vi.fn(),
      },
      users: {
        getUser: vi.fn(async (userId) => ({
          id: userId,
          primaryEmailAddressId: `email-${userId}`,
          emailAddresses: [
            {
              id: `email-${userId}`,
              emailAddress: `${userId}@example.com`,
            },
          ],
        })),
      },
    }
    const browserTokenProvider = vi.fn(async ({ userId, userLabel, baseUrl }) => ({
      jwt: `browser-jwt-${userId}-${userLabel}-${baseUrl}`,
    }))

    const result = await resolveMultiuserSmokeEnv({
      env: {
        E2E_BASE_URL: 'https://trama.example',
        CLERK_SECRET_KEY: 'sk_test_real_secret',
        E2E_USER_A_ID: 'user_a',
        E2E_USER_B_ID: 'user_b',
      },
      createClerkClient: vi.fn(() => clerkClient),
      browserTokenProvider,
    })

    expect(result.mode).toBe('minted-clerk-browser-tokens')
    expect(result.env.E2E_USER_A_TOKEN).toBe(
      'browser-jwt-user_a-E2E_USER_A_ID-https://trama.example',
    )
    expect(result.env.E2E_USER_B_TOKEN).toBe(
      'browser-jwt-user_b-E2E_USER_B_ID-https://trama.example',
    )
    expect(browserTokenProvider).toHaveBeenCalledWith({
      clerkClient,
      userId: 'user_a',
      userLabel: 'E2E_USER_A_ID',
      baseUrl: 'https://trama.example',
      expiresInSeconds: 600,
    })
    expect(browserTokenProvider).toHaveBeenCalledWith({
      clerkClient,
      userId: 'user_b',
      userLabel: 'E2E_USER_B_ID',
      baseUrl: 'https://trama.example',
      expiresInSeconds: 600,
    })
    await expect(result.cleanup()).resolves.toBeUndefined()
  })
})
