/**
 * Tokens y helpers COMPARTIDOS del editor de PDF (barra de herramientas, capa de
 * anotaciones y edición inline). Viven aparte para que los subcomponentes los
 * compartan sin crear ciclos de importación con `PdfTextEditor`.
 */
import { type TextAnnotation } from '../../../../lib/pdfStudio/model/model'

/** Color de acento del editor (selección, contornos, swatches activos) = salvia de
 *  la sección. Directo a `--accent-sage` (no vía `--accent-primary`) para no
 *  depender del remap de `.world-notas` cuando el modal se portalea a <body>. */
export const ACCENT = 'var(--accent-sage)'

/** Estilo "activo" de la barra: edita la anotación seleccionada o, si no hay,
 *  define el estilo de la PRÓXIMA. Color/opacidad valen para texto y resaltado;
 *  fuente/tamaño/negrita/rotación son sólo de texto. */
export type TextStyle = Pick<
  TextAnnotation,
  'font' | 'sizeRatio' | 'bold' | 'italic' | 'color' | 'opacity' | 'rotation'
>

/** Acota `n` al rango `[lo, hi]`. */
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Botón cuadrado de control (−/+, flechas de página, deshacer/rehacer). */
export const stepBtn =
  'h-6 w-6 inline-flex items-center justify-center rounded text-ink-500 hover:text-ink-800 hover:bg-paper-50 disabled:opacity-30 transition-colors focus-ring'

// Padding TRANSPARENTE alrededor del texto para agrandar el blanco clickeable (el
// bug "a veces no se selecciona"): el margen negativo lo compensa, así el texto NO
// se mueve respecto de la salida.
export const HIT_X = 6
export const HIT_Y = 4

/** Opacidad por defecto del resaltado (translúcido, como un marcador). */
export const HIGHLIGHT_OPACITY = 0.35

/** Herramientas del editor (modos). `rect/oval/line/arrow/x` son formas vectoriales;
 *  `x` es la marca de casillero (clic para activar/desactivar). */
export type Tool =
  | 'select'
  | 'highlight'
  | 'redact'
  | 'rect'
  | 'oval'
  | 'line'
  | 'arrow'
  | 'x'

/** ¿La herramienta activa es una forma (rect/oval/line/arrow/x)? */
export function isShapeTool(t: Tool): boolean {
  return t === 'rect' || t === 'oval' || t === 'line' || t === 'arrow' || t === 'x'
}

/** Grosor por defecto del trazo de las formas (fracción del alto de página). */
export const SHAPE_STROKE = 0.004

/** Grosor por defecto del trazo de la marca X (más grueso que una forma fina,
 *  para leerse como casillero marcado). El grosor es GLOBAL al documento. */
export const X_STROKE = 0.006
/** Rango y paso del control de grosor global de la X. */
export const X_STROKE_MIN = 0.002
export const X_STROKE_MAX = 0.014
export const X_STROKE_STEP = 0.002

/** Lado por defecto de una X (fracción del alto de página); cuadrada en píxeles.
 *  El tamaño es GLOBAL al documento (vive en `DocSettings.xMarkSize`). */
export const X_DEFAULT_SIDE = 0.02
/** Rango y paso del control de tamaño global de la X. */
export const X_SIZE_MIN = 0.008
export const X_SIZE_MAX = 0.06
export const X_SIZE_STEP = 0.004

/** `#rrggbb` + alfa → `rgba(...)`, para pintar el relleno translúcido del
 *  resaltado sin atenuar el contorno de selección (que `opacity` sí atenuaría). */
export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1]!, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
