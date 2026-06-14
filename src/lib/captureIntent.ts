/**
 * Captura unificada — detección de intención del composer de Notas.
 *
 * El composer de la sección «Notas» acepta tres tipos de captura sin que el
 * usuario tenga que elegir un modo: texto plano → nota, un enlace pegado →
 * recorte web, una imagen pegada/soltada → recorte de imagen. Este módulo
 * resuelve SOLO la heurística texto-vs-enlace (la imagen llega como `File`,
 * no necesita heurística). Es puro para poder testearlo sin DOM.
 */

export type CaptureIntent = 'note' | 'link'

/** Una sola URL http(s), sin espacios alrededor ni texto extra. */
const SINGLE_URL_RE = /^https?:\/\/[^\s]+$/i

/**
 * Decide si el borrador es una nota o un enlace. Solo lo tratamos como enlace
 * cuando TODO el texto es una única URL — si hay prosa alrededor del link es
 * una nota que menciona una fuente, no una captura de enlace.
 */
export function detectCaptureIntent(text: string): CaptureIntent {
  return SINGLE_URL_RE.test(text.trim()) ? 'link' : 'note'
}

/** Devuelve la URL si el borrador es exactamente un enlace; si no, null. */
export function extractUrl(text: string): string | null {
  const trimmed = text.trim()
  return SINGLE_URL_RE.test(trimmed) ? trimmed : null
}

/** Host legible de una URL para usar como título tentativo del recorte. */
export function hostLabel(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}
