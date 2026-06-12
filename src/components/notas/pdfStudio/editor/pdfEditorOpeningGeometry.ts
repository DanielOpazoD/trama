import { findMostVisiblePdfEditorPage } from './pdfEditorZoomScroll'

/**
 * Geometría de la APERTURA del editor PDF como transición controlada.
 *
 * Las hojas llegan tarde: cada página nace como placeholder (~72vh) y se
 * infla a su altura real cuando termina el render async del PDF — y esa
 * altura real depende del zoom. Estos helpers son puros (DOM in, efecto
 * medible out) para poder testear la matriz apertura×zoom sin montar el
 * editor entero.
 */

export type PdfEditorPlacement = {
  /** La hoja real existe, quedó centrada y es la más visible. */
  placed: boolean
  /** Existe el data-pdf-editor-sheet (el render de fondo ya resolvió). */
  sheetReady: boolean
}

/**
 * Centra la página pedida en el viewport. Usa la hoja real si existe; si
 * todavía es placeholder usa la sección (mejor esfuerzo, no cuenta como
 * colocada). Devuelve si el destino quedó efectivamente colocado.
 */
export function placePdfEditorPage(
  container: HTMLElement | null,
  pageIndex: number,
): PdfEditorPlacement {
  if (!container) return { placed: false, sheetReady: false }
  const sheet = container.querySelector<HTMLElement>(
    `[data-pdf-editor-sheet="${pageIndex}"]`,
  )
  const shell = container.querySelector<HTMLElement>(
    `[data-pdf-editor-page="${pageIndex}"]`,
  )
  const target = sheet ?? shell
  if (!target) return { placed: false, sheetReady: false }
  const containerRect = container.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  if (targetRect.height <= 1 || containerRect.height <= 1) {
    return { placed: false, sheetReady: false }
  }
  container.scrollTop =
    container.scrollTop +
    targetRect.top -
    containerRect.top -
    Math.max(0, (container.clientHeight - targetRect.height) / 2)
  const sheetReady = sheet != null
  return {
    placed: sheetReady && findMostVisiblePdfEditorPage(container) === pageIndex,
    sheetReady,
  }
}

/**
 * Firma de la geometría de las secciones HASTA la página pedida (top + alto +
 * si su hoja real ya existe). Solo esas determinan el offset del destino: lo
 * que se infle después/abajo no lo mueve. Dos firmas iguales en chequeos
 * consecutivos = el layout dejó de moverse y la colocación es confiable.
 */
export function pdfEditorGeometrySignature(
  container: HTMLElement | null,
  pageIndex: number,
): string | null {
  if (!container) return null
  const containerRect = container.getBoundingClientRect()
  const parts: string[] = []
  for (const section of container.querySelectorAll<HTMLElement>(
    '[data-pdf-editor-page]',
  )) {
    const index = Number(section.dataset.pdfEditorPage ?? -1)
    if (index > pageIndex) continue
    const rect = section.getBoundingClientRect()
    // Coordenadas de contenido (independientes del scroll actual).
    const top = Math.round(rect.top - containerRect.top + container.scrollTop)
    const hasSheet =
      section.hasAttribute('data-pdf-editor-sheet') ||
      section.querySelector('[data-pdf-editor-sheet]') != null
    parts.push(`${index}:${top}:${Math.round(rect.height)}:${hasSheet ? 's' : 'p'}`)
  }
  return parts.join('|')
}

export type PdfEditorHeightBaseline = {
  zoom: number
  tops: number[]
  heights: number[]
}

/** Foto de alturas de TODAS las secciones, en coordenadas de contenido. */
export function capturePdfEditorHeightBaseline(
  container: HTMLElement | null,
  zoom: number,
): PdfEditorHeightBaseline | null {
  if (!container) return null
  const containerRect = container.getBoundingClientRect()
  const tops: number[] = []
  const heights: number[] = []
  for (const section of container.querySelectorAll<HTMLElement>(
    '[data-pdf-editor-page]',
  )) {
    const rect = section.getBoundingClientRect()
    tops.push(rect.top - containerRect.top + container.scrollTop)
    heights.push(rect.height)
  }
  return { zoom, tops, heights }
}

/**
 * Anclaje de scroll MANUAL (el contenedor usa [overflow-anchor:none]): si una
 * sección completamente por ENCIMA del viewport cambió de alto desde la última
 * foto (render lento que llegó tarde), compensa el scrollTop por el delta para
 * que lo visible no se corra. Un cambio de zoom re-dimensiona todo a la vez:
 * en ese caso solo re-fotografía (la restauración de anclas de zoom ya se
 * encarga de reposicionar) y no toca el scroll.
 */
export function compensatePdfEditorInflation(
  container: HTMLElement | null,
  baseline: PdfEditorHeightBaseline | null,
  zoom: number,
): PdfEditorHeightBaseline | null {
  const next = capturePdfEditorHeightBaseline(container, zoom)
  if (!container || !next) return next
  if (
    !baseline ||
    baseline.zoom !== zoom ||
    baseline.heights.length !== next.heights.length
  ) {
    return next
  }
  let delta = 0
  for (let i = 0; i < next.heights.length; i += 1) {
    const wasTop = baseline.tops[i] ?? 0
    const wasHeight = baseline.heights[i] ?? 0
    const wasFullyAbove = wasTop + wasHeight <= container.scrollTop + 1
    if (wasFullyAbove) delta += (next.heights[i] ?? 0) - wasHeight
  }
  if (Math.abs(delta) > 1) container.scrollTop += delta
  return next
}
