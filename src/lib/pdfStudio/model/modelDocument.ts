import { cloneAnnotation } from './modelAnnotations'
import { clonePdfFormField, pruneFormFields } from './modelForms'
import { nextId, reseedIdCounter } from './modelIds'
import type { Annotation, DocSettings, PdfDoc, PdfPage, PdfSource } from './modelTypes'

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
  return { ...doc, sources: [...doc.sources, source], pages: [...doc.pages, ...pages] }
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
  return { ...doc, sources: [...doc.sources, source], pages: [...doc.pages, page] }
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

/** Nuevo documento con SÓLO las páginas indicadas, descartando sources huérfanos. */
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
 * Inserta en `doc` una copia de las páginas de `clip` en la posición `atIndex`.
 * Clona sources, páginas, anotaciones y campos con ids nuevos.
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
  return {
    ...doc,
    sources: [...doc.sources, ...sources],
    pages: [...doc.pages.slice(0, at), ...pages, ...doc.pages.slice(at)],
    formFields: [...(doc.formFields ?? []), ...formFields],
  }
}

export function pruneSources(sources: PdfSource[], pages: PdfPage[]): PdfSource[] {
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

/** Renombra el documento (vacío → sin título). Inmutable. */
export function setDocTitle(doc: PdfDoc, title: string): PdfDoc {
  const clean = title.trim()
  if ((doc.title ?? '') === clean) return doc
  return { ...doc, title: clean || undefined }
}

/** Clave estable para cachear la miniatura de una página. */
export function pageThumbKey(page: PdfPage): string {
  return page.kind === 'pdf'
    ? `${page.sourceId}:${page.pageIndex}`
    : `${page.sourceId}:img`
}

/** Normaliza borradores viejos y asegura `formFields`. */
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

/** Continúa el contador de ids más allá del máximo restaurado. */
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
