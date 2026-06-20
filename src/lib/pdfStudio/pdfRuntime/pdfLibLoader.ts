export type PdfLib = typeof import('pdf-lib')

type PdfFontkitModule = typeof import('@pdf-lib/fontkit')
type PdfFontkit = PdfFontkitModule extends { default: infer DefaultExport }
  ? DefaultExport
  : PdfFontkitModule

let pdfLibPromise: Promise<PdfLib> | null = null
let fontkitPromise: Promise<PdfFontkit> | null = null

/**
 * Loads pdf-lib once for PDF-only flows and retries after failed imports.
 */
export async function loadPdfLib(): Promise<PdfLib> {
  if (!pdfLibPromise) {
    pdfLibPromise = import('pdf-lib').catch((error: unknown) => {
      pdfLibPromise = null
      throw error
    })
  }
  return pdfLibPromise
}

/**
 * Loads fontkit once for embeddable fonts and retries after failed imports.
 */
export async function loadPdfFontkit(): Promise<PdfFontkit> {
  if (!fontkitPromise) {
    fontkitPromise = import('@pdf-lib/fontkit')
      .then((fontkit) => (fontkit.default ?? fontkit) as PdfFontkit)
      .catch((error: unknown) => {
        fontkitPromise = null
        throw error
      })
  }
  return fontkitPromise
}
