import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Tests del módulo auth.ts — la pieza central del modelo multi-user.
 *
 * Foco:
 *   1. Modo legacy (sin Clerk): siempre devuelve 'legacy-single-user'.
 *   2. Modo Clerk (con secret key): valida Bearer token y devuelve sub.
 *   3. ALLOW_LEGACY_FALLBACK: con Clerk pero sin token, fallback al legacy.
 *   4. Tokens inválidos: con Clerk + token mal firmado → UnauthenticatedError.
 *
 * NOTA importante: no podemos probar la verificación REAL de Clerk
 * (requiere claves reales). Mockeamos `@clerk/backend` para controlar
 * el comportamiento de verifyToken.
 */

// Mock Clerk antes de importar auth — verifyToken se controla por test.
// `verifyToken` es un export standalone de @clerk/backend (no un método
// de ClerkClient), así que lo mockeamos directamente.
const verifyTokenMock = vi.fn()
const getUserMock = vi.fn()
vi.mock('@clerk/backend', () => ({
  verifyToken: verifyTokenMock,
  createClerkClient: () => ({
    users: { getUser: getUserMock },
  }),
}))

// Helper para construir un Request con o sin Authorization header.
function makeRequest(authHeader?: string): Request {
  const headers: Record<string, string> = {}
  if (authHeader) headers['authorization'] = authHeader
  return new Request('http://localhost/api/test', { headers })
}

