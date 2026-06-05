/**
 * Tokens y helpers COMPARTIDOS del editor de PDF (barra de herramientas, capa de
 * anotaciones y edición inline). Viven aparte para que los subcomponentes los
 * compartan sin crear ciclos de importación con `PdfTextEditor`.
 */
import { type TextAnnotation } from '../../../lib/pdfStudio/model'

/** Color de acento del editor (selección, contornos, swatches activos). */
export const ACCENT = 'var(--accent-primary)'

/** Estilo "activo" de la barra: edita la anotación seleccionada o, si no hay,
 *  define el estilo de la PRÓXIMA. Color/opacidad valen para texto y resaltado;
 *  fuente/tamaño/negrita/rotación son sólo de texto. */
export type TextStyle = Pick<
  TextAnnotation,
  'font' | 'sizeRatio' | 'bold' | 'color' | 'opacity' | 'rotation'
>

/** Acota `n` al rango `[lo, hi]`. */
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Botón cuadrado de control (−/+, flechas de página, deshacer/rehacer). */
export const stepBtn =
  'h-6 w-6 inline-flex items-center justify-center rounded text-ink-500 hover:text-ink-800 hover:bg-paper-50 disabled:opacity-30 transition-colors'

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
