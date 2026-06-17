import type { PdfDoc, PdfFontKind, PdfPage, PdfSource } from '../model/model'
import { getSource } from '../model/model'
import { addImageSheetPage, type PdfImageCompressionMode } from './assembleImages'
import { applyPdfAnnotations } from './assembleAnnotations'
import { pageHasRedactions } from './assembleRedactions'
import type { SkippedSource } from './assemblePipeline'
import type { PDFFont, PDFDocument, PDFPage } from 'pdf-lib'

type PdfRgb = NonNullable<Parameters<PDFPage['drawText']>[1]>['color']
type PdfRotation = NonNullable<Parameters<PDFPage['drawText']>[1]>['rotate']
type RgbFn = (r: number, g: number, b: number) => PdfRgb
type DegreesFn = (angle: number) => PdfRotation

type ImageSheetEntry = {
  page: Extract<PdfPage, { kind: 'image' }>
  source: PdfSource
}

export async function addImageSheetFromDoc({
  doc,
  pageIndex,
  imagesPerPage,
  skippedIds,
  out,
  compression,
  fontFor,
  rgb,
  degrees,
  skipped,
}: {
  doc: PdfDoc
  pageIndex: number
  imagesPerPage: 1 | 2 | 3 | 4 | 6
  skippedIds: Set<string>
  out: PDFDocument
  compression?: PdfImageCompressionMode
  fontFor: (font: PdfFontKind, bold: boolean, italic?: boolean) => Promise<PDFFont>
  rgb: RgbFn
  degrees: DegreesFn
  skipped: SkippedSource[]
}): Promise<{ outPage: PDFPage; nextPageIndex: number }> {
  const entries: ImageSheetEntry[] = []
  let scanIndex = pageIndex

  while (scanIndex < doc.pages.length && entries.length < imagesPerPage) {
    const candidate = doc.pages[scanIndex]
    if (!candidate || candidate.kind !== 'image' || pageHasRedactions(candidate)) break
    const candidateSource = getSource(doc, candidate.sourceId)
    if (!candidateSource || skippedIds.has(candidateSource.id)) break
    entries.push({ page: candidate, source: candidateSource })
    scanIndex += 1
  }

  const outPage = await addImageSheetPage({
    out,
    entries,
    imagesPerPage,
    compression,
    onImageDrawn: async (sheetPage, entry, cell) => {
      if (entry.page.annotations.length === 0) return
      await applyPdfAnnotations({
        out,
        outPage: sheetPage,
        annotations: entry.page.annotations,
        fontFor,
        rgb,
        degrees,
        skipped,
        viewport: cell,
      })
    },
  })
  if (!outPage) throw new Error('No se pudo dibujar la hoja de imágenes')

  return { outPage, nextPageIndex: Math.max(pageIndex, scanIndex - 1) }
}
