import type { PdfDoc } from './model'

const MB = 1024 * 1024

export const PDF_OCR_CLIENT_WARN_PAGES = 15
export const PDF_OCR_CLIENT_BLOCK_PAGES = 45
export const PDF_OCR_CLIENT_WARN_BYTES = 30 * MB
export const PDF_OCR_CLIENT_BLOCK_BYTES = 90 * MB

export type PdfOcrDocumentAssessment = {
  severity: 'ok' | 'warn' | 'blocked'
  canRunClientSide: boolean
  pageCount: number
  sourceBytes: number
  messages: string[]
}

function formatMb(bytes: number): string {
  return `${Math.ceil(bytes / MB)} MB`
}

export function assessPdfOcrDocument(doc: PdfDoc): PdfOcrDocumentAssessment {
  const pageCount = doc.pages.length
  const sourceBytes = doc.sources.reduce((sum, source) => sum + source.file.size, 0)
  const messages: string[] = []

  if (pageCount >= PDF_OCR_CLIENT_BLOCK_PAGES) {
    messages.push(
      `OCR client-side bloqueado: ${pageCount} páginas supera el límite seguro. Reserva este archivo para la ruta backend/OCRmyPDF.`,
    )
  } else if (pageCount >= PDF_OCR_CLIENT_WARN_PAGES) {
    messages.push(
      `OCR client-side pesado: ${pageCount} páginas puede tardar y consumir memoria local.`,
    )
  }

  if (sourceBytes >= PDF_OCR_CLIENT_BLOCK_BYTES) {
    messages.push(
      `OCR client-side bloqueado: ${formatMb(sourceBytes)} supera el límite seguro de archivo.`,
    )
  } else if (sourceBytes >= PDF_OCR_CLIENT_WARN_BYTES) {
    messages.push(
      `Archivo pesado para OCR local: ${formatMb(sourceBytes)} puede tardar más de lo habitual.`,
    )
  }

  const severity = messages.some((message) => message.includes('bloqueado'))
    ? 'blocked'
    : messages.length > 0
      ? 'warn'
      : 'ok'

  return {
    severity,
    canRunClientSide: severity !== 'blocked',
    pageCount,
    sourceBytes,
    messages,
  }
}
