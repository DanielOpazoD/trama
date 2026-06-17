import type { PDFDocument, degrees as pdfDegrees, rgb as pdfRgb } from 'pdf-lib'
import type { PdfDoc } from '../model/model'

export async function applyDocumentSettings(
  out: PDFDocument,
  rgb: typeof pdfRgb,
  degrees: typeof pdfDegrees,
  doc: PdfDoc,
) {
  const settings = doc.settings
  const wmText = settings?.watermark?.text?.trim()
  const headerText = settings?.header?.text?.trim()
  const footerText = settings?.footer?.text?.trim()
  if (!settings?.pageNumbers && !wmText && !headerText && !footerText) return

  const outPages = out.getPages()
  const helv = await out.embedFont('Helvetica')
  const total = outPages.length
  outPages.forEach((p, i) => {
    const w = p.getWidth()
    const h = p.getHeight()
    const margin = Math.max(18, Math.min(w, h) * 0.04)
    if (headerText) {
      const size = Math.max(9, Math.min(w, h) * 0.018)
      const tw = helv.widthOfTextAtSize(headerText, size)
      p.drawText(headerText, {
        x: (w - tw) / 2,
        y: h - margin - size * 0.2,
        size,
        font: helv,
        color: rgb(0.22, 0.22, 0.25),
      })
    }
    if (footerText) {
      const size = Math.max(9, Math.min(w, h) * 0.016)
      const tw = helv.widthOfTextAtSize(footerText, size)
      p.drawText(footerText, {
        x: (w - tw) / 2,
        y: margin,
        size,
        font: helv,
        color: rgb(0.35, 0.35, 0.4),
      })
    }
    if (settings?.pageNumbers) {
      const label = `${i + 1} / ${total}`
      const size = Math.max(8, Math.min(w, h) * 0.018)
      const tw = helv.widthOfTextAtSize(label, size)
      const pos = settings.pageNumbers.position
      const x = pos === 'left' ? margin : pos === 'right' ? w - margin - tw : (w - tw) / 2
      p.drawText(label, { x, y: margin, size, font: helv, color: rgb(0.35, 0.35, 0.4) })
    }
    if (wmText) {
      const size = Math.min(w, h) * 0.13
      const tw = helv.widthOfTextAtSize(wmText, size)
      const d = (tw / 2) * Math.SQRT1_2
      p.drawText(wmText, {
        x: w / 2 - d,
        y: h / 2 - d,
        size,
        font: helv,
        color: rgb(0.6, 0.6, 0.62),
        opacity: 0.12,
        rotate: degrees(45),
      })
    }
  })
}
