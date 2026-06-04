/**
 * Geometría PURA del editor de PDF (sin DOM): la matemática más propensa a bugs
 * del modal —transformar el delta de pantalla al frame de la página según la
 * rotación, armar el rectángulo de un arrastre, y encajar la página en el área—.
 * Vive aparte de `PdfTextEditor.tsx` (browser-only) para poder TESTEARLA.
 */

/**
 * Convierte un delta de PANTALLA (px) al frame NATIVO de la página, deshaciendo la
 * rotación CSS de la página (`rotate(rot·90deg)`). `rot` en cuartos 0..3.
 *
 * La página se muestra rotada `rot·90°`; al arrastrar/dibujar movemos en pantalla
 * pero las anotaciones viven en coordenadas nativas (sin rotar), así que hay que
 * aplicar la rotación INVERSA al delta.
 */
export function screenDeltaToPage(
  sdx: number,
  sdy: number,
  rot: number,
): { dx: number; dy: number } {
  const r = ((rot % 4) + 4) % 4
  if (r === 1) return { dx: sdy, dy: -sdx }
  if (r === 2) return { dx: -sdx, dy: -sdy }
  if (r === 3) return { dx: -sdy, dy: sdx }
  return { dx: sdx, dy: sdy }
}

/** Rectángulo normalizado (esquina sup-izq + tamaño) a partir de dos puntos. */
export function rectFromPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  }
}

export type PageLayout = {
  /** Rotación en cuartos normalizada 0..3. */
  rot: number
  /** Caja EXTERIOR = bounding box ya rotado (lo que ocupa en pantalla, sin zoom). */
  outerW: number
  outerH: number
  /** Caja INTERIOR = página nativa (sin rotar) que se rota dentro de la exterior. */
  innerW: number
  innerH: number
}

/**
 * Encaja una página de `bgW×bgH` (px nativos del render) dentro de un área de
 * `areaW×areaH`, en su orientación FINAL (rotada `rotQuarters`), manteniendo el
 * aspecto y dejando un margen. La caja EXTERIOR es el bounding box rotado; la
 * INTERIOR es la página nativa (en 90°/270° se intercambian ancho/alto). El zoom
 * se aplica APARTE (multiplicando), no acá.
 */
export function fitPageLayout(
  bgW: number,
  bgH: number,
  areaW: number,
  areaH: number,
  rotQuarters: number,
): PageLayout {
  const rot = ((rotQuarters % 4) + 4) % 4
  const swap = rot % 2 === 1
  const maxW = Math.max(80, areaW - 32)
  const maxH = Math.max(80, areaH - 32)
  // Aspecto (alto/ancho) de la página YA rotada.
  const finalAspect = swap ? bgW / bgH : bgH / bgW
  let outerW = maxW
  let outerH = outerW * finalAspect
  if (outerH > maxH) {
    outerH = maxH
    outerW = outerH / finalAspect
  }
  const innerW = swap ? outerH : outerW
  const innerH = swap ? outerW : outerH
  return { rot, outerW, outerH, innerW, innerH }
}
