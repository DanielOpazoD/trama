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
const verifyTokenMock = vi.fn()
vi.mock('@clerk/backend', () => ({
  createClerkClient: vi.fn(() => ({
    verifyToken: verifyTokenMock,
  })),
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
    // Reset módulo para que el lazy singleton del clerkClient se
    // re-instancie por test.
    vi.resetModules()
    // Limpiamos env vars que afectan el flujo. cada test setea las
    // que necesita explícitamente.
    delete process.env['CLERK_SECRET_KEY']
    delete process.env['ALLOW_LEGACY_FALLBACK']
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
    expect(verifyTokenMock).toHaveBeenCalledWith('goodtoken')
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
})
