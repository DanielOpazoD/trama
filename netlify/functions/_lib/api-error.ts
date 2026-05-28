/**
 * FF1 — formato canónico de respuesta de error.
 *
 * Antes cada endpoint devolvía cualquier cosa: `new Response('text', { status: 400 })`,
 * `JSON.stringify({ error: '...' })`, `{ message: '...' }`, status 500 vacío…
 * El cliente terminaba parseando como podía y los errores eran difíciles de
 * distinguir.
 *
 * Ahora todos los endpoints devuelven la misma shape:
 *
 *   {
 *     "error": {
 *       "code": "VALIDATION",         // identificador estable (UPPER_SNAKE)
 *       "message": "Texto humano",    // qué pasó, en idioma del usuario
 *       "details": { ... },           // opcional — campos inválidos, sugerencias, etc.
 *       "requestId": "uuid-..."       // mismo id que el header x-request-id
 *     }
 *   }
 *
 * `code` es lo que el cliente switch-ea para decidir UI. `message` es lo que
 * muestra al usuario si no tiene UI específica. `details` lleva la carga
 * estructurada (sugerencias de duplicados, validation errors por campo, etc.).
 *
 * Códigos canónicos (extender con cuidado):
 *   - VALIDATION          (400) payload mal formado, campo faltante, tipo incorrecto
 *   - UNAUTHENTICATED     (401) request sin token de Clerk válido (y sin legacy fallback)
 *   - NOT_FOUND           (404) recurso inexistente
 *   - CONFLICT            (409) estado actual incompatible (duplicate, version mismatch)
 *   - METHOD_NOT_ALLOWED  (405) HTTP method no soportado por la ruta
 *   - RATE_LIMITED        (429) demasiadas requests / cost cap mensual alcanzado
 *   - AI_DISABLED         (423) modo IA off por el usuario
 *   - UPSTREAM            (502) provider externo falló (LLM, Spotify, etc.)
 *   - INTERNAL            (500) bug inesperado del servidor
 *
 * Si necesitás un código nuevo, agregalo acá con comentario describiéndolo.
 */

export type ApiErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'METHOD_NOT_ALLOWED'
  | 'RATE_LIMITED'
  | 'AI_DISABLED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'UPSTREAM'
  | 'INTERNAL'

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode
    message: string
    details?: unknown
    requestId: string
  }
}

/**
 * Construye una Response con el shape canónico. Usar SIEMPRE para errores —
 * nunca `new Response('texto', { status: 4xx })` directo.
 *
 * El `requestId` viene del contexto del handler (withObservability lo inyecta).
 * Si por alguna razón estás fuera del wrap, pasá uno vos via `crypto.randomUUID()`.
 */
export function apiError(opts: {
  status: number
  code: ApiErrorCode
  message: string
  requestId: string
  details?: unknown
}): Response {
  const body: ApiErrorBody = {
    error: {
      code: opts.code,
      message: opts.message,
      requestId: opts.requestId,
      ...(opts.details !== undefined ? { details: opts.details } : {}),
    },
  }
  return new Response(JSON.stringify(body), {
    status: opts.status,
    headers: {
      'Content-Type': 'application/json',
      'x-request-id': opts.requestId,
    },
  })
}

/**
 * Atajos para los códigos más comunes. Ahorran teclear `status` y `code`
 * en cada call site.
 */
export const ApiErrors = {
  validation: (requestId: string, message: string, details?: unknown) =>
    apiError({ status: 400, code: 'VALIDATION', message, requestId, details }),

  unauthenticated: (requestId: string, message = 'Authentication required') =>
    apiError({ status: 401, code: 'UNAUTHENTICATED', message, requestId }),

  notFound: (requestId: string, message: string, details?: unknown) =>
    apiError({ status: 404, code: 'NOT_FOUND', message, requestId, details }),

  conflict: (requestId: string, message: string, details?: unknown) =>
    apiError({ status: 409, code: 'CONFLICT', message, requestId, details }),

  methodNotAllowed: (requestId: string, message = 'Método no permitido') =>
    apiError({ status: 405, code: 'METHOD_NOT_ALLOWED', message, requestId }),

  rateLimited: (requestId: string, message: string, details?: unknown) =>
    apiError({ status: 429, code: 'RATE_LIMITED', message, requestId, details }),

  aiDisabled: (requestId: string, message = 'IA deshabilitada por el usuario') =>
    apiError({ status: 423, code: 'AI_DISABLED', message, requestId }),

  payloadTooLarge: (requestId: string, message: string, details?: unknown) =>
    apiError({ status: 413, code: 'PAYLOAD_TOO_LARGE', message, requestId, details }),

  unsupportedMediaType: (requestId: string, message: string, details?: unknown) =>
    apiError({
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message,
      requestId,
      details,
    }),

  upstream: (requestId: string, message: string, details?: unknown) =>
    apiError({ status: 502, code: 'UPSTREAM', message, requestId, details }),

  internal: (requestId: string, message: string, details?: unknown) =>
    apiError({ status: 500, code: 'INTERNAL', message, requestId, details }),
}
