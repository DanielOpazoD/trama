/**
 * `fetch` con tope de tiempo (AbortController), compartido por las llamadas a la
 * API de Twilio: bajar media entrante (media.ts) y enviar mensajes salientes con
 * botones (send.ts). Sin esto, una respuesta lenta de Twilio podría colgar el
 * webhook (que tiene latencia acotada en serverless).
 */

/** Tope por defecto para las llamadas a Twilio (subida/bajada de media + envío). */
export const TWILIO_FETCH_TIMEOUT_MS = 15000

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = TWILIO_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}
