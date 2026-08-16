/**
 * Poda de `/Resources` antes de copiar páginas sueltas de un PDF grande.
 *
 * `copyPages` de pdf-lib baja a la página los atributos que HEREDA del árbol de
 * páginas, `/Resources` incluido. Si el productor colgó del nodo raíz un
 * `/Resources` con las imágenes y fuentes del libro entero, cada página copiada
 * se lleva el libro entero: 16 páginas de un libro de 600 pesaban 1,8 GB. Acá se
 * reemplaza ese diccionario por uno que sólo conserva lo que la página realmente
 * nombra.
 *
 * Sólo se podan `/XObject` y `/Font`: son las categorías donde están los bytes y
 * las únicas que se referencian SIEMPRE por nombre desde un content stream. Las
 * demás (ExtGState, ColorSpace, Shading, Pattern, Properties) son livianas y
 * pueden nombrarse desde el diccionario de otro recurso —una imagen que apunta a
 * su `/ColorSpace` por nombre—, así que se copian enteras.
 *
 * Los nombres se juntan por sobre-aproximación: cualquier token `/Nombre` de los
 * streams cuenta como usado, aunque venga de un comentario o de una cadena. Un
 * recurso de más pesa; uno de menos rompe la página.
 */
import type { PDFDict, PDFDocument, PDFPageLeaf, PDFStream } from 'pdf-lib'
import type { PdfLib } from '../pdfRuntime/pdfLibLoader'

/** Categorías de `/Resources` que se podan. El resto se copia tal cual. */
const PRUNABLE_CATEGORIES = new Set(['XObject', 'Font'])

/** Blancos y delimitadores PDF: cierran el token `/Nombre`. */
const NAME_TERMINATORS = new Set([
  0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20, 0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d,
  0x2f, 0x25,
])

const SLASH = 0x2f
const HASH = 0x23

/** Junta los `/Nombre` que aparecen en `bytes` (con escapes `#XX` resueltos). */
export function collectResourceNames(bytes: Uint8Array, into: Set<string>): void {
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== SLASH) continue
    let cursor = index + 1
    let name = ''
    while (cursor < bytes.length && !NAME_TERMINATORS.has(bytes[cursor]!)) {
      if (bytes[cursor] === HASH && cursor + 2 < bytes.length) {
        const code = Number.parseInt(
          String.fromCharCode(bytes[cursor + 1]!, bytes[cursor + 2]!),
          16,
        )
        if (!Number.isNaN(code)) {
          name += String.fromCharCode(code)
          cursor += 3
          continue
        }
      }
      name += String.fromCharCode(bytes[cursor]!)
      cursor += 1
    }
    if (name) into.add(name)
    index = cursor - 1
  }
}

function decodeStream(lib: PdfLib, stream: PDFStream): Uint8Array | null {
  if (stream instanceof lib.PDFRawStream) return lib.decodePDFRawStream(stream).decode()
  return stream.getContents()
}

/**
 * Resuelve una referencia indirecta. `lookupMaybe` sin tipos SIEMPRE lanza y con
 * tipos lanza cuando no coinciden, así que acá se resuelve suelto y se decide
 * con `instanceof`: una estructura inesperada tiene que poder no podar, no
 * romper.
 */
function resolve(doc: PDFDocument, value: unknown): unknown {
  return doc.context.lookup(value as never)
}

/** Diccionario en `key`, o `undefined` si ahí no hay un diccionario. */
function dictAt(lib: PdfLib, doc: PDFDocument, holder: PDFDict, key: string) {
  const value = resolve(doc, holder.get(lib.PDFName.of(key)))
  return value instanceof lib.PDFDict ? value : undefined
}

/** Streams de contenido de la página: uno solo o el array de trozos. */
function contentStreams(lib: PdfLib, doc: PDFDocument, node: PDFPageLeaf): PDFStream[] {
  const contents = resolve(doc, node.get(lib.PDFName.of('Contents')))
  if (contents instanceof lib.PDFStream) return [contents]
  if (!(contents instanceof lib.PDFArray)) return []
  const streams: PDFStream[] = []
  for (let index = 0; index < contents.size(); index += 1) {
    const chunk = resolve(doc, contents.get(index))
    if (chunk instanceof lib.PDFStream) streams.push(chunk)
  }
  return streams
}

/**
 * Apariencias de las anotaciones de la página. El PDF manda que un appearance
 * stream traiga su propio `/Resources`, pero archivos viejos lo dejan colgando
 * del de la página: sumar sus nombres cuesta poco y evita vaciar una firma o un
 * sello heredados.
 */
