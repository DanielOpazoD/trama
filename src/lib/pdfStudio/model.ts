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

/** Familia de fuente para el texto vectorial (mapea a fuentes estándar de PDF). */
export type PdfFontKind = 'sans' | 'serif' | 'mono'

/**
 * Texto vectorial superpuesto a una página (PR D). Posición y tamaño se guardan
 * como RATIOS del tamaño de la página (0..1) → independientes de la resolución:
 * el mismo dato sirve para el preview (px) y para pdf-lib (puntos). `yRatio` es
 * el TOPE del texto medido desde arriba (como en pantalla); el ensamblado lo
 * convierte a la baseline desde abajo que usa pdf-lib.
 */
export type TextAnnotation = {
  id: string
  text: string
  xRatio: number
  yRatio: number
  /** Tamaño de fuente como fracción del alto de página (p. ej. 0.04). */
  sizeRatio: number
  /** Color en hex `#rrggbb`. */
  color: string
  font: PdfFontKind
  bold: boolean
}

export type PdfPage = {
  id: string
  annotations: TextAnnotation[]
  /** Cuartos de vuelta horarios (0..3) aplicados a la página en la salida. */
  rotationQuarters: number
} & (
  | { kind: 'pdf'; sourceId: string; pageIndex: number }
  | { kind: 'image'; sourceId: string }
)

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
    annotations: [],
    rotationQuarters: 0,
  }))
  return { sources: [...doc.sources, source], pages: [...doc.pages, ...pages] }
}

/** Agrega una imagen como una página al final. */
export function addImageSource(doc: PdfDoc, file: File): PdfDoc {
  const sourceId = nextId('s')
  const source: PdfSource = { id: sourceId, kind: 'image', file, pageCount: 1 }
  const page: PdfPage = {
    id: nextId('p'),
    kind: 'image',
    sourceId,
    annotations: [],
    rotationQuarters: 0,
  }
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
  pages[index] = {
    id: nextId('p'),
    kind: 'image',
    sourceId,
    annotations: [],
    rotationQuarters: 0,
  }
  return { pages, sources: pruneSources([...doc.sources, source], pages) }
}

/** Rota una página `delta` cuartos de vuelta horarios (normaliza a 0..3). */
export function rotatePage(doc: PdfDoc, index: number, delta: number): PdfDoc {
  if (index < 0 || index >= doc.pages.length) return doc
  const pages = [...doc.pages]
  const page = pages[index]
  if (!page) return doc
  const rotationQuarters = (((page.rotationQuarters + delta) % 4) + 4) % 4
  pages[index] = { ...page, rotationQuarters }
  return { ...doc, pages }
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

// ── Texto vectorial (PR D) ────────────────────────────────────────────────

/** Crea una anotación de texto con id propio (la UI provee el resto). */
export function makeAnnotation(init: Omit<TextAnnotation, 'id'>): TextAnnotation {
  return { ...init, id: nextId('t') }
}

/**
 * Reemplaza TODAS las anotaciones de una página. El editor mantiene la lista de
 * forma local (agregar/mover/editar/borrar) y la confirma de una sola vez; por
 * eso una sola op de reemplazo en lugar de add/update/remove granulares.
 */
export function setPageAnnotations(
  doc: PdfDoc,
  index: number,
  annotations: TextAnnotation[],
): PdfDoc {
  if (index < 0 || index >= doc.pages.length) return doc
  const pages = [...doc.pages]
  const page = pages[index]
  if (!page) return doc
  pages[index] = { ...page, annotations }
  return { ...doc, pages }
}

/** ¿La página tiene texto superpuesto? */
export function pageHasText(page: PdfPage): boolean {
  return page.annotations.length > 0
}

/**
 * Nombre de la fuente ESTÁNDAR de PDF (base-14, sin embeber → render garantizado
 * en cualquier visor) para una familia + negrita. Coincide con los valores de
 * `StandardFonts` de pdf-lib.
 */
export function standardFontName(font: PdfFontKind, bold: boolean): string {
  if (font === 'serif') return bold ? 'Times-Bold' : 'Times-Roman'
  if (font === 'mono') return bold ? 'Courier-Bold' : 'Courier'
  return bold ? 'Helvetica-Bold' : 'Helvetica'
}

/** Stack CSS web-safe equivalente, para que el preview sea WYSIWYG con el PDF. */
export function previewFontFamily(font: PdfFontKind): string {
  if (font === 'serif') return "'Times New Roman', Times, serif"
  if (font === 'mono') return "'Courier New', Courier, monospace"
  return 'Helvetica, Arial, sans-serif'
}

/**
 * Convierte la posición/tamaño (ratios) de una anotación a PUNTOS del PDF.
 * Devuelve `x` (izquierda), `topY` (tope del texto medido desde ABAJO, como usa
 * pdf-lib) y `size`. La baseline final = `topY - ascent` (el ascent depende de
 * la fuente y lo aporta el ensamblado). Esta parte es pura → testeable, que es
 * la matemática más delicada del módulo.
 */
export function textBoxLayout(
  ann: TextAnnotation,
  pageWidth: number,
  pageHeight: number,
): { x: number; topY: number; size: number } {
  return {
    x: ann.xRatio * pageWidth,
    topY: pageHeight - ann.yRatio * pageHeight,
    size: ann.sizeRatio * pageHeight,
  }
}

/**
 * Tras restaurar un documento (p. ej. autoguardado en IndexedDB), continúa el
 * contador de ids más allá del máximo restaurado. Al recargar la página el
 * contador arranca en 0, así que sin esto los ids nuevos (`s1`, `p1`, `t1`…)
 * colisionarían con los del documento restaurado.
 */
export function reseedIds(doc: PdfDoc): void {
  let max = 0
  const consider = (id: string) => {
    const n = Number.parseInt(id.replace(/^\D+/, ''), 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  for (const s of doc.sources) consider(s.id)
  for (const p of doc.pages) {
    consider(p.id)
    for (const a of p.annotations) consider(a.id)
  }
  if (max > seq) seq = max
}
