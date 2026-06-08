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

export type ImageStampBox = {
  xRatio: number
  yRatio: number
  wRatio: number
  hRatio: number
}

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se'

export type RatioBox = {
  xRatio: number
  yRatio: number
  wRatio: number
  hRatio: number
}

export function resizeRatioBox(
  box: RatioBox,
  handle: ResizeHandle,
  dxRatio: number,
  dyRatio: number,
  options: { minW?: number; minH?: number } = {},
): RatioBox {
  const minW = options.minW ?? 0.02
  const minH = options.minH ?? 0.02
  const right = box.xRatio + box.wRatio
  const bottom = box.yRatio + box.hRatio

  let x = box.xRatio
  let y = box.yRatio
  let w = box.wRatio
  let h = box.hRatio

  if (handle.includes('e')) w = Math.min(1 - x, Math.max(minW, w + dxRatio))
  if (handle.includes('s')) h = Math.min(1 - y, Math.max(minH, h + dyRatio))
  if (handle.includes('w')) {
    const nextX = Math.min(right - minW, Math.max(0, x + dxRatio))
    x = nextX
    w = right - nextX
  }
  if (handle.includes('n')) {
    const nextY = Math.min(bottom - minH, Math.max(0, y + dyRatio))
    y = nextY
    h = bottom - nextY
  }

  return { xRatio: x, yRatio: y, wRatio: w, hRatio: h }
}

/**
 * Caja inicial para una firma/sello/logo: centrada, ancho cómodo y alto calculado
 * para conservar el aspecto real de la imagen en ratios de página. Se acota para
 * que casos extremos no creen una anotación microscópica o inmanejable.
 */
export function fitImageStampBox({
  pageW,
  pageH,
  imageW,
  imageH,
}: {
  pageW: number
  pageH: number
  imageW: number
  imageH: number
}): ImageStampBox {
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
  const wRatio = 0.28
  const pageAspect = Math.max(1, pageW) / Math.max(1, pageH)
  const imageAspect = Math.max(1, imageW) / Math.max(1, imageH)
  const hRatio = clamp((wRatio * pageAspect) / imageAspect, 0.06, 0.32)
  return {
    xRatio: clamp((1 - wRatio) / 2, 0, 1),
    yRatio: clamp((1 - hRatio) / 2, 0, 1),
    wRatio,
    hRatio,
  }
}