function appearanceStreams(
  lib: PdfLib,
  doc: PDFDocument,
  node: PDFPageLeaf,
): PDFStream[] {
  const annots = resolve(doc, node.get(lib.PDFName.of('Annots')))
  if (!(annots instanceof lib.PDFArray)) return []
  const streams: PDFStream[] = []
  for (let index = 0; index < annots.size(); index += 1) {
    const annot = resolve(doc, annots.get(index))
    if (!(annot instanceof lib.PDFDict)) continue
    const appearance = dictAt(lib, doc, annot, 'AP')
    if (!appearance) continue
    for (const [, state] of appearance.entries()) {
      const resolved = resolve(doc, state)
      if (resolved instanceof lib.PDFStream) streams.push(resolved)
      // `/N` puede ser un diccionario de estados (checkbox On/Off).
      else if (resolved instanceof lib.PDFDict) {
        for (const [, variant] of resolved.entries()) {
          const stream = resolve(doc, variant)
          if (stream instanceof lib.PDFStream) streams.push(stream)
        }
      }
    }
  }
  return streams
}

/**
 * Suma los nombres que usan los XObjects de formulario ya marcados como usados:
 * un formulario sin `/Resources` propio resuelve contra los de la página, así
 * que sus nombres cuentan igual.
 *
 * Se recorre por frontera y NO por vueltas contadas: un formulario puede nombrar
 * a otro que ya quedó atrás en el orden del diccionario, así que un tope de N
 * pasadas deja sin leer las cadenas más profundas —y lo que nombren se poda por
 * error—. Termina siempre porque `scanned` sólo crece y está acotado por el
 * número de entradas, así que un ciclo entre formularios no da vueltas.
 */
function expandWithNestedForms(
  lib: PdfLib,
  doc: PDFDocument,
  resources: PDFDict,
  used: Set<string>,
): boolean {
  const xobjects = dictAt(lib, doc, resources, 'XObject')
  if (!xobjects) return true
  const byName = new Map(
    xobjects.entries().map(([key, value]) => [key.decodeText(), value]),
  )
  const scanned = new Set<string>()
  for (;;) {
    const next = [...used].find((name) => byName.has(name) && !scanned.has(name))
    if (next === undefined) return true
    scanned.add(next)
    const xobject = resolve(doc, byName.get(next))
    if (!(xobject instanceof lib.PDFStream)) continue
    const subtype = xobject.dict.get(lib.PDFName.of('Subtype'))
    if (!(subtype instanceof lib.PDFName) || subtype.decodeText() !== 'Form') continue
    const bytes = decodeStream(lib, xobject)
    if (!bytes) return false
    collectResourceNames(bytes, used)
  }
}

/**
 * Reemplaza el `/Resources` de la página `pageIndex` de `doc` por uno podado.
 * Devuelve `true` si podó algo. Muta el documento FUENTE en memoria, que en
 * exportación es una copia efímera: nunca toca el archivo del usuario.
 *
 * Es una optimización, no una corrección: si algo no se puede leer con certeza
 * no poda nada y la exportación sigue igual que antes, sólo más pesada. Por eso
 * cualquier error se traga — un PDF con una estructura que pdf-lib no modela no
 * debe impedir exportarlo.
 */
export function prunePageResources(
  lib: PdfLib,
  doc: PDFDocument,
  pageIndex: number,
): boolean {
  try {
    const node = doc.getPage(pageIndex).node
    const inherited = resolve(
      doc,
      node.getInheritableAttribute(lib.PDFName.of('Resources')),
    )
    if (!(inherited instanceof lib.PDFDict)) return false
    const resources = inherited

    const streams = contentStreams(lib, doc, node)
    if (streams.length === 0) return false
    const used = new Set<string>()
    for (const stream of [...streams, ...appearanceStreams(lib, doc, node)]) {
      const bytes = decodeStream(lib, stream)
      if (!bytes) return false
      collectResourceNames(bytes, used)
    }
    if (!expandWithNestedForms(lib, doc, resources, used)) return false

    const pruned = doc.context.obj({})
    let dropped = 0
    for (const [key, value] of resources.entries()) {
      const resolved = PRUNABLE_CATEGORIES.has(key.decodeText())
        ? resolve(doc, value)
        : undefined
      const category = resolved instanceof lib.PDFDict ? resolved : undefined
      if (!category) {
        pruned.set(key, value)
        continue
      }
      const kept = doc.context.obj({})
      for (const [name, entry] of category.entries()) {
        if (used.has(name.decodeText())) kept.set(name, entry)
        else dropped += 1
      }
      pruned.set(key, kept)
    }
    if (dropped === 0) return false
    node.set(lib.PDFName.of('Resources'), pruned)
    return true
  } catch {
    return false
  }
}
