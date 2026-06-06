import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function fileLineCount(path: string): number {
  return readFileSync(resolve(process.cwd(), path), 'utf8').split('\n').length
}

describe('pdfStudio · estructura incremental', () => {
  it('mantiene PdfTextEditor bajo el ratchet estructural actual', () => {
    expect(
      fileLineCount('src/components/notas/pdfStudio/PdfTextEditor.tsx'),
    ).toBeLessThanOrEqual(520)
  })

  it('mantiene PdfStudioView bajo el ratchet estructural actual', () => {
    expect(
      fileLineCount('src/components/notas/pdfStudio/PdfStudioView.tsx'),
    ).toBeLessThanOrEqual(380)
  })

  it('mantiene assemble como orquestador del pipeline', () => {
    expect(fileLineCount('src/lib/pdfStudio/assemble.ts')).toBeLessThanOrEqual(300)
  })

  it('mantiene EditorToolbar bajo el ratchet estructural actual', () => {
    expect(
      fileLineCount('src/components/notas/pdfStudio/EditorToolbar.tsx'),
    ).toBeLessThanOrEqual(420)
  })

  it('mantiene AnnotationLayer bajo el ratchet estructural actual', () => {
    expect(
      fileLineCount('src/components/notas/pdfStudio/AnnotationLayer.tsx'),
    ).toBeLessThanOrEqual(450)
  })

  it('mantiene el modelo PDF bajo el ratchet estructural actual', () => {
    expect(fileLineCount('src/lib/pdfStudio/model.ts')).toBeLessThanOrEqual(460)
  })

  it('mantiene formularios visuales separados en modulos pequenos', () => {
    const formModules = [
      'src/lib/pdfStudio/modelForms.ts',
      'src/components/notas/pdfStudio/FormFieldLayer.tsx',
      'src/components/notas/pdfStudio/usePdfTextEditorForms.ts',
      'src/components/notas/pdfStudio/SignatureCaptureDialog.tsx',
      'src/components/notas/pdfStudio/pdfFormVisualMapping.ts',
      'src/components/notas/pdfStudio/EditorToolbarFormMenu.tsx',
    ]

    for (const path of formModules) {
      expect(fileLineCount(path), path).toBeLessThanOrEqual(280)
    }
  })

  it('mantiene el OCR buscable separado en modulos pequenos', () => {
    const ocrModules = [
      'src/lib/pdfStudio/pdfOcr.ts',
      'src/lib/pdfStudio/pdfOcrInput.ts',
      'src/lib/pdfStudio/pdfOcrLimits.ts',
      'src/lib/pdfStudio/pdfOcrRecognition.ts',
      'src/lib/pdfStudio/pdfOcrSearchablePdf.ts',
      'src/lib/pdfStudio/pdfOcrWorkerClient.ts',
      'src/lib/pdfStudio/pdfOcrBackendAdapter.ts',
    ]

    for (const path of ocrModules) {
      expect(fileLineCount(path), path).toBeLessThanOrEqual(120)
    }
  })
})
