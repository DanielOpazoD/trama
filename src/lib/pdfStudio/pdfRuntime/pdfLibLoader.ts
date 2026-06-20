export type PdfLib = typeof import('pdf-lib')

type PdfFontkitModule = typeof import('@pdf-lib/fontkit')
type PdfFontkit = PdfFontkitModule extends { default: infer DefaultExport }
  ? DefaultExport
  : PdfFontkitModule

let pdfLibPromise: Promise<PdfLib> | null = null
let fontkitPromise: Promise<PdfFontkit> | null = null

export async function loadPdfLib(): Promise<PdfLib> {
  if (!pdfLibPromise) {
    pdfLibPromise = import('pdf-lib')
  }
  return pdfLibPromise
}

export async function loadPdfFontkit(): Promise<PdfFontkit> {
  if (!fontkitPromise) {
    fontkitPromise = import('@pdf-lib/fontkit').then(
      (fontkit) => (fontkit.default ?? fontkit) as PdfFontkit,
    )
  }
  return fontkitPromise
}
