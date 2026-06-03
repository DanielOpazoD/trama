/**
 * Tipos del editor de imágenes compartido (recortar · girar · texto).
 *
 * El modelo se guarda en coordenadas NORMALIZADAS (0..1) sobre el espacio
 * "post-rotación", así la edición es independiente de la resolución de origen
 * y la matemática (transforms.ts) queda pura y testeable.
 */

/** Fuente del texto: mapea a Inter / Spectral / Caveat. */
export type TextFont = 'sans' | 'serif' | 'cursive'

/** Tamaño del texto como fracción del lado menor de la imagen recortada. */
export type TextSize = 'S' | 'M' | 'L'

/** Color del texto (token semántico; se resuelve a hex al rasterizar). */
export type TextColor = 'ink' | 'paper' | 'accent'

export type TextLayer = {
  id: string
  text: string
  /** Ancla (esquina superior izquierda) normalizada en el espacio recortado. */
  xN: number
  yN: number
  font: TextFont
  size: TextSize
  bold: boolean
  color: TextColor
}

/** Rectángulo de recorte normalizado en el espacio post-rotación. */
export type CropRect = { xN: number; yN: number; wN: number; hN: number }

export type EditorModel = {
  /** Cuartos de vuelta horarios: 0, 1 (90°), 2 (180°), 3 (270°). */
  rotationQuarters: 0 | 1 | 2 | 3
  crop: CropRect
  textLayers: TextLayer[]
}

export type EditImageOptions = {
  /** Formato de salida; por defecto webp. Momentos pasa 'image/jpeg'. */
  outputType?: 'image/webp' | 'image/jpeg'
  /** Calidad 0..1 (el compresor re-encodea después; 0.92 por defecto). */
  quality?: number
  /** Texto de contexto para el encabezado del modal (p. ej. "foto 2 de 4"). */
  title?: string
}

/** Hex concretos de los 3 colores de texto, resueltos del tema al rasterizar. */
export type TextPalette = Record<TextColor, string>
