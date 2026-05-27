/**
 * Autenticación vía Clerk — capa backend.
 *
 * Modo de operación se determina automáticamente:
 *   - Sin CLERK_SECRET_KEY configurado → modo single-user (legacy).
 *     Todos los endpoints devuelven `legacy-single-user`, idéntico al
 *     comportamiento pre-multi-user.
 *   - Con CLERK_SECRET_KEY configurado → requiere Bearer token Clerk.
 *     Durante el período de migración se puede setear
 *     ALLOW_LEGACY_FALLBACK=true para que requests sin token caigan a
 *     `legacy-single-user` en lugar de 401 (cutover gradual).
 */
import { createClerkClient } from '@clerk/backend'

/** Lee una env var de forma segura tanto en Netlify runtime como en tests. */
function readEnv(key: string): string | undefined {
  try {
    return Netlify.env.get(key)
  } catch {
    return process.env[key]
  }
}

// Lazy singleton — no se crea hasta la primera llamada a getAuthedUser.
let _clerkClient: ReturnType<typeof createClerkClient> | null = null
function getClerkClient() {
  if (!_clerkClient) {
    _clerkClient = createClerkClient({
      secretKey: readEnv('CLERK_SECRET_KEY') ?? '',
    })
  }
  return _clerkClient
}

export type AuthedUser = {
  id: string // Clerk user ID — ej: user_2abc123xyz
  email?: string
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('Authentication required')
    this.name = 'UnauthenticatedError'
  }
}

/**
 * Extrae y verifica el userId del Bearer token de Clerk.
 *
 * - Sin Clerk configurado → siempre devuelve legacy user (modo single-user).
 * - Con Clerk + token válido → devuelve el userId real.
 * - Con Clerk + sin token → 401 (a menos que ALLOW_LEGACY_FALLBACK=true).
 */
export async function getAuthedUser(request: Request): Promise<AuthedUser> {
  const clerkConfigured = Boolean(readEnv('CLERK_SECRET_KEY'))

  // Sin Clerk: la app funciona como single-user. No hace falta opt-in.
  if (!clerkConfigured) {
    return { id: 'legacy-single-user' }
  }

  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim()

  if (token) {
    try {
      const payload = await getClerkClient().verifyToken(token)
      return { id: payload.sub }
    } catch {
      // Token inválido — caer al fallback si está habilitado
    }
  }

  // Clerk configurado pero sin token válido. ALLOW_LEGACY_FALLBACK permite
  // un cutover gradual durante el período de migración.
  if (readEnv('ALLOW_LEGACY_FALLBACK') === 'true') {
    return { id: 'legacy-single-user' }
  }

  throw new UnauthenticatedError()
}
