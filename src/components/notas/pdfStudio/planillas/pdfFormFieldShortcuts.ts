import {
  clonePdfFormField,
  translatePdfFormField,
  type PdfDoc,
  type PdfFormFieldDraft,
} from '../../../../lib/pdfStudio/model/model'
import { uniqueFieldName } from './pdfTextEditorFormDefaults'

export type FormFieldShortcutInput = {
  fields: PdfFormFieldDraft[]
  selectedIds: string[]
  clipboard: PdfFormFieldDraft[]
  selectableIds: string[]
  key: string
  mod: boolean
  shift: boolean
}

export type FormFieldShortcutResult = {
  fields: PdfFormFieldDraft[]
  selectedIds: string[]
  clipboard: PdfFormFieldDraft[]
  handled: boolean
}

function selectedFields(fields: PdfFormFieldDraft[], ids: string[]) {
  const selected = new Set(ids)
  return fields.filter((field) => selected.has(field.id))
}

function offsetField(field: PdfFormFieldDraft, fields: PdfFormFieldDraft[]) {
  const copied = clonePdfFormField(field)
  return {
    ...copied,
    name: uniqueFieldName(copied.name, fields),
    xRatio: Math.min(1 - copied.wRatio, copied.xRatio + 0.025),
    yRatio: Math.min(1 - copied.hRatio, copied.yRatio + 0.025),
  }
}

function moveField(field: PdfFormFieldDraft, dx: number, dy: number) {
  const doc: PdfDoc = {
    sources: [],
    pages: [
      {
        id: field.pageId,
        kind: 'image',
        sourceId: 's',
        annotations: [],
        rotationQuarters: 0,
      },
    ],
    formFields: [field],
  }
  return translatePdfFormField(doc, field.id, dx, dy).formFields?.[0] ?? field
}

export function reduceFormFieldShortcut({
  fields,
  selectedIds,
  clipboard,
  selectableIds,
  key,
  mod,
  shift,
}: FormFieldShortcutInput): FormFieldShortcutResult {
  const normalizedKey = key.toLowerCase()
  const current = selectedFields(fields, selectedIds)

  if (mod && normalizedKey === 'a') {
    return {
      fields,
      selectedIds: selectableIds,
      clipboard,
      handled: selectableIds.length > 0,
    }
  }

  if (mod && normalizedKey === 'v') {
    if (clipboard.length === 0) return { fields, selectedIds, clipboard, handled: false }
    const next = [...fields]
    const pasted = clipboard.map((field) => {
      const copy = offsetField(field, next)
      next.push(copy)
      return copy
    })
    return {
      fields: next,
      selectedIds: pasted.map((field) => field.id),
      clipboard,
      handled: true,
    }
  }

  if (current.length === 0) return { fields, selectedIds, clipboard, handled: false }

  if (mod && normalizedKey === 'c') {
    return { fields, selectedIds, clipboard: current, handled: true }
  }

  if (mod && normalizedKey === 'x') {
    const selected = new Set(selectedIds)
    return {
      fields: fields.filter((field) => !selected.has(field.id)),
      selectedIds: [],
      clipboard: current,
      handled: true,
    }
  }

  if (mod && normalizedKey === 'd') {
    const next = [...fields]
    const copies = current.map((field) => {
      const copy = offsetField(field, next)
      next.push(copy)
      return copy
    })
    return {
      fields: next,
      selectedIds: copies.map((field) => field.id),
      clipboard,
      handled: true,
    }
  }

  if (key === 'Delete' || key === 'Backspace') {
    const selected = new Set(selectedIds)
    return {
      fields: fields.filter((field) => !selected.has(field.id)),
      selectedIds: [],
      clipboard,
      handled: true,
    }
  }

  if (key.startsWith('Arrow')) {
    const step = shift ? 0.025 : 0.005
    const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0
    const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0
    const selected = new Set(selectedIds)
    return {
      fields: fields.map((field) =>
        selected.has(field.id) ? moveField(field, dx, dy) : field,
      ),
      selectedIds,
      clipboard,
      handled: true,
    }
  }

  return { fields, selectedIds, clipboard, handled: false }
}
