import {
  previewFontFamily,
  type PdfFormFieldDraft,
  type PdfFontKind,
} from '../../../lib/pdfStudio/model'
import type { CSSProperties } from 'react'
import type { TextStyle } from './editorStyle'
import { FORM_FIELD_EMPTY_HINT } from '../../../lib/pdfStudio/formFieldConstants'

export const DEFAULT_FORM_FIELD_SIZE_RATIO = 0.04
export { FORM_FIELD_EMPTY_HINT }

export type FormFieldTextStyle = Pick<TextStyle, 'font' | 'sizeRatio' | 'bold'>

export function formFieldTextStyleFromEditor(style: TextStyle): FormFieldTextStyle {
  return {
    font: style.font,
    sizeRatio: style.sizeRatio,
    bold: style.bold,
  }
}

export function formFieldTextStyle(field: PdfFormFieldDraft): FormFieldTextStyle {
  return {
    font: field.font ?? 'sans',
    sizeRatio: field.sizeRatio ?? DEFAULT_FORM_FIELD_SIZE_RATIO,
    bold: field.bold ?? false,
  }
}

export function formFieldTextCss(
  field: PdfFormFieldDraft,
  pageHeightPx: number,
): CSSProperties {
  const style = formFieldTextStyle(field)
  return {
    fontFamily: previewFontFamily(style.font as PdfFontKind),
    fontSize: `${Math.max(8, style.sizeRatio * pageHeightPx)}px`,
    fontWeight: style.bold ? 700 : 400,
  }
}

export function patchFormFieldTextStyle(
  field: PdfFormFieldDraft,
  patch: Partial<TextStyle>,
): PdfFormFieldDraft {
  return {
    ...field,
    font: patch.font ?? field.font,
    sizeRatio: patch.sizeRatio ?? field.sizeRatio,
    bold: patch.bold ?? field.bold,
  }
}
