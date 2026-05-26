/**
 * Autenticación vía Clerk — capa backend.
 *
 * Durante la transición, ALLOW_LEGACY_FALLBACK=true permite que los
 * endpoints funcionen como single-user sin token de Clerk. Quitar esta
 * variable cuando todos los endpoints tengan user_id filtering activado
 * y los usuarios reales estén creados en Clerk.
 */
import { createClerkClient } from '@clerk/backend'

// Lazy singleton — no se crea hasta la primera llamada a getAuthedUser.
// Esto evita que Netlify.env.get() se llame al momento de import del módulo,
// lo que rompería tests donde el global Netlify no existe.
let _clerkClient: ReturnType<typeof createClerkClient> | null = null
function getClerkClient() {
  if (!_clerkClient) {
    _clerkClient = createClerkClient({
      secretKey: Netlify.env.get('CLERK_SECRET_KEY') ?? '',
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
 * Con ALLOW_LEGACY_FALLBACK=true devuelve el usuario legacy en lugar
 * de rechazar — útil durante la transición antes de enforcement total.
 */
export async function getAuthedUser(request: Request): Promise<AuthedUser> {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim()

  if (token) {
    try {
      const payload = await getClerkClient().verifyToken(token)
      return { id: payload.sub }
    } catch {
      // Token inválido — caer al fallback si está habilitado
    }
  }

  if (Netlify.env.get('ALLOW_LEGACY_FALLBACK') === 'true') {
    return { id: 'legacy-single-user' }
  }

  throw new UnauthenticatedError()
}
