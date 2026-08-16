import { describe, expect, it } from 'vitest'
import { addPdfSource, emptyDoc } from '../model/model'
import { reducePdfPageCommand } from '../model/pageCommands'
import {
  PATHOLOGICAL_BOOKS,
  type PathologicalBook,
} from '../../../test/factories/pathologicalPdfs'
import { loadPdfLib } from '../pdfRuntime/pdfLibLoader'
import { assemble } from './assemble'

/**
 * Presupuesto de peso de la exportación.
 *
 * La invariante que se fija acá no es un número: es una RAZÓN.
 *
 *   Exportar N páginas tiene que costar lo que pesan esas N páginas,
 *   y no puede depender de cuántas páginas tenga el libro del que salen.
 *
 * Esa segunda mitad es la que atrapa la familia de defectos que produjo el PDF
 * de 1,8 GB: cuando el peso exportado escala con el TAMAÑO DE LA FUENTE en vez
 * de con lo seleccionado, algo está arrastrando el libro entero —recursos
 * heredados sin podar, o un `copyPages` por página que reembebe lo compartido—.
 * Un número absoluto no habría dicho nada; el mismo defecto pasaba cualquier
 * umbral holgado con un libro chico.
 *
 * Los libros del usuario no se pueden versionar, así que el corpus reproduce
 * sus FORMAS (`src/test/factories/pathologicalPdfs.ts`).
 */

const LIBRO_CHICO = 40
const LIBRO_GRANDE = 320
const ELEGIDAS = [1, 5, 9, 14, 20, 26, 31, 38]

/** Sobrecarga fija de cualquier PDF ensamblado: catálogo, árbol, xref. */
const SOBRECARGA_BYTES = 24 * 1024

/** Techo de tiempo para exportar 16 de 600 páginas. Holgado a propósito: es una
 *  envolvente contra el defecto que multiplicaba el trabajo, no un benchmark. */
const ENVOLVENTE_MS = 15_000

/**
 * Exporta `indices` y comprueba, ANTES de devolver el peso, que cada página
 * conserva los recursos que le tocan.
 *
 * Sin esta parte el presupuesto sólo pondría un techo, y un techo se satisface
 * también borrando de más: una poda que se pase deja páginas vacías, produce un
 * archivo MÁS chico y pasa el gate. Un peso por debajo de lo esperado no es una
 * mejora — es contenido que se perdió.
 */
async function exportarYComprobar(
  book: PathologicalBook,
  indices: number[],
): Promise<number> {
  const doc = reducePdfPageCommand(addPdfSource(emptyDoc(), book.file, book.pages), {
    type: 'subsetDoc',
    indices,
  })
  const { blob, skipped } = await assemble(doc)
  expect(skipped, book.label).toEqual([])

  const lib = await loadPdfLib()
  const out = await lib.PDFDocument.load(await blob.arrayBuffer())
  expect(out.getPageCount(), book.label).toBe(indices.length)

  indices.forEach((sourceIndex, position) => {
    const esperado = book.expectedResources(sourceIndex)
    const nombres = (categoria: string) => {
      const recursos = out.context.lookup(
        out.getPage(position).node.get(lib.PDFName.of('Resources')),
      )
      if (!(recursos instanceof lib.PDFDict)) return []
      const sub = out.context.lookup(recursos.get(lib.PDFName.of(categoria)))
      return sub instanceof lib.PDFDict
        ? sub.entries().map(([key]) => key.decodeText())
        : []
    }
    const contexto = `${book.label} · hoja ${sourceIndex}`
    expect(nombres('XObject'), contexto).toEqual(
      expect.arrayContaining(esperado.xobjects),
    )
    if (esperado.fonts) {
      expect(nombres('Font'), contexto).toEqual(expect.arrayContaining(esperado.fonts))
    }
  })

  return blob.size
}

describe('pdfStudio/assemble · presupuesto de peso', () => {
  for (const { label, build } of PATHOLOGICAL_BOOKS) {
    it(`el peso de exportar no depende del tamaño del libro · ${label}`, async () => {
      const chico = await build(LIBRO_CHICO)
      const grande = await build(LIBRO_GRANDE)
      // El libro grande tiene 8× páginas: si el peso exportado lo sigue, el
      // ensamblado está arrastrando lo que no eligió el usuario.
      expect(grande.file.size).toBeGreaterThan(chico.file.size * 4)

      const desdeChico = await exportarYComprobar(chico, ELEGIDAS)
      const desdeGrande = await exportarYComprobar(grande, ELEGIDAS)

      const deriva = Math.abs(desdeGrande - desdeChico) / desdeChico
      expect(
        deriva,
        `${chico.label}: ${desdeChico} vs ${desdeGrande} bytes`,
      ).toBeLessThan(0.15)
    })
  }

  for (const { label, build } of PATHOLOGICAL_BOOKS) {
    it(`exportar N páginas cuesta lo que pesan N páginas · ${label}`, async () => {
      const book = await build(LIBRO_GRANDE)

      const bytes = await exportarYComprobar(book, ELEGIDAS)

      // Presupuesto explícito: lo propio de cada página elegida, más lo que
      // comparten de verdad UNA vez, más la sobrecarga de armar un PDF. El ×2
      // deja aire para diccionarios y streams de contenido sin dejar pasar un
      // libro entero.
      const presupuesto =
        SOBRECARGA_BYTES + book.sharedBytes + ELEGIDAS.length * book.bytesPerPage * 2
      expect(bytes, `${book.label}: ${bytes} bytes`).toBeLessThan(presupuesto)
    })
  }

  // El timeout de vitest (5 s por defecto) tiene que quedar POR ENCIMA de la
  // envolvente que afirma el test: si no, una exportación de 8 s muere por
  // timeout en vez de fallar diciendo cuánto tardó, y el número declarado acá
  // sería decorativo.
  it(
    'exportar 16 de 600 páginas termina dentro de la envolvente',
    async () => {
      const book = await PATHOLOGICAL_BOOKS[0]!.build(600)
      const indices = Array.from({ length: 16 }, (_, i) => i * 37)
      const empezó = performance.now()

      const bytes = await exportarYComprobar(book, indices)
      const tardó = performance.now() - empezó

      expect(tardó, `tardó ${Math.round(tardó)} ms`).toBeLessThan(ENVOLVENTE_MS)
      expect(bytes).toBeLessThan(
        SOBRECARGA_BYTES + book.sharedBytes + 16 * book.bytesPerPage * 2,
      )
    },
    ENVOLVENTE_MS * 2,
  )
})
