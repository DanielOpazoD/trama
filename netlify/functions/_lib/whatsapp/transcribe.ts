import type { CaptureIntent } from './types.js'

/**
 * Transcripción de una nota de voz → CaptureIntent. Puro y testeable: el
 * webhook hace la descarga + la llamada al LLM; acá solo convertimos el texto
 * transcrito en una Nota (la captura por defecto: una idea hablada es un
 * apunte). Si la transcripción quedó vacía, devuelve `null` y el caller cae a
 * su fallback (avisar que no se pudo transcribir).
 *
 * El tope evita que un audio largo desborde el límite de `notes.content`.
 */
const MAX_NOTE_LEN = 20000

export function transcriptionToIntent(text: string): CaptureIntent | null {
  const clean = text.trim()
  if (!clean) return null
  return { kind: 'note', content: clean.slice(0, MAX_NOTE_LEN) }
}
