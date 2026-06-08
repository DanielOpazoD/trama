import type {
  PdfFormFieldDraft,
  PdfFormValue,
} from '../../../../../lib/pdfStudio/model/model'
import { FORM_FIELD_EMPTY_HINT } from '../pdfFormFieldStyle'

function valueAsText(value: PdfFormValue): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join(', ')
  return ''
}

export function valueAsFillText(value: PdfFormValue): string {
  const text = valueAsText(value)
  return text === FORM_FIELD_EMPTY_HINT ? '' : text
}

export function isTemplateFieldFilled(field: PdfFormFieldDraft): boolean {
  if (field.fieldKind === 'checkbox' || field.fieldKind === 'radio') {
    return field.value === true || valueAsFillText(field.value).trim().length > 0
  }
  return valueAsFillText(field.value).trim().length > 0
}

export function fillProgressForTemplateFields(fields: PdfFormFieldDraft[]) {
  const total = fields.length
  const pending = fields.filter((field) => !isTemplateFieldFilled(field)).length
  return { completed: total - pending, pending, total }
}

export function rawValueAsText(value: PdfFormValue): string {
  return valueAsText(value)
}
