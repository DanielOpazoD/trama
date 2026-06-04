/**
 * Modelo PURO del editor de PDF (sin DOM, sin pdf.js/pdf-lib): un documento es
 * una lista ordenada de páginas, cada una proveniente de un PDF importado (una
 * página puntual) o de una imagen (la imagen entera = una página). Todas las
 * operaciones son inmutables y 100% testeables en node. El render de miniaturas
 * (pdf.js) y el ensamblado/exporte (pdf-lib) viven en archivos browser-only
 * aparte (`pdfRender.ts`, `assemble.ts`), excluidos del coverage.
 */

export type PdfSourceKind = 'pdf' | 'image'

export type PdfSource = {
  id: string
  kind: PdfSourceKind
  file: File
  /** PDF: cantidad de páginas; imagen: 1. */
  pageCount: number
}

export type PdfPage =
  | { id: string; kind: 'pdf'; sourceId: string; pageIndex: number }
  | { id: string; kind: 'image'; sourceId: string }

export type PdfDoc = {
  sources: PdfSource[]
  pages: PdfPage[]
}

// Contador monótono para ids opacos (mismo patrón que `layerSeq` del editor de
// imágenes). No afecta la pureza de las transformaciones del documento.
let seq = 0
const nextId = (prefix: string) => `${prefix}${(seq += 1)}`

export function emptyDoc(): PdfDoc {
  return { sources: [], pages: [] }
}

/** Agrega un PDF: una página por cada página del archivo, al final. */
export function addPdfSource(doc: PdfDoc, file: File, pageCount: number): PdfDoc {
  const count = Math.max(0, Math.floor(pageCount))
  if (count === 0) return doc
  const sourceId = nextId('s')
  const source: PdfSource = { id: sourceId, kind: 'pdf', file, pageCount: count }
  const pages: PdfPage[] = Array.from({ length: count }, (_, i) => ({
    id: nextId('p'),
    kind: 'pdf',
    sourceId,
    pageIndex: i,
  }))
  return { sources: [...doc.sources, source], pages: [...doc.pages, ...pages] }
}

/** Agrega una imagen como una página al final. */
export function addImageSource(doc: PdfDoc, file: File): PdfDoc {
  const sourceId = nextId('s')
  const source: PdfSource = { id: sourceId, kind: 'image', file, pageCount: 1 }
  const page: PdfPage = { id: nextId('p'), kind: 'image', sourceId }
  return { sources: [...doc.sources, source], pages: [...doc.pages, page] }
}

/** Mueve una página de `from` a `to` (índice arbitrario, para drag-and-drop). */
export function movePage(doc: PdfDoc, from: number, to: number): PdfDoc {
  const n = doc.pages.length
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return doc
  const pages = [...doc.pages]
  const [moved] = pages.splice(from, 1)
  if (!moved) return doc
  pages.splice(to, 0, moved)
  return { ...doc, pages }
}

/** Mueve una página un paso (botones ◄ ►). */
export function movePageByDelta(doc: PdfDoc, index: number, delta: -1 | 1): PdfDoc {
  return movePage(doc, index, index + delta)
}

/** Quita una página y descarta los sources que quedaron sin páginas. */
export function deletePage(doc: PdfDoc, index: number): PdfDoc {
  if (index < 0 || index >= doc.pages.length) return doc
  const pages = doc.pages.filter((_, i) => i !== index)
  return { pages, sources: pruneSources(doc.sources, pages) }
}

/**
 * Reemplaza una página por una imagen (la versión anotada): crea un source nuevo
 * de imagen y apunta la página a él, sin tocar el original. Descarta huérfanos.
 */
export function replacePageWithImage(doc: PdfDoc, index: number, file: File): PdfDoc {
  if (index < 0 || index >= doc.pages.length) return doc
  const sourceId = nextId('s')
  const source: PdfSource = { id: sourceId, kind: 'image', file, pageCount: 1 }
  const pages = [...doc.pages]
  pages[index] = { id: nextId('p'), kind: 'image', sourceId }
  return { pages, sources: pruneSources([...doc.sources, source], pages) }
}

function pruneSources(sources: PdfSource[], pages: PdfPage[]): PdfSource[] {
  const used = new Set(pages.map((p) => p.sourceId))
  return sources.filter((s) => used.has(s.id))
}

export function getSource(doc: PdfDoc, sourceId: string): PdfSource | undefined {
  return doc.sources.find((s) => s.id === sourceId)
}

export function canExport(doc: PdfDoc): boolean {
  return doc.pages.length > 0
}

/** Clave estable para cachear la miniatura de una página. */
export function pageThumbKey(page: PdfPage): string {
  return page.kind === 'pdf'
    ? `${page.sourceId}:${page.pageIndex}`
    : `${page.sourceId}:img`
}
