import { cloneAnnotation } from './modelAnnotations'
import { pruneSources } from './modelDocument'
import { clonePdfFormField, pruneFormFields } from './modelForms'
import { nextId } from './modelIds'
import type { PdfDoc, PdfPage } from './modelTypes'

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

/** Mueve varias páginas como un bloque al índice destino, preservando su orden. */
export function movePages(doc: PdfDoc, indices: number[], to: number): PdfDoc {
  const n = doc.pages.length
  if (indices.length === 0 || to < 0 || to >= n) return doc
  const selected = Array.from(
    new Set(indices.filter((index) => index >= 0 && index < n)),
  ).sort((a, b) => a - b)
  if (selected.length === 0 || selected.includes(to)) return doc
  const selectedSet = new Set(selected)
  const block = selected.map((index) => doc.pages[index]!)
  const rest = doc.pages.filter((_, index) => !selectedSet.has(index))
  const insertAt = Math.min(Math.max(0, to), rest.length)
  return {
    ...doc,
    pages: [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)],
  }
}

/** Quita varias páginas (por índice) y descarta los sources huérfanos. */
export function deletePages(doc: PdfDoc, indices: number[]): PdfDoc {
  if (indices.length === 0) return doc
  const drop = new Set(indices)
  const pages = doc.pages.filter((_, i) => !drop.has(i))
  if (pages.length === doc.pages.length) return doc
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

/** Inserta una copia de cada página indicada justo DESPUÉS de ella. */
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

/** Agrega `copies - 1` bloques completos de páginas al final del documento. */
export function repeatDocPages(doc: PdfDoc, copies: number): PdfDoc {
  const times = Math.floor(copies)
  if (times <= 1 || doc.pages.length === 0) return doc
  const pages = [...doc.pages]
  const formFields = [...(doc.formFields ?? [])]
  for (let copy = 1; copy < times; copy += 1) {
    const pageIdMap = new Map<string, string>()
    for (const page of doc.pages) {
      const id = nextId('p')
      pageIdMap.set(page.id, id)
      pages.push({
        ...page,
        id,
        annotations: page.annotations.map((a) => cloneAnnotation(a)),
      })
    }
    for (const field of doc.formFields ?? []) {
      const pageId = pageIdMap.get(field.pageId)
      if (pageId) formFields.push(clonePdfFormField(field, pageId))
    }
  }
  return { ...doc, pages, formFields }
}
