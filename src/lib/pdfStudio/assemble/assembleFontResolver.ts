import { standardFontName, type PdfFontKind } from '../model/model'
import { embeddableFontUrl, fetchFontBytes } from './assembleFonts'
import type { PDFFont, PDFDocument } from 'pdf-lib'

export function createPdfFontResolver(out: PDFDocument) {
  const fontCache = new Map<string, PDFFont>()

  return async (font: PdfFontKind, bold: boolean, italic = false): Promise<PDFFont> => {
    const key = `${font}:${bold ? 'b' : 'r'}:${italic ? 'i' : 'n'}`
    const hit = fontCache.get(key)
    if (hit) return hit

    let embedded: PDFFont | null = null
    const url = italic ? null : embeddableFontUrl(font, bold)
    if (url) {
      try {
        embedded = await out.embedFont(await fetchFontBytes(url), { subset: true })
      } catch {
        embedded = null
      }
    }

    const resolved =
      embedded ?? (await out.embedFont(standardFontName(font, bold, italic)))
    fontCache.set(key, resolved)
    return resolved
  }
}
