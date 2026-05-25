/**
 * Retry con backoff exponencial. Reintenta en 5xx y 429 (transient).
 * Bail inmediato en 4xx (likely code/auth bug — retry no ayuda).
 */

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
    if (delays[attempt] > 0) await sleep(delays[attempt])
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
  if (lastError instanceof Error) throw lastError
  throw new Error('LLM fetch failed after retries')
}
