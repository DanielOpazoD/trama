import { describe, expect, it } from 'vitest'
import * as pdfLib from 'pdf-lib'
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { addPdfSource, emptyDoc } from '../model/model'
import { reducePdfPageCommand } from '../model/pageCommands'
import { assemble } from './assemble'
import { collectResourceNames, prunePageResources } from './assemblePageResources'

const encode = (text: string) => new TextEncoder().encode(text)

/** Bytes incompresibles: un recurso "pesado" que se nota si sobrevive de más. */
function heavyBytes(kb: number, seed: number): Uint8Array {
  const bytes = new Uint8Array(kb * 1024)
  let state = seed >>> 0 || 1
  for (let index = 0; index < bytes.length; index += 1) {
    state ^= state << 13
    state >>>= 0
    state ^= state >> 17
    state ^= state << 5
    state >>>= 0
    bytes[index] = state & 0xff
  }
  return bytes
}

type DictLiteral = Parameters<typeof PDFDocument.prototype.context.obj>[0]

function rawStream(
  doc: PDFDocument,
  dict: Record<string, DictLiteral>,
  bytes: Uint8Array,
) {
  return doc.context.register(
    PDFRawStream.of(doc.context.obj({ ...dict, Length: bytes.length }), bytes),
  )
}

function formXObject(doc: PDFDocument, body: Uint8Array) {
  return rawStream(doc, { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 10, 10] }, body)
}

function setContents(doc: PDFDocument, page: pdfLib.PDFPage, source: string) {
  page.node.set(PDFName.of('Contents'), rawStream(doc, {}, encode(source)))
}

function namesIn(page: pdfLib.PDFPage, category: string): string[] {
  const resources = page.doc.context.lookup(page.node.get(PDFName.of('Resources')))
  if (!(resources instanceof PDFDict)) return []
  const sub = page.doc.context.lookup(resources.get(PDFName.of(category)))
  return sub instanceof PDFDict ? sub.entries().map(([key]) => key.decodeText()) : []
}

/**
 * Libro cuyo `/Resources` cuelga del nodo raíz del árbol de páginas: cada página
 * HEREDA los recursos de todas las demás. Es la forma que hace que copiar 16
 * páginas de un libro de 600 pese como 16 libros.
 */
async function inheritedResourcesBook(pages: number): Promise<PDFDocument> {
  const doc = await PDFDocument.create()
  const xobjects = doc.context.obj({})
  for (let index = 0; index < pages; index += 1) {
    xobjects.set(PDFName.of(`X${index}`), formXObject(doc, heavyBytes(8, index + 11)))
  }
  const shared = doc.context.register(doc.context.obj({ XObject: xobjects }))
  for (let index = 0; index < pages; index += 1) {
    const page = doc.addPage([200, 200])
    page.node.delete(PDFName.of('Resources'))
    setContents(doc, page, `q /X${index} Do Q`)
  }
  doc.catalog.lookup(PDFName.of('Pages'), PDFDict).set(PDFName.of('Resources'), shared)
  return doc
}

/**
 * Libro donde cada página tiene su `/Resources` propio pero TODAS comparten una
 * fuente embebida pesada. Acá la poda no puede sacar nada —la fuente se usa de
 * verdad—, así que sólo copiar en lote evita duplicarla una vez por página.
 */
async function sharedFontBook(pages: number): Promise<PDFDocument> {
  const doc = await PDFDocument.create()
  const fontFile = rawStream(doc, {}, heavyBytes(200, 77))
  const descriptor = doc.context.register(
    doc.context.obj({ Type: 'FontDescriptor', FontName: 'Pesada', FontFile2: fontFile }),
  )
  const font = doc.context.register(
    doc.context.obj({
      Type: 'Font',
      Subtype: 'TrueType',
      BaseFont: 'Pesada',
      FontDescriptor: descriptor,
    }),
  )
  for (let index = 0; index < pages; index += 1) {
    const page = doc.addPage([200, 200])
    page.node.set(
      PDFName.of('Resources'),
      doc.context.obj({
        XObject: doc.context.obj({
          [`X${index}`]: formXObject(doc, heavyBytes(2, index + 41)),
        }),
        Font: doc.context.obj({ F1: font }),
      }),
    )
    setContents(doc, page, `q /X${index} Do Q BT /F1 12 Tf (t) Tj ET`)
  }
  return doc
}

async function pdfFileFrom(doc: PDFDocument, name: string): Promise<File> {
  const bytes = await doc.save()
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return new File([buffer], name, { type: 'application/pdf' })
}

