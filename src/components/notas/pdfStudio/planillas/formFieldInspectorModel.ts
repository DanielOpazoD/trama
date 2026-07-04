import type { PdfFormValue } from '../../../../lib/pdfStudio/model/model'

/** Tamaño de letra en puntos (alto carta = 792 pt): pasos de 1 pt y entrada exacta. */
export const PAGE_PT = 792
export const PT_MIN = 6
export const PT_MAX = 96

export type InspectorFlagsPatch = {
  required?: boolean
  readOnly?: boolean
  autoFill?: 'today' | undefined
}

export const inspectorValueAsText = (value: PdfFormValue): string =>
  typeof value === 'string' ? value : Array.isArray(value) ? value.join(', ') : ''
