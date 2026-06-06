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
    ).toBeLessThanOrEqual(650)
  })
})