describe('pdfStudio/assemble · poda de /Resources heredados', () => {
  it('deja en la página sólo el XObject que su content stream nombra', async () => {
    const doc = await inheritedResourcesBook(30)

    expect(prunePageResources(pdfLib, doc, 7)).toBe(true)

    expect(namesIn(doc.getPage(7), 'XObject')).toEqual(['X7'])
  })

  it('no toca la página cuando ya usa todo lo que tiene', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([200, 200])
    page.node.set(
      PDFName.of('Resources'),
      doc.context.obj({
        XObject: doc.context.obj({ Solo: formXObject(doc, encode('x')) }),
      }),
    )
    setContents(doc, page, 'q /Solo Do Q')

    expect(prunePageResources(pdfLib, doc, 0)).toBe(false)
    expect(namesIn(page, 'XObject')).toEqual(['Solo'])
  })

  it('conserva la fuente que el stream nombra y descarta las que no', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([200, 200])
    const font = (name: string) =>
      doc.context.register(
        doc.context.obj({ Type: 'Font', Subtype: 'TrueType', BaseFont: name }),
      )
    page.node.set(
      PDFName.of('Resources'),
      doc.context.obj({
        Font: doc.context.obj({ F1: font('Usada'), F2: font('Sobra') }),
      }),
    )
    setContents(doc, page, 'BT /F1 12 Tf (hola) Tj ET')

    expect(prunePageResources(pdfLib, doc, 0)).toBe(true)
    expect(namesIn(page, 'Font')).toEqual(['F1'])
  })

  it('conserva lo que sólo nombra un XObject de formulario anidado', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([200, 200])
    page.node.set(
      PDFName.of('Resources'),
      doc.context.obj({
        XObject: doc.context.obj({
          Marco: formXObject(doc, encode('q /Sello Do Q')),
          Sello: formXObject(doc, heavyBytes(4, 3)),
          Nadie: formXObject(doc, heavyBytes(4, 4)),
        }),
      }),
    )
    setContents(doc, page, 'q /Marco Do Q')

    expect(prunePageResources(pdfLib, doc, 0)).toBe(true)
    expect(namesIn(page, 'XObject').sort()).toEqual(['Marco', 'Sello'])
  })

  it('sigue una cadena profunda de formularios listada al revés', async () => {
    // El caso que rompe cualquier tope de N pasadas: F0 → F1 → … → F5, con el
    // diccionario en orden inverso, así que cada pasada resuelve un solo
    // eslabón. Con un tope de 4 vueltas, F5 quedaba sin leer y su fuente se
    // podaba: contenido faltante en silencio.
    const doc = await PDFDocument.create()
    const page = doc.addPage([200, 200])
    const ULTIMO = 5
    const cadena = doc.context.obj({})
    for (let index = ULTIMO; index >= 0; index -= 1) {
      cadena.set(
        PDFName.of(`F${index}`),
        formXObject(
          doc,
          encode(index === ULTIMO ? 'BT /Honda 12 Tf ET' : `q /F${index + 1} Do Q`),
        ),
      )
    }
    const font = (name: string) =>
      doc.context.register(doc.context.obj({ Type: 'Font', BaseFont: name }))
    page.node.set(
      PDFName.of('Resources'),
      doc.context.obj({
        XObject: cadena,
        Font: doc.context.obj({ Honda: font('Honda'), Nadie: font('Nadie') }),
      }),
    )
    setContents(doc, page, 'q /F0 Do Q')

    expect(prunePageResources(pdfLib, doc, 0)).toBe(true)

    // La fuente que sólo nombra el eslabón más hondo sobrevive…
    expect(namesIn(page, 'Font')).toEqual(['Honda'])
    // …y la cadena entera también.
    expect(namesIn(page, 'XObject').sort()).toEqual(['F0', 'F1', 'F2', 'F3', 'F4', 'F5'])
  })

  it('termina aunque dos formularios se nombren en círculo', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([200, 200])
    page.node.set(
      PDFName.of('Resources'),
      doc.context.obj({
        XObject: doc.context.obj({
          Ida: formXObject(doc, encode('q /Vuelta Do Q')),
          Vuelta: formXObject(doc, encode('q /Ida Do Q')),
          Nadie: formXObject(doc, heavyBytes(4, 9)),
        }),
      }),
    )
    setContents(doc, page, 'q /Ida Do Q')

    expect(prunePageResources(pdfLib, doc, 0)).toBe(true)
    expect(namesIn(page, 'XObject').sort()).toEqual(['Ida', 'Vuelta'])
  })

  it('conserva lo que sólo nombra la apariencia de una anotación', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([200, 200])
    page.node.set(
      PDFName.of('Resources'),
      doc.context.obj({
        XObject: doc.context.obj({
          Firma: formXObject(doc, heavyBytes(4, 5)),
          Nadie: formXObject(doc, heavyBytes(4, 6)),
        }),
      }),
    )
    setContents(doc, page, 'q Q')
    page.node.set(
      PDFName.of('Annots'),
      doc.context.obj([
        doc.context.obj({
          Type: 'Annot',
          Subtype: 'Widget',
          AP: doc.context.obj({ N: formXObject(doc, encode('q /Firma Do Q')) }),
        }),
      ]),
    )

    expect(prunePageResources(pdfLib, doc, 0)).toBe(true)
    expect(namesIn(page, 'XObject')).toEqual(['Firma'])
  })

  it('no poda categorías que se pueden nombrar desde otro recurso', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([200, 200])
    page.node.set(
      PDFName.of('Resources'),
      doc.context.obj({
        XObject: doc.context.obj({
          Usado: formXObject(doc, encode('x')),
          Sobra: formXObject(doc, encode('y')),
        }),
        ExtGState: doc.context.obj({ GS0: doc.context.obj({ ca: 1 }) }),
        ColorSpace: doc.context.obj({ CS0: doc.context.obj([]) }),
      }),
    )
    setContents(doc, page, 'q /Usado Do Q')

    expect(prunePageResources(pdfLib, doc, 0)).toBe(true)
    expect(namesIn(page, 'XObject')).toEqual(['Usado'])
    expect(namesIn(page, 'ExtGState')).toEqual(['GS0'])
    expect(namesIn(page, 'ColorSpace')).toEqual(['CS0'])
  })

  it('resuelve los escapes #XX de los nombres del content stream', () => {
    const names = new Set<string>()
    collectResourceNames(encode('q /Im#20uno Do /A#42 gs Q'), names)

    expect(names.has('Im uno')).toBe(true)
    expect(names.has('AB')).toBe(true)
  })
})

