import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import { addPdfSource, emptyDoc } from './model'
import { assemble, PdfExportPipelineError } from './assemble'

const tinyPng = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
  0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
  0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78,
  0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
])

async function pdfFile(
  name: string,
  build: (pdf: PDFDocument) => Promise<void> | void,
): Promise<File> {
  const pdf = await PDFDocument.create()
  await build(pdf)
  const bytes = await pdf.save()
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return new File([buffer], name, { type: 'application/pdf' })
}

async function loadPdfFromBlob(blob: Blob): Promise<PDFDocument> {
  return PDFDocument.load(await blob.arrayBuffer())
}

describe('pdfStudio/assemble · fixtures reales pequeñas', () => {
  it('exporta un PDF multipágina real sin rasterizar ni perder páginas', async () => {
    const source = await pdfFile('multipagina.pdf', (pdf) => {
      pdf.addPage([320, 480])
      pdf.addPage([480, 320])
      pdf.addPage([612, 792])
    })

    const { blob, skipped } = await assemble(addPdfSource(emptyDoc(), source, 3))
    const out = await loadPdfFromBlob(blob)

    expect(skipped).toEqual([])
    expect(out.getPageCount()).toBe(3)
    expect(out.getPage(0).getWidth()).toBeCloseTo(320)
    expect(out.getPage(1).getHeight()).toBeCloseTo(320)
  })

  it('conserva fixtures reales rotadas, escaneadas y con fuente no usual', async () => {
    const rotated = await pdfFile('rotado.pdf', (pdf) => {
      const page = pdf.addPage([300, 500])
      page.setRotation(degrees(90))
    })
    const scanned = await pdfFile('escaneado.pdf', async (pdf) => {
      const image = await pdf.embedPng(tinyPng)
      const page = pdf.addPage([320, 320])
      page.drawImage(image, { x: 0, y: 0, width: 320, height: 320 })
    })
    const rareFont = await pdfFile('fuente-rara.pdf', async (pdf) => {
      const font = await pdf.embedFont(StandardFonts.CourierOblique)
      const page = pdf.addPage([360, 240])
      page.drawText('Courier Oblique fixture', {
        x: 24,
        y: 180,
        size: 18,
        font,
        color: rgb(0.1, 0.1, 0.1),
      })
    })
    let doc = addPdfSource(emptyDoc(), rotated, 1)
    doc = addPdfSource(doc, scanned, 1)
    doc = addPdfSource(doc, rareFont, 1)

    const { blob, skipped } = await assemble(doc)
    const out = await loadPdfFromBlob(blob)

    expect(skipped).toEqual([])
    expect(out.getPageCount()).toBe(3)
    expect(out.getPage(0).getRotation().angle).toBe(90)
  })

  it('salta un PDF corrupto real y mantiene el resto exportable', async () => {
    const corrupt = new File(['BROKEN PDF'], 'corrupto.pdf', {
      type: 'application/pdf',
    })
    const valid = await pdfFile('valido.pdf', (pdf) => {
      pdf.addPage([200, 200])
    })
    let doc = addPdfSource(emptyDoc(), corrupt, 1)
    doc = addPdfSource(doc, valid, 1)

    const { blob, skipped } = await assemble(doc)
    const out = await loadPdfFromBlob(blob)

    expect(out.getPageCount()).toBe(1)
    expect(skipped).toHaveLength(1)
    expect(skipped[0]?.name).toBe('corrupto.pdf')
  })

  it('lanza error tipado si todos los PDFs reales son inválidos', async () => {
    const corrupt = new File(['not a pdf'], 'solo-corrupto.pdf', {
      type: 'application/pdf',
    })

    await expect(assemble(addPdfSource(emptyDoc(), corrupt, 1))).rejects.toMatchObject({
      name: 'PdfExportPipelineError',
      phase: 'process-pages',
      code: 'NO_PAGES_EXPORTED',
    })
    await expect(assemble(addPdfSource(emptyDoc(), corrupt, 1))).rejects.toBeInstanceOf(
      PdfExportPipelineError,
    )
  })
})
