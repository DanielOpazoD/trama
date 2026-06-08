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
    ).toBeLessThanOrEqual(540)
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
      'src/components/notas/pdfStudio/FormFieldInspector.tsx',
      'src/components/notas/pdfStudio/PdfTextEditorFormSurface.tsx',
      'src/components/notas/pdfStudio/PdfTextEditorPageSurface.tsx',
      'src/components/notas/pdfStudio/pdfFormVisualMapping.ts',
      'src/components/notas/pdfStudio/pdfEditorZoomScroll.ts',
      'src/components/notas/pdfStudio/usePdfEditorZoomScroll.ts',
      'src/components/notas/pdfStudio/EditorToolbarFormMenu.tsx',
    ]

    for (const path of formModules) {
      expect(fileLineCount(path), path).toBeLessThanOrEqual(280)
    }
  })

  it('mantiene el modo planilla separado en modulos pequenos', () => {
    const templateModules = [
      'src/components/notas/pdfStudio/PdfTemplateModeBanner.tsx',
      'src/components/notas/pdfStudio/usePdfStudioTemplateMode.tsx',
      'src/components/notas/pdfStudio/PdfStudioWorkspacePanelHost.tsx',
    ]

    for (const path of templateModules) {
      expect(fileLineCount(path), path).toBeLessThanOrEqual(140)
    }
  })

  it('mantiene la biblioteca de planillas en componentes enfocados', () => {
    expect(
      fileLineCount('src/components/notas/pdfStudio/WorkspacePanel.tsx'),
    ).toBeLessThanOrEqual(160)
    expect(
      fileLineCount('src/components/notas/pdfStudio/WorkspaceImagesSection.tsx'),
    ).toBeLessThanOrEqual(110)
    expect(
      fileLineCount('src/components/notas/pdfStudio/WorkspaceTemplatesSection.tsx'),
    ).toBeLessThanOrEqual(190)
    expect(
      fileLineCount('src/components/notas/pdfStudio/WorkspaceTemplateCard.tsx'),
    ).toBeLessThanOrEqual(240)
    expect(
      fileLineCount('src/components/notas/pdfStudio/WorkspaceSavedDocsSection.tsx'),
    ).toBeLessThanOrEqual(210)
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
