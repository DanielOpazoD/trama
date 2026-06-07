import type {
  PdfFormFieldDraft,
  PdfFormFieldKind,
  PdfFormValue,
} from '../../../lib/pdfStudio/model'

export function defaultFormValue(kind: PdfFormFieldKind): PdfFormValue {
  if (kind === 'checkbox') return false
  if (kind === 'radio') return null
  return ''
}

export function fieldNamePrefix(kind: PdfFormFieldKind): string {
  if (kind === 'date') return 'fecha'
  if (kind === 'checkbox') return 'checkbox'
  if (kind === 'radio') return 'radio'
  if (kind === 'signature') return 'firma'
  return 'campo'
}

export function initialFieldBox(kind: PdfFormFieldKind) {
  if (kind === 'checkbox' || kind === 'radio') {
    return { xRatio: 0.24, yRatio: 0.42, wRatio: 0.045, hRatio: 0.045 }
  }
  if (kind === 'signature') {
    return { xRatio: 0.22, yRatio: 0.42, wRatio: 0.32, hRatio: 0.11 }
  }
  return { xRatio: 0.2, yRatio: 0.42, wRatio: 0.32, hRatio: 0.055 }
}

export function uniqueFieldName(base: string, fields: PdfFormFieldDraft[]): string {
  const cleanBase = base.trim().replace(/\s+/g, '_') || 'campo'
  const used = new Set(fields.map((field) => field.name))
  if (!used.has(cleanBase)) return cleanBase
  let i = 2
  while (used.has(`${cleanBase}_${i}`)) i += 1
  return `${cleanBase}_${i}`
}
