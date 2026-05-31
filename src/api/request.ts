/**
 * Infraestructura compartida del cliente API: `request<T>()` con manejo
 * estandarizado de errores HTTP, header `X-AI-Mode` leído de localStorage,
 * y `DuplicateEntityError` para el caso especial de 409 en /api/entities.
 *
 * Antes vivía inline en src/api.ts (1247 LOC). Extraído en BB2 para que
 * cada módulo de dominio importe solo esto.
 *
 * FF1 — parsea el shape canónico `ApiError` del servidor:
 *   { error: { code, message, details?, requestId } }
 * Y surface el `requestId` en cada `ApiClientError` para que reportes de
 * usuario sean trazables al `error_log` del servidor.
 */

import { isDemoMode, demoRequest } from '../lib/demo'

/**
 * Read the current AI mode synchronously and convert to its header form.
 * Kept inline (no import of useAIMode) so this module stays React-free.
 */
export function aiModeHeader(): string {
  if (typeof window === 'undefined') return 'auto'
  const raw = window.localStorage.getItem('trama.aiMode') ?? 'auto'
  if (raw === 'off' || raw === 'auto') return raw
  if (raw.startsWith('forced-')) {
    const provider = raw.slice('forced-'.length)
    // Modelo forzado opcional (trama.aiModel). '' = default del provider.
    const model = (window.localStorage.getItem('trama.aiModel') ?? '').trim()
    return model ? `forced:${provider}:${model}` : `forced:${provider}`
  }
  return 'auto'
}

/**
 * Códigos canónicos que el servidor puede devolver. Espejo de
 * `netlify/functions/_lib/api-error.ts`. Si agregás uno allá, agregalo acá.
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

/**
 * Error tirado por `request()` cuando el servidor responde con non-2xx
 * y el body matchea el shape canónico. Carga el code para switch-ear UI,
 * el message para mostrar al usuario, y el requestId para troubleshooting.
 */
export class ApiClientError extends Error {
  code: ApiErrorCode | 'UNKNOWN'
  status: number
  details: unknown
  requestId: string | null
  constructor(opts: {
    code: ApiErrorCode | 'UNKNOWN'
    status: number
    message: string
    details?: unknown
    requestId: string | null
  }) {
    super(opts.message)
    this.name = 'ApiClientError'
    this.code = opts.code
    this.status = opts.status
    this.details = opts.details
    this.requestId = opts.requestId
  }
}

/**
 * Thrown when /api/entities POST refuses with HTTP 409 because the new entity
 * looks like a near-duplicate of an existing one. Carries the candidates the
 * UI can present ("did you mean…?").
 */
export class DuplicateEntityError extends Error {
  suggestions: Array<{
    id: string
    name: string
    type: string
    description: string | null
    similarity: number
  }>
  constructor(suggestions: DuplicateEntityError['suggestions']) {
    super('Posible entidad duplicada')
    this.name = 'DuplicateEntityError'
    this.suggestions = suggestions
  }
}

type CanonicalErrorBody = {
  error?: {
    code?: string
    message?: string
    details?: unknown
    requestId?: string
  }
}

/**
 * Parsea el body de un response non-2xx y devuelve un error tipado.
 * Maneja tres formatos:
 *   1. ApiError canónico — `{ error: { code, message, requestId, details? } }`
 *   2. Legacy `{ error: 'string', ... }` (algunos endpoints viejos)
 *   3. Text plano — usamos el texto como message, code = UNKNOWN
 */
async function parseErrorResponse(
  response: Response,
  url: string,
  method: string,
): Promise<ApiClientError | DuplicateEntityError> {
  const text = await response.text().catch(() => '')
  const requestId = response.headers.get('x-request-id')

  // Caso especial preservado: dup detection en /api/entities 409.
  // Estos endpoints todavía devuelven `{ error: 'possible_duplicate', suggestions }`.
  if (response.status === 409 && url.startsWith('/api/entities')) {
    try {
      const body = JSON.parse(text) as {
        error?: string
        suggestions?: DuplicateEntityError['suggestions']
      }
      if (body.error === 'possible_duplicate' && Array.isArray(body.suggestions)) {
        return new DuplicateEntityError(body.suggestions)
      }
    } catch {
      /* fall through */
    }
  }

  // Intento parsear como ApiError canónico.
  try {
    const parsed = JSON.parse(text) as CanonicalErrorBody
    if (parsed.error && typeof parsed.error === 'object') {
      const code = (parsed.error.code as ApiErrorCode | undefined) ?? 'UNKNOWN'
      const message = parsed.error.message ?? `${method} ${url} → ${response.status}`
      return new ApiClientError({
        code,
        status: response.status,
        message,
        details: parsed.error.details,
        requestId: parsed.error.requestId ?? requestId,
      })
    }
  } catch {
    /* not JSON, fall through */
  }

  // Fallback: text plano o JSON con shape desconocido.
  return new ApiClientError({
    code: 'UNKNOWN',
    status: response.status,
    message: text || `${method} ${url} → ${response.status}`,
    requestId,
  })
}

/**
 * El token de sesión entra por `setApiAuthTokenProvider()`, montado desde
 * `ApiAuthBridge` con `useAuth()` de Clerk. El fallback a `window.__clerk`
 * queda solo para compatibilidad durante la transición.
 */
type ClerkWindow = {
  __clerk?: {
    session?: {
      getToken: () => Promise<string | null>
    }
  }
}

export type ApiAuthTokenProvider = () => Promise<string | null>

let apiAuthTokenProvider: ApiAuthTokenProvider | null = null

export function setApiAuthTokenProvider(
  provider: ApiAuthTokenProvider | null,
): () => void {
  apiAuthTokenProvider = provider
  return () => {
    if (apiAuthTokenProvider === provider) apiAuthTokenProvider = null
  }
}

async function getAuthHeader(): Promise<HeadersInit> {
  const token = await apiAuthTokenProvider?.()
  if (token) return { Authorization: `Bearer ${token}` }

  if (typeof window === 'undefined') return {}
  const clerk = (window as unknown as ClerkWindow).__clerk
  if (clerk?.session) {
    const legacyToken = await clerk.session.getToken()
    if (legacyToken) return { Authorization: `Bearer ${legacyToken}` }
  }
  return {}
}

export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const authHeader = await getAuthHeader()
  const isFormDataBody = typeof FormData !== 'undefined' && init?.body instanceof FormData
  return fetch(url, {
    ...init,
    headers: {
      'X-AI-Mode': aiModeHeader(),
      ...(isFormDataBody ? {} : { 'Content-Type': 'application/json' }),
      ...authHeader,
      ...init?.headers,
    },
  })
}

export async function request<T = any>(url: string, init?: RequestInit): Promise<T> {
  // Modo prueba: servimos desde el store local en vez de pegar a /api/*.
  if (isDemoMode()) return demoRequest<T>(url, init)
  const response = await apiFetch(url, init)
  if (!response.ok) {
    throw await parseErrorResponse(response, url, init?.method ?? 'GET')
  }
  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}
