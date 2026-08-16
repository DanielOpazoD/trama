import { ocrCanvasToJpegBlob } from './pdfOcrCanvas'
import { isPdfOcrInput } from './pdfOcrInput'
import type { OcrPage, PdfOcrPageText } from './pdfOcrTypes'
import { loadPdfLib } from '../pdfRuntime/pdfLibLoader'

const INVISIBLE_TEXT_OPACITY = 0.01

function sidecarPageHeader(pageNumber: number): string {
  return `[Pagina ${pageNumber}]`
}

export function buildOcrSidecarText(pages: PdfOcrPageText[]): string {
  return pages
    .map((page) => `${sidecarPageHeader(page.pageNumber)}\n${page.text.trim()}`)
    .join('\n\n')
    .concat(pages.length > 0 ? '\n' : '')
}

function drawInvisibleOcrText({
  font,
  page,
  rgb,
  ocrPage,
}: {
  font: { widthOfTextAtSize: (text: string, size: number) => number }
  page: {
    drawText: (text: string, options: Record<string, unknown>) => void
    getWidth?: () => number
    getHeight?: () => number
  }
  rgb: (r: number, g: number, b: number) => unknown
  ocrPage: OcrPage
}) {
  const pageWidth = page.getWidth?.() ?? ocrPage.width
  const pageHeight = page.getHeight?.() ?? ocrPage.height
  for (const line of ocrPage.lines) {
    const text = line.text.trim()
    if (!text) continue
    const x = (line.bbox.x0 / ocrPage.renderWidth) * pageWidth
    const y = pageHeight - (line.bbox.y1 / ocrPage.renderHeight) * pageHeight
    const maxWidth = Math.max(
      1,
      ((line.bbox.x1 - line.bbox.x0) / ocrPage.renderWidth) * pageWidth,
    )
    const rawSize =
      ((line.bbox.y1 - line.bbox.y0) / ocrPage.renderHeight) * pageHeight * 0.8
    const size = Math.max(4, Math.min(48, rawSize))
    page.drawText(text, {
      x,
      y,
      size,
      font,
      color: rgb(0, 0, 0),
      opacity: INVISIBLE_TEXT_OPACITY,
      maxWidth: Math.max(maxWidth, font.widthOfTextAtSize(text, size)),
    })
  }
}

export async function assembleSearchablePdf(file: File, pages: OcrPage[]): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await loadPdfLib()
  const out = await PDFDocument.create()
  const font = await out.embedFont(StandardFonts.Helvetica)

  if (isPdfOcrInput(file)) {
    const source = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), {
      ignoreEncryption: true,
    })
    // Un solo `copyPages`: pdf-lib deduplica lo compartido (fuentes, imágenes)
    // dentro de cada llamada, así que copiar de a una página lo embebe otra vez
    // por página y el PDF buscable crece tantas veces como páginas tenga.
    const copiedPages = await out.copyPages(
      source,
      pages.map((ocrPage) => ocrPage.pageNumber - 1),
    )
    pages.forEach((ocrPage, index) => {
      const copied = copiedPages[index]
      if (!copied) return
      const page = out.addPage(copied)
      drawInvisibleOcrText({ font, page, rgb, ocrPage })
    })
  } else {
    for (const ocrPage of pages) {
      const page = out.addPage([ocrPage.width, ocrPage.height])
      const blob = await ocrCanvasToJpegBlob(ocrPage.canvas)
      const image = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()))
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: ocrPage.width,
        height: ocrPage.height,
      })
      drawInvisibleOcrText({ font, page, rgb, ocrPage })
    }
  }

  const bytes = await out.save({ useObjectStreams: true })
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return new Blob([buffer], { type: 'application/pdf' })
}
