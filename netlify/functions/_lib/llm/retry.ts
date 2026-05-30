/**
 * Retry con backoff exponencial. Reintenta en 5xx y 429 (transient).
 * Bail inmediato en 4xx (likely code/auth bug — retry no ayuda).
 */

/**
 * Falla transitoria de un provider LLM: 5xx/429 tras agotar reintentos, o
 * error de red (provider inalcanzable / timeout). El despachador usa este
 * tipo para decidir si vale la pena caer a OTRO provider (fallback). Los 4xx
 * (auth/bad-request) NO se envuelven acá — son permanentes y el caller los
 * propaga tal cual (caer a otro provider no los arregla y enmascararía bugs).
 */
export class LLMTransientError extends Error {
  override readonly cause?: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'LLMTransientError'
    this.cause = cause
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type FetchAttempt = () => Promise<Response>

/**
 * Backoff: 0, 1s, 4s. Cap por defecto 2 retries (3 intentos totales).
 */
export async function fetchWithRetry(
  makeRequest: FetchAttempt,
  retries = 2,
): Promise<Response> {
  const delays = [0, 1000, 4000]
  let lastError: unknown = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    const delay = delays[attempt] ?? 0
    if (delay > 0) await sleep(delay)
    try {
      const response = await makeRequest()
      if (response.ok) return response
      if (response.status >= 500 || response.status === 429) {
        lastError = new Error(`HTTP ${response.status}`)
        continue
      }
      return response // 4xx — caller formatea el error
    } catch (err) {
      lastError = err
      // Network error — keep trying.
    }
  }
  // Reintentos agotados sobre una causa transitoria (5xx/429/red): la
  // marcamos como tal para que el despachador pueda caer a otro provider.
  const message =
    lastError instanceof Error ? lastError.message : 'LLM fetch failed after retries'
  throw new LLMTransientError(message, lastError)
}
