/**
 * Modelo PURO del editor de PDF (sin DOM, sin pdf.js/pdf-lib): un documento es
 * una lista ordenada de páginas, cada una proveniente de un PDF importado (una
 * página puntual) o de una imagen (la imagen entera = una página). Todas las
 * operaciones son inmutables y 100% testeables en node. El render de miniaturas
 * (pdf.js) y el ensamblado/exporte (pdf-lib) viven en archivos browser-only
 * aparte (`pdfRender.ts`, `assemble.ts`), excluidos del coverage.
 */

import type {
  Annotation,
  DocSettings,
  HighlightAnnotation,
  ImageAnnotation,
  PdfDoc,
  PdfPage,
  PdfSource,
  RedactionAnnotation,
  ShapeAnnotation,
  TextAnnotation,
} from './modelTypes'

export type {
  Annotation,
  DocSettings,
  HighlightAnnotation,
  ImageAnnotation,
  ImageAsset,
  PdfDoc,
  PdfFormFieldDraft,
  PdfFormFieldKind,
  PdfFormValue,
  PdfFontKind,
  PdfPage,
  PdfSource,
  PdfSourceKind,
  RedactionAnnotation,
  ShapeAnnotation,
  ShapeKind,
  TextAnnotation,
} from './modelTypes'
export {
  baselineDropEm,
  isEmbeddableFont,
  previewFontFamily,
  standardFontName,
  TEXT_LINE_HEIGHT,
  textBoxLayout,
} from './modelText'
export {
  addPdfFormField,
  clonePdfFormField,
  deletePdfFormField,
  makePdfFormFieldDraft,
  renamePdfFormField,
  resizePdfFormField,
  setPdfFormFieldValue,
  translatePdfFormField,
} from './modelForms'
import { clonePdfFormField, pruneFormFields } from './modelForms'
import { nextId, reseedIdCounter } from './modelIds'

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
  return {
    ...doc,
    pages,
    sources: pruneSources(doc.sources, pages),
    formFields: pruneFormFields(doc.formFields, pages),
  }
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
  return {
    ...doc,
    pages,
    sources: pruneSources([...doc.sources, source], pages),
    formFields: pruneFormFields(doc.formFields, pages),
  }
}

/** Reemplaza el archivo de un source PDF preservando páginas, ids y anotaciones. */
export function replacePdfSourceFile(doc: PdfDoc, sourceId: string, file: File): PdfDoc {
  const source = doc.sources.find((s) => s.id === sourceId)
  if (!source || source.kind !== 'pdf') return doc
  return {
    ...doc,
    sources: doc.sources.map((s) => (s.id === sourceId ? { ...s, file } : s)),
  }
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
  const pageIdMap = new Map<string, string>()
  doc.pages.forEach((p, i) => {
    pages.push(p)
    if (set.has(i)) {
      any = true
      const pageId = nextId('p')
      pageIdMap.set(p.id, pageId)
      pages.push({
        ...p,
        id: pageId,
        annotations: p.annotations.map((a) => ({ ...a, id: nextId('a') })),
      })
    }
  })
  if (!any) return doc
  const clonedFields =
    doc.formFields?.flatMap((field) => {
      const pageId = pageIdMap.get(field.pageId)
      return pageId ? [clonePdfFormField(field, pageId)] : []
    }) ?? []
  return { ...doc, pages, formFields: [...(doc.formFields ?? []), ...clonedFields] }
}

/**
 * Nuevo documento con SÓLO las páginas indicadas (en el orden del documento),
 * descartando los sources huérfanos. Sirve para extraer/dividir: ensamblar este
 * subdocumento da un PDF con esas páginas. Reusa los ids existentes (no recrea).
 */
export function subsetDoc(doc: PdfDoc, indices: number[]): PdfDoc {
  const keep = new Set(indices)
  const pages = doc.pages.filter((_, i) => keep.has(i))
  return {
    ...doc,
    pages,
    sources: pruneSources(doc.sources, pages),
    formFields: pruneFormFields(doc.formFields, pages),
  }
}

