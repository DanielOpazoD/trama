/**
 * Fábricas de PDF con las formas que hacen crecer una exportación.
 *
 * `docs/pdf-studio.md` declaraba el hueco: «falta una carpeta curada de PDFs
 * grandes de usuario para pruebas de memoria extrema». El defecto de las 16
 * hojas que pesaban 1,8 GB (#404) vivió justo ahí. Los libros de un usuario no
 * se pueden versionar —pesan, y son suyos—, así que acá se reproduce su FORMA:
 * lo que rompe no es el contenido, es cómo el productor organizó los recursos.
 *
 * Cada fábrica declara `bytesPerPage`, el peso propio de una página. Eso es lo
 * que legítimamente debe costar exportarla, y es contra eso que se mide.
 *
 * pdf-lib entra por `loadPdfLib`, no por un import estático: la frontera de
 * runtime del PDF vale también para las fábricas de prueba
 * (`check:pdf-runtime-boundaries`). Los tipos sí vienen directo.
 */
import type { PDFDocument, PDFPage } from 'pdf-lib'
import { loadPdfLib, type PdfLib } from '../../lib/pdfStudio/pdfRuntime/pdfLibLoader'

export type PathologicalBook = {
  file: File
  pages: number
  /** Bytes propios de UNA página: el peso que sí debe viajar al exportarla. */
  bytesPerPage: number
  /**
   * Bytes que las páginas COMPARTEN y que viajan una sola vez con razón: una
   * fuente embebida que todas usan, una cadena de formularios. Es la parte del
   * presupuesto que no escala con cuántas páginas se elijan — pero tampoco con
   * cuántas tenga el libro.
   */
  sharedBytes: number
  /** Cómo se llama esta forma, para que un fallo diga cuál rompió. */
  label: string
}

type DictLiteral = Parameters<PDFDocument['context']['obj']>[0]

const encode = (text: string) => new TextEncoder().encode(text)

/** Bytes incompresibles: si un recurso sobra, se nota en la balanza. */
function heavyBytes(bytes: number, seed: number): Uint8Array {
  const out = new Uint8Array(bytes)
  let state = seed >>> 0 || 1
  for (let index = 0; index < out.length; index += 1) {
    state ^= state << 13
    state >>>= 0
    state ^= state >> 17
    state ^= state << 5
    state >>>= 0
    out[index] = state & 0xff
  }
  return out
}

function rawStream(
  lib: PdfLib,
  doc: PDFDocument,
  dict: Record<string, DictLiteral>,
  bytes: Uint8Array,
) {
  return doc.context.register(
    lib.PDFRawStream.of(doc.context.obj({ ...dict, Length: bytes.length }), bytes),
  )
}

function formXObject(lib: PdfLib, doc: PDFDocument, body: Uint8Array) {
  return rawStream(
    lib,
    doc,
    { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 10, 10] },
    body,
  )
}

function setContents(lib: PdfLib, doc: PDFDocument, page: PDFPage, src: string) {
  page.node.set(lib.PDFName.of('Contents'), rawStream(lib, doc, {}, encode(src)))
}

async function toFile(doc: PDFDocument, name: string): Promise<File> {
  const bytes = await doc.save()
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return new File([buffer], name, { type: 'application/pdf' })
}

/**
 * El caso que produjo el 1,8 GB: el productor colgó `/Resources` del nodo raíz
 * del árbol de páginas, así que CADA página hereda los recursos de todas. Al
 * copiar una sola, `copyPages` se lleva el libro entero.
 */
export async function inheritedResourcesBook(
  pages: number,
  bytesPerPage = 2048,
): Promise<PathologicalBook> {
  const lib = await loadPdfLib()
  const doc = await lib.PDFDocument.create()
  const xobjects = doc.context.obj({})
  for (let index = 0; index < pages; index += 1) {
    xobjects.set(
      lib.PDFName.of(`X${index}`),
      formXObject(lib, doc, heavyBytes(bytesPerPage, index + 11)),
    )
  }
  const shared = doc.context.register(doc.context.obj({ XObject: xobjects }))
  for (let index = 0; index < pages; index += 1) {
    const page = doc.addPage([200, 200])
    page.node.delete(lib.PDFName.of('Resources'))
    setContents(lib, doc, page, `q /X${index} Do Q`)
  }
  doc.catalog
    .lookup(lib.PDFName.of('Pages'), lib.PDFDict)
    .set(lib.PDFName.of('Resources'), shared)
  return {
    file: await toFile(doc, 'recursos-heredados.pdf'),
    pages,
    bytesPerPage,
    // Nada se comparte de verdad: cada página usa su propio XObject y sólo los
    // hereda por cómo está armado el árbol.
    sharedBytes: 0,
    label: 'recursos heredados del árbol',
  }
}

