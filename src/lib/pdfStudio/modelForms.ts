import { nextId, nextIdNumber } from './modelIds'
import type { PdfDoc, PdfFormFieldDraft, PdfFormValue, PdfPage } from './modelTypes'

export function pruneFormFields(
  formFields: PdfFormFieldDraft[] | undefined,
  pages: PdfPage[],
): PdfFormFieldDraft[] {
  const used = new Set(pages.map((p) => p.id))
  return (formFields ?? []).filter((field) => used.has(field.pageId))
}

export function makePdfFormFieldDraft(
  init: Omit<PdfFormFieldDraft, 'id'>,
): PdfFormFieldDraft {
  return { ...normalizeFormFieldBox(init), id: nextId('f') }
}

export function clonePdfFormField(
  field: PdfFormFieldDraft,
  pageId = field.pageId,
): PdfFormFieldDraft {
  return {
    ...field,
    id: nextId('f'),
    pageId,
    name: `${field.name}_copia_${nextIdNumber()}`,
  }
}

export function addPdfFormField(doc: PdfDoc, field: PdfFormFieldDraft): PdfDoc {
  if (!doc.pages.some((page) => page.id === field.pageId)) return doc
  return { ...doc, formFields: [...(doc.formFields ?? []), normalizeFormFieldBox(field)] }
}

export function renamePdfFormField(doc: PdfDoc, id: string, name: string): PdfDoc {
  const clean = name.trim()
  if (!clean) return doc
  return updatePdfFormField(doc, id, (field) => ({ ...field, name: clean }))
}

export function setPdfFormFieldValue(
  doc: PdfDoc,
  id: string,
  value: PdfFormValue,
): PdfDoc {
  return updatePdfFormField(doc, id, (field) => ({ ...field, value }))
}

export function translatePdfFormField(
  doc: PdfDoc,
  id: string,
  dx: number,
  dy: number,
): PdfDoc {
  return updatePdfFormField(doc, id, (field) =>
    normalizeFormFieldBox({
      ...field,
      xRatio: field.xRatio + dx,
      yRatio: field.yRatio + dy,
    }),
  )
}

export function resizePdfFormField(
  doc: PdfDoc,
  id: string,
  box: Pick<PdfFormFieldDraft, 'xRatio' | 'yRatio' | 'wRatio' | 'hRatio'>,
): PdfDoc {
  return updatePdfFormField(doc, id, (field) =>
    normalizeFormFieldBox({ ...field, ...box }),
  )
}

export function deletePdfFormField(doc: PdfDoc, id: string): PdfDoc {
  const formFields = (doc.formFields ?? []).filter((field) => field.id !== id)
  return formFields.length === (doc.formFields ?? []).length
    ? doc
    : { ...doc, formFields }
}

function updatePdfFormField(
  doc: PdfDoc,
  id: string,
  fn: (field: PdfFormFieldDraft) => PdfFormFieldDraft,
): PdfDoc {
  const formFields = doc.formFields ?? []
  let changed = false
  const next = formFields.map((field) => {
    if (field.id !== id) return field
    changed = true
    return fn(field)
  })
  return changed ? { ...doc, formFields: next } : doc
}

function normalizeFormFieldBox<
  T extends Pick<PdfFormFieldDraft, 'xRatio' | 'yRatio' | 'wRatio' | 'hRatio'>,
>(field: T): T {
  const minW = 0.018
  const minH = 0.018
  const xRatio = Math.min(1 - minW, Math.max(0, field.xRatio))
  const yRatio = Math.min(1 - minH, Math.max(0, field.yRatio))
  return {
    ...field,
    xRatio,
    yRatio,
    wRatio: Math.min(1 - xRatio, Math.max(minW, field.wRatio)),
    hRatio: Math.min(1 - yRatio, Math.max(minH, field.hRatio)),
  }
}