/**
 * Inserta en `doc` una copia de las páginas de `clip` (un subdocumento, p. ej. el
 * que devuelve `subsetDoc`) en la posición `atIndex` (al final si se omite). Clona
 * sources y páginas con IDS NUEVOS y remapea `sourceId`, así pegar NO comparte ids
 * con el origen ni con lo ya presente — sirve para copiar/pegar páginas, incluso
 * después de cortar el original. Reutiliza los mismos `File` (no recodifica).
 * Inmutable; `clip` vacío es no-op.
 */
export function insertPages(doc: PdfDoc, clip: PdfDoc, atIndex?: number): PdfDoc {
  if (clip.pages.length === 0) return doc
  const idMap = new Map<string, string>()
  const sources: PdfSource[] = clip.sources.map((s) => {
    const id = nextId('s')
    idMap.set(s.id, id)
    return { ...s, id }
  })
  const pages: PdfPage[] = clip.pages.map((p) => ({
    ...p,
    id: nextId('p'),
    sourceId: idMap.get(p.sourceId) ?? p.sourceId,
    annotations: p.annotations.map((a) => cloneAnnotation(a)),
  }))
  const pageIdMap = new Map(clip.pages.map((p, i) => [p.id, pages[i]!.id]))
  const formFields =
    clip.formFields?.flatMap((field) => {
      const pageId = pageIdMap.get(field.pageId)
      return pageId ? [clonePdfFormField(field, pageId)] : []
    }) ?? []
  const n = doc.pages.length
  const at = atIndex == null ? n : Math.min(Math.max(0, atIndex), n)
  const nextPages = [...doc.pages.slice(0, at), ...pages, ...doc.pages.slice(at)]
  return {
    ...doc,
    sources: [...doc.sources, ...sources],
    pages: nextPages,
    formFields: [...(doc.formFields ?? []), ...formFields],
  }
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

/** Reemplaza los ajustes del documento (numeración/marca de agua). Inmutable. */
export function setDocSettings(doc: PdfDoc, settings: DocSettings): PdfDoc {
  return { ...doc, settings }
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

/** Crea una REDACCIÓN: intención de borrado seguro, no mero rectángulo visual. */
export function makeRedactionAnnotation(
  init: Omit<RedactionAnnotation, 'id' | 'kind' | 'opacity'>,
): RedactionAnnotation {
  return { ...init, id: nextId('r'), kind: 'redaction', opacity: 1 }
}

/** Crea una FORMA (línea/flecha/rect/óvalo) con id propio. */
export function makeShapeAnnotation(
  init: Omit<ShapeAnnotation, 'id' | 'kind'>,
): ShapeAnnotation {
  return { ...init, id: nextId('a'), kind: 'shape' }
}

/** Crea una IMAGEN estampada (firma/sello) con id propio. */
export function makeImageAnnotation(
  init: Omit<ImageAnnotation, 'id' | 'kind'>,
): ImageAnnotation {
  return { ...init, id: nextId('a'), kind: 'image' }
}

/**
 * Clona una anotación con un id NUEVO (mismo tipo y propiedades). Sirve para
 * copiar/pegar/duplicar anotaciones (en el editor o al pegar páginas) sin que la
 * copia comparta id con el original. Puro.
 */
export function cloneAnnotation(a: Annotation): Annotation {
  return a.kind === 'text' ? { ...a, id: nextId('t') } : { ...a, id: nextId('a') }
}

/**
 * Mueve una anotación `(dx, dy)` en ratios, acotando los anclajes a 0..1. Unifica
 * la geometría de los tres tipos (texto/resaltado usan `xRatio/yRatio`; las formas,
 * sus dos puntos) → arrastrar/flechas/pegar funcionan igual para todas. Puro.
 */
export function translateAnnotation(a: Annotation, dx: number, dy: number): Annotation {
  const c = (n: number) => Math.min(1, Math.max(0, n))
  if (a.kind === 'shape') {
    return {
      ...a,
      x0Ratio: c(a.x0Ratio + dx),
      y0Ratio: c(a.y0Ratio + dy),
      x1Ratio: c(a.x1Ratio + dx),
      y1Ratio: c(a.y1Ratio + dy),
    }
  }
  return { ...a, xRatio: c(a.xRatio + dx), yRatio: c(a.yRatio + dy) }
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
    formFields: doc.formFields ?? [],
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
  for (const field of doc.formFields ?? []) consider(field.id)
  reseedIdCounter(max)
}
