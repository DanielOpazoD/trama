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
 * Anotación vectorial superpuesta a una página. Es una **unión discriminada** por
 * `kind`: hoy `text` (texto) y `highlight` (resaltado), y crecerá con el resto del
 * "estudio de marcado" (lápiz, formas, firma/imagen). Posición y tamaño SIEMPRE
 * como RATIOS del tamaño de página (0..1) → independientes de la resolución: el
 * mismo dato sirve para el preview (px) y para pdf-lib (puntos). El ensamblado
 * (`assemble`) despacha el dibujo por `kind`.
 */
type AnnotationBase = {
  id: string
  /** Opacidad 0..1 (default 1). Opcional para no romper borradores previos. */
  opacity?: number
}

/**
 * Texto vectorial (`drawText`). `yRatio` es el TOPE del texto desde arriba; el
 * ensamblado lo convierte a la baseline desde abajo que usa pdf-lib.
 */
export type TextAnnotation = AnnotationBase & {
  kind: 'text'
  text: string
  xRatio: number
  yRatio: number
  /** Tamaño de fuente como fracción del alto de página (p. ej. 0.04). */
  sizeRatio: number
  /** Color en hex `#rrggbb`. */
  color: string
  font: PdfFontKind
  bold: boolean
  /** Rotación en grados HORARIOS (default 0). Opcional (compat). */
  rotation?: number
}

/** Resaltado: rectángulo translúcido (`drawRectangle`). `(x,y)` = esquina sup-izq. */
export type HighlightAnnotation = AnnotationBase & {
  kind: 'highlight'
  xRatio: number
  yRatio: number
  wRatio: number
  hRatio: number
  /** Color en hex `#rrggbb`. */
  color: string
}

/** Cualquier anotación de una página (unión discriminada por `kind`). */
export type Annotation = TextAnnotation | HighlightAnnotation

