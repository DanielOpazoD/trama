/**
 * OCR de UNA página del editor → items de texto con caja en RATIOS top-down,
 * el mismo formato de la capa de texto vectorial (`PageTextItemRatio`). Es lo
 * que permite etiquetar casilleros sugeridos también en ESCANEOS y fotos:
 * los formularios clínicos reales rara vez traen capa de texto.
 *
 * Usa palabras (no líneas) para que el etiquetado una las contiguas y no se
 * traguen media página: "Nombre:" y "Fecha:" en la misma línea impresa deben
 * quedar como items separados. tesseract.js corre en su propio worker, así
 * que el hilo de la UI no se bloquea. Browser-only (canvas + import dinámico).
 */
import type { PageTextItemRatio } from '../render/pdfRender'
import type { PdfOcrLanguage } from './pdfOcrTypes'

const MIN_WORD_CONFIDENCE = 55
const MAX_OCR_WIDTH = 2400

export type TesseractWordData = {
  blocks?: Array<{
    paragraphs?: Array<{
      lines?: Array<{
        words?: Array<{
          text?: string
          confidence?: number
          bbox?: { x0: number; y0: number; x1: number; y1: number }
        }>
      }>
    }>
  }> | null
}

export function ocrWordsToTextItems(
  data: TesseractWordData,
  width: number,
  height: number,
): PageTextItemRatio[] {
  const words =
    data.blocks
      ?.flatMap((block) => block.paragraphs ?? [])
      .flatMap((paragraph) => paragraph.lines ?? [])
      .flatMap((line) => line.words ?? []) ?? []
  const items: PageTextItemRatio[] = []
  for (const word of words) {
    const text = word.text?.trim()
    if (!text || !word.bbox) continue
    if ((word.confidence ?? 0) < MIN_WORD_CONFIDENCE) continue
    items.push({
      text,
      xRatio: word.bbox.x0 / Math.max(1, width),
      yRatio: word.bbox.y0 / Math.max(1, height),
      wRatio: (word.bbox.x1 - word.bbox.x0) / Math.max(1, width),
      hRatio: (word.bbox.y1 - word.bbox.y0) / Math.max(1, height),
    })
  }
  return items
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('No se pudo leer la página para el OCR'))
    image.src = src
  })
}

/** Reconoce el texto de un canvas ya renderizado (p. ej. la página del PDF a
 *  alta resolución) y devuelve sus palabras como cajas en ratios. */
export async function recognizeCanvasTextItems(
  canvas: HTMLCanvasElement,
  language: PdfOcrLanguage = 'spa',
): Promise<PageTextItemRatio[]> {
  const tesseract = await import('tesseract.js')
  const worker = await tesseract.createWorker(language)
  try {
    const result = await worker.recognize(canvas, {}, { blocks: true })
    return ocrWordsToTextItems(
      result.data as TesseractWordData,
      canvas.width,
      canvas.height,
    )
  } finally {
    await worker.terminate()
  }
}

/** Reconoce el texto de la imagen de una página (páginas-imagen del editor).
 *  Lanza si el OCR no puede correr (el caller degrada). */
export async function recognizeImageTextItems(
  src: string,
  language: PdfOcrLanguage = 'spa',
): Promise<PageTextItemRatio[]> {
  const image = await loadImage(src)
  const scale = Math.min(1, MAX_OCR_WIDTH / Math.max(1, image.naturalWidth))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return []
  ctx.drawImage(image, 0, 0, width, height)
  return recognizeCanvasTextItems(canvas, language)
}
