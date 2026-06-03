/**
 * Matemática pura del editor de imágenes: rotación de dimensiones, mapeo del
 * recorte normalizado a píxeles de origen, arrastre/resize del rectángulo de
 * recorte, y posición/tamaño del texto. Sin DOM, sin React, sin canvas → 100%
 * testeable en node. El componente solo alimenta deltas y dibuja; toda la
 * geometría vive acá.
 */
import type {
  CropRect,
  EditorModel,
  TextColor,
  TextFont,
  TextLayer,
  TextPalette,
} from './types'

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** Tamaño del texto como fracción del lado menor de la imagen recortada. */
const SIZE_FRACTION: Record<TextLayer['size'], number> = { S: 0.04, M: 0.07, L: 0.11 }

/** Stacks de fuente (mismos para preview en CSS y para canvas). */
const FONT_STACK: Record<TextFont, string> = {
  sans: "'Inter', system-ui, sans-serif",
  serif: "'Spectral', Georgia, serif",
  cursive: "'Caveat', cursive",
}

/** Modelo identidad: sin rotación, recorte completo, sin texto. */
export function defaultModel(): EditorModel {
  return { rotationQuarters: 0, crop: { xN: 0, yN: 0, wN: 1, hN: 1 }, textLayers: [] }
}

/** ¿El modelo no introduce ningún cambio? (para no re-encodear de gusto). */
export function isIdentityModel(model: EditorModel): boolean {
  const c = model.crop
  return (
    model.rotationQuarters === 0 &&
    model.textLayers.length === 0 &&
    c.xN === 0 &&
    c.yN === 0 &&
    c.wN === 1 &&
    c.hN === 1
  )
}

/** Dimensiones tras rotar `quarters` cuartos de vuelta (impares intercambian). */
export function rotatedDimensions(
  w: number,
  h: number,
  quarters: number,
): { width: number; height: number } {
  return ((quarters % 4) + 4) % 4 === 1 || ((quarters % 4) + 4) % 4 === 3
    ? { width: h, height: w }
    : { width: w, height: h }
}

/** Recorte normalizado → píxeles enteros de origen (en espacio post-rotación). */
export function cropRectToSourcePx(
  crop: CropRect,
  rotatedW: number,
  rotatedH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const sw = clamp(Math.round(crop.wN * rotatedW), 1, rotatedW)
  const sh = clamp(Math.round(crop.hN * rotatedH), 1, rotatedH)
  const sx = clamp(Math.round(crop.xN * rotatedW), 0, rotatedW - sw)
  const sy = clamp(Math.round(crop.yN * rotatedH), 0, rotatedH - sh)
  return { sx, sy, sw, sh }
}

/** Punto en píxeles dentro de la caja en pantalla → coords normalizadas 0..1. */
export function displayToNorm(
  localX: number,
  localY: number,
  boxW: number,
  boxH: number,
): { xN: number; yN: number } {
  return {
    xN: boxW > 0 ? clamp(localX / boxW, 0, 1) : 0,
    yN: boxH > 0 ? clamp(localY / boxH, 0, 1) : 0,
  }
}

/** Asegura un recorte válido: dentro de [0,1] y con tamaño mínimo. */
export function clampCrop(crop: CropRect, minWN = 0.05, minHN = 0.05): CropRect {
  const wN = clamp(crop.wN, minWN, 1)
  const hN = clamp(crop.hN, minHN, 1)
  const xN = clamp(crop.xN, 0, 1 - wN)
  const yN = clamp(crop.yN, 0, 1 - hN)
  return { xN, yN, wN, hN }
}

/** Traslada el recorte (arrastre del cuerpo), manteniéndolo dentro de [0,1]. */
export function moveCrop(crop: CropRect, dxN: number, dyN: number): CropRect {
  return {
    ...crop,
    xN: clamp(crop.xN + dxN, 0, 1 - crop.wN),
    yN: clamp(crop.yN + dyN, 0, 1 - crop.hN),
  }
}

export type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/** Aplica el arrastre de un handle (uno o dos bordes) y devuelve el rect. */
export function resizeCrop(
  crop: CropRect,
  handle: CropHandle,
  dxN: number,
  dyN: number,
  minWN = 0.05,
  minHN = 0.05,
): CropRect {
  let left = crop.xN
  let top = crop.yN
  let right = crop.xN + crop.wN
  let bottom = crop.yN + crop.hN
  if (handle.includes('w')) left = clamp(left + dxN, 0, right - minWN)
  if (handle.includes('e')) right = clamp(right + dxN, left + minWN, 1)
  if (handle.includes('n')) top = clamp(top + dyN, 0, bottom - minHN)
  if (handle.includes('s')) bottom = clamp(bottom + dyN, top + minHN, 1)
  return { xN: left, yN: top, wN: right - left, hN: bottom - top }
}

/** Posición y tamaño en px de un texto sobre el canvas final recortado. */
export function textPx(
  layer: Pick<TextLayer, 'xN' | 'yN' | 'size'>,
  croppedW: number,
  croppedH: number,
): { x: number; y: number; fontPx: number } {
  return {
    x: layer.xN * croppedW,
    y: layer.yN * croppedH,
    fontPx: SIZE_FRACTION[layer.size] * Math.min(croppedW, croppedH),
  }
}

export function fontFamilyFor(font: TextFont): string {
  return FONT_STACK[font]
}

export function fontWeightFor(bold: boolean): number {
  return bold ? 700 : 400
}

export function colorHexFor(token: TextColor, palette: TextPalette): string {
  return palette[token]
}
