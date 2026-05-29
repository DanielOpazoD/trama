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
import { verifyToken } from '@clerk/backend'

/** Lee una env var de forma segura tanto en Netlify runtime como en tests. */
function readEnv(key: string): string | undefined {
  try {
    return Netlify.env.get(key)
  } catch {
    return process.env[key]
  }
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
 * Tabla de decisión:
 *
 * | CLERK_SECRET_KEY | Bearer token | ALLOW_LEGACY_FALLBACK | Resultado                 |
 * |------------------|--------------|------------------------|---------------------------|
 * | sin configurar   | —            | —                      | legacy-single-user        |
 * | configurado      | válido       | —                      | userId real (de payload)  |
 * | configurado      | sin token    | true                   | legacy-single-user        |
 * | configurado      | sin token    | false/unset            | UnauthenticatedError → 401|
 * | configurado      | inválido     | true                   | legacy-single-user        |
 * | configurado      | inválido     | false/unset            | UnauthenticatedError → 401|
 *
 * El error se atrapa en `handler-wrap.ts` y se convierte en 401 con el
 * shape canónico de `ApiErrors.unauthenticated()`. El caller no necesita
 * try/catch — solo invocar al inicio del handler.
 *
 * @example
 *   export default withObservability(async (req, _ctx, { requestId }) => {
 *     const { id: userId } = await getAuthedUser(req)
 *     // ... usar userId en queries SQL: WHERE user_id = ${userId}
 *   })
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
      const payload = await verifyToken(token, {
        secretKey: readEnv('CLERK_SECRET_KEY') ?? '',
      })
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
