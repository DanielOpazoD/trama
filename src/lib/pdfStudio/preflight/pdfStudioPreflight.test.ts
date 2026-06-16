import { describe, expect, it } from 'vitest'
import {
  buildPdfStudioImportPreflight,
  buildPdfStudioPreflight,
  summarizePdfStudioPreflight,
} from './pdfStudioPreflight'
import {
  addImageSource,
  addPdfSource,
  addPdfFormField,
  emptyDoc,
  makePdfFormFieldDraft,
  makeRedactionAnnotation,
  makeTextAnnotation,
  setPageAnnotations,
  type PdfDoc,
} from '../model/model'

function file(name: string, size: number, type = 'image/png'): File {
  return new File([new Uint8Array(size)], name, { type })
}

function oneImageDoc(size = 1024): PdfDoc {
  return addImageSource(emptyDoc(), file('scan.png', size))
}

describe('buildPdfStudioPreflight', () => {
  it('bloquea documentos vacios antes de exportar', () => {
    const report = buildPdfStudioPreflight(emptyDoc(), { action: 'export' })

    expect(report.blockers).toEqual([
      expect.objectContaining({
        code: 'empty-document',
        severity: 'blocker',
      }),
    ])
    expect(report.canProceed).toBe(false)
  })

  it('advierte imagenes pesadas y redacciones que rasterizan paginas', () => {
    let doc = oneImageDoc(16 * 1024 * 1024)
    doc = setPageAnnotations(doc, 0, [
      makeRedactionAnnotation({
        xRatio: 0.1,
        yRatio: 0.2,
        wRatio: 0.25,
        hRatio: 0.08,
        color: '#000000',
      }),
    ])

    const report = buildPdfStudioPreflight(doc, { action: 'export' })

    expect(report.warnings.map((item) => item.code)).toEqual(
      expect.arrayContaining(['heavy-images', 'redactions-rasterize-pages']),
    )
    expect(report.canProceed).toBe(true)
    expect(report.stats.redactionPages).toBe(1)
    expect(report.stats.sourceBytes).toBe(16 * 1024 * 1024)
    expect(report.stats.imageBytes).toBe(16 * 1024 * 1024)
  })

  it('no advierte imagenes pesadas cuando el peso viene de un PDF grande', () => {
    const withPdf = addPdfSource(
      emptyDoc(),
      file('historia.pdf', 24 * 1024 * 1024, 'application/pdf'),
      1,
    )
    const doc = addImageSource(withPdf, file('scan.png', 1024, 'image/png'))

    const report = buildPdfStudioPreflight(doc, { action: 'export' })

    expect(report.stats.sourceBytes).toBe(24 * 1024 * 1024 + 1024)
    expect(report.stats.imageBytes).toBe(1024)
    expect(report.warnings.map((item) => item.code)).not.toContain('heavy-images')
  })

  it('advierte texto con fuente manuscrita antes de exportar', () => {
    const doc = setPageAnnotations(oneImageDoc(), 0, [
      makeTextAnnotation({
        text: 'Firma',
        xRatio: 0.2,
        yRatio: 0.3,
        sizeRatio: 0.02,
        color: '#111111',
        font: 'script',
        bold: false,
      }),
    ])

    const report = buildPdfStudioPreflight(doc, { action: 'export' })

    expect(report.warnings).toContainEqual(
      expect.objectContaining({
        code: 'script-fonts',
        severity: 'warning',
      }),
    )
  })

  it('advierte campos requeridos sin valor al imprimir o exportar planillas', () => {
    const doc = oneImageDoc()
    const required = makePdfFormFieldDraft({
      fieldKind: 'text',
      pageId: doc.pages[0]!.id,
      name: 'paciente',
      value: '',
      required: true,
      xRatio: 0.1,
      yRatio: 0.2,
      wRatio: 0.3,
      hRatio: 0.05,
    })
    const withField = addPdfFormField(doc, required)

    const report = buildPdfStudioPreflight(withField, { action: 'export' })

    expect(report.warnings).toContainEqual(
      expect.objectContaining({
        code: 'required-form-fields-empty',
        detail: 'paciente',
      }),
    )
  })

  it('resume el estado operativo en una frase corta', () => {
    let doc = oneImageDoc(16 * 1024 * 1024)
    doc = setPageAnnotations(doc, 0, [
      makeRedactionAnnotation({
        xRatio: 0.1,
        yRatio: 0.2,
        wRatio: 0.25,
        hRatio: 0.08,
        color: '#000000',
      }),
    ])

    const summary = summarizePdfStudioPreflight(
      buildPdfStudioPreflight(doc, { action: 'export' }),
    )

    expect(summary).toBe('1 página · 2 advertencias · listo para exportar')
  })
})

describe('buildPdfStudioImportPreflight', () => {
  it('bloquea importaciones sin archivos soportados antes de leerlos', () => {
    const report = buildPdfStudioImportPreflight([file('notas.txt', 1200, 'text/plain')])

    expect(report.canProceed).toBe(false)
    expect(report.blockers).toContainEqual(
      expect.objectContaining({
        code: 'unsupported-import-files',
        detail: 'notas.txt',
      }),
    )
  })

  it('advierte archivos pesados o parcialmente no soportados sin bloquear lo valido', () => {
    const report = buildPdfStudioImportPreflight([
      file('scan.png', 16 * 1024 * 1024, 'image/png'),
      file('notas.txt', 1200, 'text/plain'),
    ])

    expect(report.canProceed).toBe(true)
    expect(report.warnings.map((item) => item.code)).toEqual(
      expect.arrayContaining(['heavy-images', 'unsupported-import-files']),
    )
    expect(report.stats.imageSources).toBe(1)
    expect(report.stats.sourceBytes).toBe(16 * 1024 * 1024)
    expect(report.stats.imageBytes).toBe(16 * 1024 * 1024)
  })

  it('no advierte importacion de imagenes pesadas cuando el peso viene de un PDF', () => {
    const report = buildPdfStudioImportPreflight([
      file('historia.pdf', 24 * 1024 * 1024, 'application/pdf'),
      file('scan.png', 1024, 'image/png'),
    ])

    expect(report.canProceed).toBe(true)
    expect(report.stats.sourceBytes).toBe(24 * 1024 * 1024 + 1024)
    expect(report.stats.imageBytes).toBe(1024)
    expect(report.warnings.map((item) => item.code)).not.toContain('heavy-images')
  })
})
