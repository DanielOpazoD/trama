import type {
  PdfFormFieldDraft,
  PdfFormFieldKind,
  PdfFormValue,
} from '../../../../../lib/pdfStudio/model/model'
import type { TemplateFillImportValues } from './pdfTemplateFillImport'

const normalizeImportKey = (value: string) => value.trim().toLowerCase()

function emptyValueForField(kind: PdfFormFieldKind): PdfFormValue {
  return kind === 'checkbox' ? false : kind === 'radio' ? null : ''
}

function importedValueForField(
  field: PdfFormFieldDraft,
  values: TemplateFillImportValues,
): PdfFormValue | undefined {
  const exact = values[field.name]
  const raw =
    exact ??
    Object.entries(values).find(
      ([name]) => normalizeImportKey(name) === normalizeImportKey(field.name),
    )?.[1]
  if (raw == null) return undefined
  if (field.fieldKind === 'checkbox') {
    if (typeof raw === 'boolean') return raw
    return /^(1|true|x|si|sí|yes|y)$/i.test(raw.trim())
  }
  return typeof raw === 'boolean' ? String(raw) : raw
}

export function clearTemplateFieldValues(
  fields: PdfFormFieldDraft[],
): PdfFormFieldDraft[] {
  return fields.map((field) => ({
    ...field,
    value: emptyValueForField(field.fieldKind),
  }))
}

export function applyTemplateFieldValues(
  fields: PdfFormFieldDraft[],
  values: TemplateFillImportValues,
): { fields: PdfFormFieldDraft[]; applied: number } {
  let applied = 0
  const next = fields.map((field) => {
    const value = importedValueForField(field, values)
    if (value === undefined) return field
    applied += 1
    return { ...field, value }
  })
  return { fields: next, applied }
}
