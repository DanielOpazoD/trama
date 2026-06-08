import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function fileLineCount(path: string): number {
  return readFileSync(resolve(process.cwd(), path), 'utf8').split('\n').length
}

describe('pdfStudio · estructura incremental', () => {
  it('mantiene PdfTextEditor bajo el ratchet estructural actual', () => {
    expect(
      fileLineCount('src/components/notas/pdfStudio/editor/PdfTextEditor.tsx'),
    ).toBeLessThanOrEqual(575)
  })

  it('mantiene PdfStudioView bajo el ratchet estructural actual', () => {
    expect(
      fileLineCount('src/components/notas/pdfStudio/PdfStudioView.tsx'),
    ).toBeLessThanOrEqual(388)
  })

  it('mantiene assemble como orquestador del pipeline', () => {
    expect(fileLineCount('src/lib/pdfStudio/assemble/assemble.ts')).toBeLessThanOrEqual(
      300,
    )
  })

  it('mantiene EditorToolbar bajo el ratchet estructural actual', () => {
    expect(
      fileLineCount('src/components/notas/pdfStudio/editor/EditorToolbar.tsx'),
    ).toBeLessThanOrEqual(475)
  })

  it('mantiene AnnotationLayer bajo el ratchet estructural actual', () => {
    expect(
      fileLineCount('src/components/notas/pdfStudio/editor/AnnotationLayer.tsx'),
    ).toBeLessThanOrEqual(470)
  })

  it('mantiene el modelo PDF bajo el ratchet estructural actual', () => {
    expect(fileLineCount('src/lib/pdfStudio/model/model.ts')).toBeLessThanOrEqual(460)
  })

  it('mantiene formularios visuales separados en modulos pequenos', () => {
    const formModules = [
      'src/lib/pdfStudio/model/modelForms.ts',
      'src/components/notas/pdfStudio/planillas/FormFieldLayer.tsx',
      'src/components/notas/pdfStudio/planillas/usePdfTextEditorForms.ts',
      'src/components/notas/pdfStudio/planillas/SignatureCaptureDialog.tsx',
      'src/components/notas/pdfStudio/planillas/FormFieldInspector.tsx',
      'src/components/notas/pdfStudio/editor/PdfTextEditorFormSurface.tsx',
      'src/components/notas/pdfStudio/editor/PdfTextEditorPageSurface.tsx',
      'src/components/notas/pdfStudio/planillas/pdfFormVisualMapping.ts',
      'src/components/notas/pdfStudio/editor/pdfEditorZoomScroll.ts',
      'src/components/notas/pdfStudio/editor/usePdfEditorZoomScroll.ts',
      'src/components/notas/pdfStudio/editor/EditorToolbarFormMenu.tsx',
    ]

    for (const path of formModules) {
      expect(fileLineCount(path), path).toBeLessThanOrEqual(300)
    }
  })

  it('mantiene el modo planilla separado en modulos pequenos', () => {
    const templateModules = [
      'src/components/notas/pdfStudio/planillas/design/PdfTemplateModeBanner.tsx',
      'src/components/notas/pdfStudio/planillas/design/usePdfStudioTemplateMode.tsx',
      'src/components/notas/pdfStudio/shell/PdfStudioWorkspacePanelHost.tsx',
    ]

    for (const path of templateModules) {
      expect(fileLineCount(path), path).toBeLessThanOrEqual(140)
    }
  })

  it('mantiene la biblioteca de planillas en componentes enfocados', () => {
    expect(
      fileLineCount('src/components/notas/pdfStudio/workspace/WorkspacePanel.tsx'),
    ).toBeLessThanOrEqual(160)
    expect(
      fileLineCount(
        'src/components/notas/pdfStudio/workspace/WorkspaceImagesSection.tsx',
      ),
    ).toBeLessThanOrEqual(110)
    expect(
      fileLineCount(
        'src/components/notas/pdfStudio/workspace/WorkspaceTemplatesSection.tsx',
      ),
    ).toBeLessThanOrEqual(190)
    expect(
      fileLineCount('src/components/notas/pdfStudio/workspace/WorkspaceTemplateCard.tsx'),
    ).toBeLessThanOrEqual(250)
    expect(
      fileLineCount(
        'src/components/notas/pdfStudio/workspace/WorkspaceSavedDocsSection.tsx',
      ),
    ).toBeLessThanOrEqual(210)
  })

  it('mantiene el OCR buscable separado en modulos pequenos', () => {
    const ocrModules = [
      'src/lib/pdfStudio/ocr/pdfOcr.ts',
      'src/lib/pdfStudio/ocr/pdfOcrInput.ts',
      'src/lib/pdfStudio/ocr/pdfOcrLimits.ts',
      'src/lib/pdfStudio/ocr/pdfOcrRecognition.ts',
      'src/lib/pdfStudio/ocr/pdfOcrSearchablePdf.ts',
      'src/lib/pdfStudio/ocr/pdfOcrWorkerClient.ts',
      'src/lib/pdfStudio/ocr/pdfOcrBackendAdapter.ts',
    ]

    for (const path of ocrModules) {
      expect(fileLineCount(path), path).toBeLessThanOrEqual(120)
    }
  })
})
