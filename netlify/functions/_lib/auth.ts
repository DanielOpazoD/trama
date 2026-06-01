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
import { setCurrentRlsUser } from './user-rls'

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
    const user = { id: 'legacy-single-user' }
    setCurrentRlsUser(user.id)
    return user
  }

  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim()

  if (token) {
    try {
      const payload = await verifyToken(token, {
        secretKey: readEnv('CLERK_SECRET_KEY') ?? '',
      })
      // Owner alias: el dueño histórico de la app entró con Clerk. Toda la
      // data pre-Clerk vive bajo 'legacy-single-user' (incluidos los blobs,
      // que están namespaceados por ese id). En vez de reasignar 16 tablas
      // + mover archivos, mapeamos SU sub a ese dueño — así ve todo lo suyo
      // al instante. Los demás usuarios (futura familia) usan su sub real y
      // arrancan con su propio espacio. Se quita en la migración multi-user
      // definitiva, sobre las llaves de producción finales.
      const ownerSub = readEnv('LEGACY_OWNER_CLERK_ID')
      if (ownerSub && payload.sub === ownerSub) {
        const user = { id: 'legacy-single-user' }
        setCurrentRlsUser(user.id)
        return user
      }
      const user = { id: payload.sub }
      setCurrentRlsUser(user.id)
      return user
    } catch {
      // Token inválido — caer al fallback si está habilitado
    }
  }

  // Clerk configurado pero sin token válido. ALLOW_LEGACY_FALLBACK permite
  // un cutover gradual durante el período de migración.
  if (readEnv('ALLOW_LEGACY_FALLBACK') === 'true') {
    const user = { id: 'legacy-single-user' }
    setCurrentRlsUser(user.id)
    return user
  }

  throw new UnauthenticatedError()
}
