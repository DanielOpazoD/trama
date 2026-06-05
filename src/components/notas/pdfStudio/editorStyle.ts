/**
 * Tokens y helpers COMPARTIDOS del editor de PDF (barra de herramientas, capa de
 * anotaciones y edición inline). Viven aparte para que los subcomponentes los
 * compartan sin crear ciclos de importación con `PdfTextEditor`.
 */

/** Color de acento del editor (selección, contornos, swatches activos). */
export const ACCENT = 'var(--accent-primary)'

// Padding TRANSPARENTE alrededor del texto para agrandar el blanco clickeable (el
// bug "a veces no se selecciona"): el margen negativo lo compensa, así el texto NO
// se mueve respecto de la salida.
export const HIT_X = 6
export const HIT_Y = 4

/** Opacidad por defecto del resaltado (translúcido, como un marcador). */
export const HIGHLIGHT_OPACITY = 0.35

/** Herramientas del editor (modos). Crece con lápiz/formas/firma. */
export type Tool = 'select' | 'highlight'

/** `#rrggbb` + alfa → `rgba(...)`, para pintar el relleno translúcido del
 *  resaltado sin atenuar el contorno de selección (que `opacity` sí atenuaría). */
export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1]!, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
