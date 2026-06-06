import { renderOcrInputPages } from './pdfOcrInput'
import { assertOcrNotCancelled, emitOcrProgress } from './pdfOcrProgress'
import { recognizeOcrPages } from './pdfOcrRecognition'
import { assembleSearchablePdf, buildOcrSidecarText } from './pdfOcrSearchablePdf'
import type { PdfOcrOptions, PdfOcrResult } from './pdfOcrTypes'

export { buildOcrSidecarText }
export type {
  PdfOcrLanguage,
  PdfOcrOptions,
  PdfOcrPageText,
  PdfOcrProgress,
  PdfOcrResult,
  PdfOcrWarning,
} from './pdfOcrTypes'

export async function createSearchablePdf(
  file: File,
  options: PdfOcrOptions,
): Promise<PdfOcrResult> {
  emitOcrProgress(options.onProgress, { phase: 'prepare', status: 'start' })
  assertOcrNotCancelled(options.signal)
  emitOcrProgress(options.onProgress, { phase: 'prepare', status: 'complete' })

  const rendered = await renderOcrInputPages(file, options)
  const pages = await recognizeOcrPages(rendered, options)
  emitOcrProgress(options.onProgress, { phase: 'assemble', status: 'start' })
  const pdfBlob = await assembleSearchablePdf(file, pages)
  emitOcrProgress(options.onProgress, { phase: 'assemble', status: 'complete' })
  emitOcrProgress(options.onProgress, { phase: 'save', status: 'start' })
  const pageTexts = pages.map(({ pageNumber, text, confidence }) => ({
    pageNumber,
    text,
    confidence,
  }))
  const textBlob = new Blob([buildOcrSidecarText(pageTexts)], {
    type: 'text/plain;charset=utf-8',
  })
  emitOcrProgress(options.onProgress, { phase: 'save', status: 'complete' })

  return {
    pdfBlob,
    textBlob,
    pages: pageTexts,
    warnings: pageTexts.some((page) => page.text.trim())
      ? []
      : [
          {
            code: 'NO_TEXT',
            message: 'No se detectó texto durante el OCR.',
          },
        ],
  }
}
