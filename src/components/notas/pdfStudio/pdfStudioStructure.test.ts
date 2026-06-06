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
    ).toBeLessThanOrEqual(450)
  })

  it('mantiene PdfStudioView bajo el ratchet estructural actual', () => {
    expect(
      fileLineCount('src/components/notas/pdfStudio/PdfStudioView.tsx'),
    ).toBeLessThanOrEqual(360)
  })

  it('mantiene assemble como orquestador del pipeline', () => {
    expect(fileLineCount('src/lib/pdfStudio/assemble.ts')).toBeLessThanOrEqual(300)
  })

  it('mantiene EditorToolbar bajo el ratchet estructural actual', () => {
    expect(
      fileLineCount('src/components/notas/pdfStudio/EditorToolbar.tsx'),
    ).toBeLessThanOrEqual(400)
  })

  it('mantiene AnnotationLayer bajo el ratchet estructural actual', () => {
    expect(
      fileLineCount('src/components/notas/pdfStudio/AnnotationLayer.tsx'),
    ).toBeLessThanOrEqual(450)
  })

  it('mantiene el modelo PDF bajo el ratchet estructural actual', () => {
    expect(fileLineCount('src/lib/pdfStudio/model.ts')).toBeLessThanOrEqual(400)
  })
})