describe('pdfStudio/assemble · peso de exportar unas pocas páginas de un libro', () => {
  it('exporta 6 de 60 páginas pesando lo que pesan 6, no lo que pesa el libro', async () => {
    const file = await pdfFileFrom(await inheritedResourcesBook(60), 'libro.pdf')
    const picked = [3, 9, 17, 28, 44, 55]

    const { blob, skipped } = await assemble(
      reducePdfPageCommand(addPdfSource(emptyDoc(), file, 60), {
        type: 'subsetDoc',
        indices: picked,
      }),
    )

    expect(skipped).toEqual([])
    const out = await PDFDocument.load(await blob.arrayBuffer())
    expect(out.getPageCount()).toBe(picked.length)
    // Cada página se lleva SU recurso y ninguno de los otros 59.
    picked.forEach((sourceIndex, index) => {
      expect(namesIn(out.getPage(index), 'XObject')).toEqual([`X${sourceIndex}`])
    })
    // Copiar de a una página duplicaba el libro entero 6 veces (~3 MB); copiar
    // en lote sin podar dejaba el libro entero una vez (~500 KB).
    expect(blob.size).toBeLessThan(150_000)
    expect(blob.size).toBeLessThan(file.size / 3)
  })

  it('embebe una sola vez la fuente que comparten las páginas exportadas', async () => {
    const file = await pdfFileFrom(await sharedFontBook(60), 'con-fuente.pdf')
    const picked = [1, 8, 19, 30, 41, 52]

    const { blob, skipped } = await assemble(
      reducePdfPageCommand(addPdfSource(emptyDoc(), file, 60), {
        type: 'subsetDoc',
        indices: picked,
      }),
    )

    expect(skipped).toEqual([])
    const out = await PDFDocument.load(await blob.arrayBuffer())
    expect(out.getPageCount()).toBe(picked.length)
    picked.forEach((sourceIndex, index) => {
      expect(namesIn(out.getPage(index), 'XObject')).toEqual([`X${sourceIndex}`])
      expect(namesIn(out.getPage(index), 'Font')).toEqual(['F1'])
    })
    // Una llamada a copyPages por página embebía los 200 KB de fuente 6 veces.
    expect(blob.size).toBeLessThan(300_000)
  })
})
