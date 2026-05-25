/**
 * Infraestructura compartida del cliente API: `request<T>()` con manejo
 * estandarizado de errores HTTP, header `X-AI-Mode` leído de localStorage,
 * y `DuplicateEntityError` para el caso especial de 409 en /api/entities.
 *
 * Antes vivía inline en src/api.ts (1247 LOC). Extraído en BB2 para que
 * cada módulo de dominio importe solo esto.
 */

/**
 * Read the current AI mode synchronously and convert to its header form.
 * Kept inline (no import of useAIMode) so this module stays React-free.
 */
export function aiModeHeader(): string {
  if (typeof window === 'undefined') return 'auto'
  const raw = window.localStorage.getItem('trama.aiMode') ?? 'auto'
  if (raw === 'off' || raw === 'auto') return raw
  if (raw.startsWith('forced-')) return `forced:${raw.slice('forced-'.length)}`
  return 'auto'
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

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-AI-Mode': aiModeHeader(),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    // 423 = AI is disabled by the user. Surface the server's message verbatim
    // so the UI can show something meaningful instead of "HTTP 423".
    if (response.status === 423) {
      throw new Error(text || 'IA deshabilitada por el usuario (modo Off).')
    }
    // 409 on /api/entities → dup detection. Parse and throw a typed error.
    if (response.status === 409 && url.startsWith('/api/entities')) {
      try {
        const body = JSON.parse(text) as {
          error?: string
          suggestions?: DuplicateEntityError['suggestions']
        }
        if (body.error === 'possible_duplicate' && Array.isArray(body.suggestions)) {
          throw new DuplicateEntityError(body.suggestions)
        }
      } catch (parseErr) {
        if (parseErr instanceof DuplicateEntityError) throw parseErr
        // fall through to generic error if body wasn't the expected shape
      }
    }
    throw new Error(`${init?.method ?? 'GET'} ${url} → ${response.status} ${text}`.trim())
  }
  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}
