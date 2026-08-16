import { describe, expect, it } from 'vitest'
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import { PATHOLOGICAL_BOOKS, inheritedResourcesBook } from './pathologicalPdfs'

/**
 * El presupuesto de peso se apoya en estas fábricas, así que una rota no da un
 * error: da un verde por la razón equivocada. Un libro que sale con cero páginas
 * o sin sus bytes pesados haría pasar cualquier umbral.
 */
describe('corpus de PDF patológicos', () => {
  for (const { label, build } of PATHOLOGICAL_BOOKS) {
    it(`produce un PDF cargable con las páginas pedidas · ${label}`, async () => {
      const book = await build(12)
      const doc = await PDFDocument.load(await book.file.arrayBuffer())

      expect(doc.getPageCount()).toBe(12)
      expect(book.pages).toBe(12)
      // Los bytes pesados tienen que estar de verdad: si la fábrica los
      // olvidara, el archivo sería diminuto y el presupuesto no mediría nada.
      expect(book.file.size).toBeGreaterThan(12 * book.bytesPerPage)
    })
  }

  it('el libro grande pesa proporcionalmente más que el chico', async () => {
    const chico = await inheritedResourcesBook(40)
    const grande = await inheritedResourcesBook(320)

    expect(grande.file.size / chico.file.size).toBeGreaterThan(6)
  })

  it('las páginas de recursos heredados NO tienen /Resources propio', async () => {
    // Si tuvieran uno propio, la forma dejaría de reproducir el defecto y el
    // gate quedaría vigilando otra cosa.
    const book = await inheritedResourcesBook(6)
    const doc = await PDFDocument.load(await book.file.arrayBuffer())

    expect(doc.getPage(3).node.get(PDFName.of('Resources'))).toBeUndefined()
    const raíz = doc.catalog.lookup(PDFName.of('Pages'), PDFDict)
    expect(raíz.get(PDFName.of('Resources'))).toBeDefined()
  })

  it('cada forma declara qué comparte de verdad', async () => {
    for (const { label, build } of PATHOLOGICAL_BOOKS) {
      const book = await build(4)
      expect(book.sharedBytes, label).toBeGreaterThanOrEqual(0)
      expect(book.bytesPerPage, label).toBeGreaterThan(0)
    }
  })
})