describe('getAuthedUser', () => {
  beforeEach(() => {
    verifyTokenMock.mockReset()
    getUserMock.mockReset()
    getUserMock.mockRejectedValue(new Error('not found'))
    // Reset módulo para reimportar auth.js limpio en cada test.
    vi.resetModules()
    // Limpiamos env vars que afectan el flujo. cada test setea las
    // que necesita explícitamente.
    delete process.env['CLERK_SECRET_KEY']
    delete process.env['ALLOW_LEGACY_FALLBACK']
    delete process.env['LEGACY_OWNER_CLERK_ID']
    vi.unstubAllGlobals()
    // Netlify.env no existe en este runtime — el módulo cae a process.env.
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sin Clerk configurado → devuelve legacy-single-user (modo single-user)', async () => {
    const { getAuthedUser } = await import('./auth.js')
    const user = await getAuthedUser(makeRequest())
    expect(user.id).toBe('legacy-single-user')
  })

  it('sin Clerk configurado, incluso con Bearer presente → legacy (token ignorado)', async () => {
    const { getAuthedUser } = await import('./auth.js')
    const user = await getAuthedUser(makeRequest('Bearer alguntoken'))
    expect(user.id).toBe('legacy-single-user')
    // verifyToken nunca se llamó — la rama Clerk no se evalúa sin secret key.
    expect(verifyTokenMock).not.toHaveBeenCalled()
  })

  it('con Clerk + token válido → devuelve el sub del token', async () => {
    process.env['CLERK_SECRET_KEY'] = 'sk_test_xxxx'
    verifyTokenMock.mockResolvedValue({ sub: 'user_real_clerk_id_123' })

    const { getAuthedUser } = await import('./auth.js')
    const user = await getAuthedUser(makeRequest('Bearer goodtoken'))
    expect(user.id).toBe('user_real_clerk_id_123')
    expect(verifyTokenMock).toHaveBeenCalledWith('goodtoken', {
      secretKey: 'sk_test_xxxx',
    })
  })

  it('con Clerk + token inválido + ALLOW_LEGACY_FALLBACK=true → legacy', async () => {
    process.env['CLERK_SECRET_KEY'] = 'sk_test_xxxx'
    process.env['ALLOW_LEGACY_FALLBACK'] = 'true'
    verifyTokenMock.mockRejectedValue(new Error('bad signature'))

    const { getAuthedUser } = await import('./auth.js')
    const user = await getAuthedUser(makeRequest('Bearer badtoken'))
    expect(user.id).toBe('legacy-single-user')
  })

  it('con Clerk + token inválido + sin fallback → UnauthenticatedError', async () => {
    process.env['CLERK_SECRET_KEY'] = 'sk_test_xxxx'
    verifyTokenMock.mockRejectedValue(new Error('bad signature'))

    const { getAuthedUser, UnauthenticatedError } = await import('./auth.js')
    await expect(getAuthedUser(makeRequest('Bearer badtoken'))).rejects.toBeInstanceOf(
      UnauthenticatedError,
    )
  })

  it('con Clerk + sin token + sin fallback → UnauthenticatedError', async () => {
    process.env['CLERK_SECRET_KEY'] = 'sk_test_xxxx'

    const { getAuthedUser, UnauthenticatedError } = await import('./auth.js')
    await expect(getAuthedUser(makeRequest())).rejects.toBeInstanceOf(
      UnauthenticatedError,
    )
  })

  it('con Clerk + token del dueño (LEGACY_OWNER_CLERK_ID) → mapea a legacy-single-user', async () => {
    process.env['CLERK_SECRET_KEY'] = 'sk_test_xxxx'
    process.env['LEGACY_OWNER_CLERK_ID'] = 'user_owner_sub'
    verifyTokenMock.mockResolvedValue({ sub: 'user_owner_sub' })

    const { getAuthedUser } = await import('./auth.js')
    const user = await getAuthedUser(makeRequest('Bearer ownertoken'))
    // El dueño histórico ve toda la data pre-Clerk sin migrar tablas/blobs.
    expect(user.id).toBe('legacy-single-user')
  })

  it('con Clerk + LEGACY_OWNER_CLERK_ID seteado pero otro usuario → su sub real', async () => {
    process.env['CLERK_SECRET_KEY'] = 'sk_test_xxxx'
    process.env['LEGACY_OWNER_CLERK_ID'] = 'user_owner_sub'
    verifyTokenMock.mockResolvedValue({ sub: 'user_familiar' })

    const { getAuthedUser } = await import('./auth.js')
    const user = await getAuthedUser(makeRequest('Bearer familiartoken'))
    // Un usuario distinto del dueño arranca con su propio espacio.
    expect(user.id).toBe('user_familiar')
  })

  it('dos usuarios reales (Clerk) reciben IDs distintos — base del isolation', async () => {
    process.env['CLERK_SECRET_KEY'] = 'sk_test_xxxx'

    verifyTokenMock.mockResolvedValueOnce({ sub: 'user_alice' })
    verifyTokenMock.mockResolvedValueOnce({ sub: 'user_bob' })

    const { getAuthedUser } = await import('./auth.js')
    const alice = await getAuthedUser(makeRequest('Bearer token-alice'))
    const bob = await getAuthedUser(makeRequest('Bearer token-bob'))

    expect(alice.id).toBe('user_alice')
    expect(bob.id).toBe('user_bob')
    expect(alice.id).not.toBe(bob.id)
  })

  it('cuando JWT no incluye email → busca el email desde Clerk Backend API', async () => {
    process.env['CLERK_SECRET_KEY'] = 'sk_test_xxxx'
    // JWT sin claim de email
    verifyTokenMock.mockResolvedValue({ sub: 'user_invitee' })
    // Clerk API devuelve el email
    getUserMock.mockResolvedValue({
      primaryEmailAddressId: 'ea_1',
      emailAddresses: [{ id: 'ea_1', emailAddress: 'Invitee@Example.com' }],
    })

    const { getAuthedUser } = await import('./auth.js')
    const user = await getAuthedUser(makeRequest('Bearer token'))
    expect(user.email).toBe('invitee@example.com')
    expect(getUserMock).toHaveBeenCalledWith('user_invitee')
  })

  it('email del JWT tiene prioridad sobre Clerk API', async () => {
    process.env['CLERK_SECRET_KEY'] = 'sk_test_xxxx'
    verifyTokenMock.mockResolvedValue({
      sub: 'user_invitee',
      email: 'fromjwt@example.com',
    })

    const { getAuthedUser } = await import('./auth.js')
    const user = await getAuthedUser(makeRequest('Bearer token'))
    expect(user.email).toBe('fromjwt@example.com')
    // No debió llamar a la API porque el JWT ya tenía email
    expect(getUserMock).not.toHaveBeenCalled()
  })

  it('si Clerk API falla → email queda undefined sin romper la autenticación', async () => {
    process.env['CLERK_SECRET_KEY'] = 'sk_test_xxxx'
    verifyTokenMock.mockResolvedValue({ sub: 'user_invitee' })
    getUserMock.mockRejectedValue(new Error('Clerk API down'))

    const { getAuthedUser } = await import('./auth.js')
    const user = await getAuthedUser(makeRequest('Bearer token'))
    expect(user.id).toBe('user_invitee')
    expect(user.email).toBeUndefined()
  })
})
