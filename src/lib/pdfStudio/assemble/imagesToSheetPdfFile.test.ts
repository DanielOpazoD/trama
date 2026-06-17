import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { imagesToSheetPdfFile } from './imagesToSheetPdfFile'

const PNG_1X1 = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  ),
  (char) => char.charCodeAt(0),
)

function pngFile(name: string): File {
  return new File([PNG_1X1], name, { type: 'image/png' })
}

describe('imagesToSheetPdfFile', () => {
  it('genera un PDF de hojas blancas agrupando imagenes segun el layout', async () => {
    const pdf = await imagesToSheetPdfFile(
      [pngFile('uno.png'), pngFile('dos.png'), pngFile('tres.png')],
      { imagesPerPage: 2 },
    )

    expect(pdf.name).toBe('imagenes.pdf')
    expect(pdf.type).toBe('application/pdf')

    const loaded = await PDFDocument.load(await pdf.arrayBuffer())
    expect(loaded.getPageCount()).toBe(2)
  })
})