/**
 * Cada página con sus recursos, pero una fuente embebida pesada compartida por
 * todas. La poda no puede quitarla —se usa de verdad—, así que sólo copiar en
 * lote evita embeberla una vez por página.
 */
async function sharedFontBook(
  pages: number,
  bytesPerPage = 2048,
  fontBytes = 96 * 1024,
): Promise<PathologicalBook> {
  const lib = await loadPdfLib()
  const doc = await lib.PDFDocument.create()
  const fontFile = rawStream(lib, doc, {}, heavyBytes(fontBytes, 77))
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
      lib.PDFName.of('Resources'),
      doc.context.obj({
        XObject: doc.context.obj({
          [`X${index}`]: formXObject(lib, doc, heavyBytes(bytesPerPage, index + 41)),
        }),
        Font: doc.context.obj({ F1: font }),
      }),
    )
    setContents(lib, doc, page, `q /X${index} Do Q BT /F1 12 Tf (t) Tj ET`)
  }
  return {
    file: await toFile(doc, 'fuente-compartida.pdf'),
    pages,
    bytesPerPage,
    // La fuente sí la usan todas: viaja UNA vez, no una por página.
    sharedBytes: fontBytes,
    label: 'fuente pesada compartida',
  }
}

/**
 * Formularios anidados que resuelven contra los recursos de la página. Una poda
 * que no siga la cadena entera deja páginas sin su contenido.
 */
async function nestedFormsBook(
  pages: number,
  bytesPerPage = 2048,
  depth = 6,
): Promise<PathologicalBook> {
  const lib = await loadPdfLib()
  const doc = await lib.PDFDocument.create()
  const xobjects = doc.context.obj({})
  for (let index = 0; index < pages; index += 1) {
    xobjects.set(
      lib.PDFName.of(`X${index}`),
      formXObject(lib, doc, heavyBytes(bytesPerPage, index + 5)),
    )
  }
  // Cadena F0 → F1 → … listada al REVÉS: el orden del diccionario no ayuda.
  for (let link = depth - 1; link >= 0; link -= 1) {
    xobjects.set(
      lib.PDFName.of(`F${link}`),
      formXObject(
        lib,
        doc,
        encode(link === depth - 1 ? 'q /X0 Do Q' : `q /F${link + 1} Do Q`),
      ),
    )
  }
  const shared = doc.context.register(doc.context.obj({ XObject: xobjects }))
  for (let index = 0; index < pages; index += 1) {
    const page = doc.addPage([200, 200])
    page.node.delete(lib.PDFName.of('Resources'))
    setContents(lib, doc, page, `q /F0 Do Q q /X${index} Do Q`)
  }
  doc.catalog
    .lookup(lib.PDFName.of('Pages'), lib.PDFDict)
    .set(lib.PDFName.of('Resources'), shared)
  return {
    file: await toFile(doc, 'formularios-anidados.pdf'),
    pages,
    bytesPerPage,
    // La cadena entera la usan todas las páginas; son streams diminutos.
    sharedBytes: depth * 64,
    label: 'formularios anidados en cadena',
  }
}

/**
 * La forma sana y más común: un escaneo donde cada página lleva su imagen y
 * nada se comparte. Está en el corpus como CONTROL: acá exportar N páginas debe
 * costar N páginas, y si esta forma engorda, el problema no es la poda.
 */
async function scannedBook(
  pages: number,
  bytesPerPage = 2048,
): Promise<PathologicalBook> {
  const lib = await loadPdfLib()
  const doc = await lib.PDFDocument.create()
  for (let index = 0; index < pages; index += 1) {
    const page = doc.addPage([200, 200])
    page.node.set(
      lib.PDFName.of('Resources'),
      doc.context.obj({
        XObject: doc.context.obj({
          Im0: formXObject(lib, doc, heavyBytes(bytesPerPage, index + 97)),
        }),
      }),
    )
    setContents(lib, doc, page, 'q /Im0 Do Q')
  }
  return {
    file: await toFile(doc, 'escaneado.pdf'),
    pages,
    bytesPerPage,
    sharedBytes: 0,
    label: 'escaneado sin recursos compartidos',
  }
}

/**
 * El corpus, como tabla de casos. La etiqueta va acá y no dentro de la promesa
 * para que el nombre del test se pueda escribir sin construir el PDF primero.
 */
export const PATHOLOGICAL_BOOKS: {
  label: string
  build: (pages: number) => Promise<PathologicalBook>
}[] = [
  {
    label: 'recursos heredados del árbol',
    build: (pages) => inheritedResourcesBook(pages),
  },
  { label: 'fuente pesada compartida', build: (pages) => sharedFontBook(pages) },
  { label: 'formularios anidados en cadena', build: (pages) => nestedFormsBook(pages) },
  { label: 'escaneado sin recursos compartidos', build: (pages) => scannedBook(pages) },
]