export type PdfPage = {
  id: string
  annotations: Annotation[]
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

/** Quita varias páginas (por índice) y descarta los sources huérfanos. */
export function deletePages(doc: PdfDoc, indices: number[]): PdfDoc {
  if (indices.length === 0) return doc
  const drop = new Set(indices)
  const pages = doc.pages.filter((_, i) => !drop.has(i))
  if (pages.length === doc.pages.length) return doc // nada en rango → no-op
  return { pages, sources: pruneSources(doc.sources, pages) }
}

/** Quita una página y descarta los sources que quedaron sin páginas. */
export function deletePage(doc: PdfDoc, index: number): PdfDoc {
  return deletePages(doc, [index])
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

/** Rota varias páginas `delta` cuartos de vuelta horarios (normaliza a 0..3). */
export function rotatePages(doc: PdfDoc, indices: number[], delta: number): PdfDoc {
  if (indices.length === 0) return doc
  const set = new Set(indices)
  const norm = (q: number) => (((q + delta) % 4) + 4) % 4
  let changed = false
  const pages = doc.pages.map((p, i) => {
    if (!set.has(i)) return p
    const rotationQuarters = norm(p.rotationQuarters)
    if (rotationQuarters === p.rotationQuarters) return p
    changed = true
    return { ...p, rotationQuarters }
  })
  return changed ? { ...doc, pages } : doc
}

/** Rota una página `delta` cuartos de vuelta horarios (normaliza a 0..3). */
export function rotatePage(doc: PdfDoc, index: number, delta: number): PdfDoc {
  return rotatePages(doc, [index], delta)
}

/**
 * Inserta una copia de cada página indicada justo DESPUÉS de ella (mismo source,
 * sin re-importar). Las anotaciones se copian con ids nuevos para que editar una
 * copia no toque el original. Recorre una sola vez → seguro ante el corrimiento
 * de índices. Sirve para 1 página (menú) o varias (selección).
 */
export function duplicatePages(doc: PdfDoc, indices: number[]): PdfDoc {
  if (indices.length === 0) return doc
  const set = new Set(indices)
  let any = false
  const pages: PdfPage[] = []
  doc.pages.forEach((p, i) => {
    pages.push(p)
    if (set.has(i)) {
      any = true
      pages.push({
        ...p,
        id: nextId('p'),
        annotations: p.annotations.map((a) => ({ ...a, id: nextId('a') })),
      })
    }
  })
  return any ? { ...doc, pages } : doc
}

/**
 * Nuevo documento con SÓLO las páginas indicadas (en el orden del documento),
 * descartando los sources huérfanos. Sirve para extraer/dividir: ensamblar este
 * subdocumento da un PDF con esas páginas. Reusa los ids existentes (no recrea).
 */
export function subsetDoc(doc: PdfDoc, indices: number[]): PdfDoc {
  const keep = new Set(indices)
  const pages = doc.pages.filter((_, i) => keep.has(i))
  return { pages, sources: pruneSources(doc.sources, pages) }
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

// ── Anotaciones (texto, resaltado, …) ─────────────────────────────────────

/** Crea una anotación de TEXTO con id propio (la UI provee el resto). */
export function makeTextAnnotation(
  init: Omit<TextAnnotation, 'id' | 'kind'>,
): TextAnnotation {
  return { ...init, id: nextId('t'), kind: 'text' }
}

/** Crea una anotación de RESALTADO (rectángulo translúcido) con id propio. */
export function makeHighlightAnnotation(
  init: Omit<HighlightAnnotation, 'id' | 'kind'>,
): HighlightAnnotation {
  return { ...init, id: nextId('a'), kind: 'highlight' }
}

/** Type guard: ¿es una anotación de texto? */
export function isTextAnnotation(a: Annotation): a is TextAnnotation {
  return a.kind === 'text'
}

/**
 * Normaliza un documento restaurado: a las anotaciones de borradores VIEJOS (sin
 * `kind`, de antes de la unión) les pone `kind: 'text'`, para que la unión las
 * reconozca y el ensamblado las dibuje. Puro; idempotente.
 */
export function normalizeDoc(doc: PdfDoc): PdfDoc {
  return {
    ...doc,
    pages: doc.pages.map((p) => ({
      ...p,
      annotations: p.annotations.map((a) =>
        (a as { kind?: string }).kind ? a : ({ ...a, kind: 'text' } as Annotation),
      ),
    })),
  }
}

/**
 * Reemplaza TODAS las anotaciones de una página. El editor mantiene la lista de
 * forma local (agregar/mover/editar/borrar) y la confirma de una sola vez; por
 * eso una sola op de reemplazo en lugar de add/update/remove granulares.
 */
export function setPageAnnotations(
  doc: PdfDoc,
  index: number,
  annotations: Annotation[],
): PdfDoc {
  if (index < 0 || index >= doc.pages.length) return doc
  const pages = [...doc.pages]
  const page = pages[index]
  if (!page) return doc
  pages[index] = { ...page, annotations }
  return { ...doc, pages }
}

/**
 * Aplica de una vez un mapa `índice→anotaciones` (las páginas que el modal editó)
 * sobre el documento. Las páginas no presentes en el mapa quedan iguales. Sirve
 * para confirmar todo el trabajo del editor en un solo commit de historial.
 */
export function applyEdits(doc: PdfDoc, edits: Record<number, Annotation[]>): PdfDoc {
  let next = doc
  for (const [idx, anns] of Object.entries(edits)) {
    next = setPageAnnotations(next, Number(idx), anns)
  }
  return next
}

/** ¿La página tiene anotaciones superpuestas (de cualquier tipo)? */
export function pageHasAnnotations(page: PdfPage): boolean {
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

/**
 * Stack CSS de la fuente REAL para que el preview sea WYSIWYG con el PDF: sans →
 * Inter y serif → Spectral (las que la app ya carga y que el ensamblado EMBEBE),
 * mono → Courier (estándar, la app no trae monoespaciada).
 */
export function previewFontFamily(font: PdfFontKind): string {
  if (font === 'serif') return "Spectral, 'Iowan Old Style', Palatino, Georgia, serif"
  if (font === 'mono') return "'Courier New', Courier, monospace"
  return 'Inter, system-ui, -apple-system, sans-serif'
}

/** Familias cuya tipografía REAL se embebe en el PDF (las demás usan estándar). */
export function isEmbeddableFont(font: PdfFontKind): boolean {
  return font === 'sans' || font === 'serif'
}

/**
 * Interlineado del preview y del modelo de baseline. El editor pinta el texto con
 * `line-height: TEXT_LINE_HEIGHT`; el ensamblado usa el mismo valor para que la
 * baseline del PDF caiga donde la pinta el navegador.
 */
export const TEXT_LINE_HEIGHT = 1.15

/**
 * Métricas verticales REALES (ascender/descender ÷ unitsPerEm) de cada familia,
 * leídas de los archivos de fuente. Sirven para posicionar la baseline igual que
 * el line-box del navegador (ver `baselineDropEm`). Inter y Spectral son los WOFF
 * embebidos; Courier (mono) son las métricas de la estándar de PDF.
 */
const FONT_VMETRICS: Record<PdfFontKind, { ascent: number; descent: number }> = {
  sans: { ascent: 2728 / 2816, descent: 680 / 2816 }, // Inter
  serif: { ascent: 1059 / 1000, descent: 463 / 1000 }, // Spectral
  mono: { ascent: 629 / 1000, descent: 157 / 1000 }, // Courier (estándar)
}

/**
 * Fracción del tamaño de fuente desde el TOPE de la caja de texto hasta la
 * baseline, modelando el line-box CSS (`line-height` = `TEXT_LINE_HEIGHT`):
 * `lh/2 + (ascent − descent)/2`. Reemplaza al `heightAtSize` de pdf-lib, que es
 * inconsistente entre fuentes estándar y embebidas. Pura → testeable.
 */
export function baselineDropEm(font: PdfFontKind): number {
  const m = FONT_VMETRICS[font]
  return TEXT_LINE_HEIGHT / 2 + (m.ascent - m.descent) / 2
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
