import {
  previewFontFamily,
  type PdfFormFieldAlign,
  type PdfFormFieldDraft,
  type PdfFontKind,
} from '../../../../lib/pdfStudio/model/model'
import type { CSSProperties } from 'react'
import type { TextStyle } from '../editor/editorStyle'
import { FORM_FIELD_EMPTY_HINT } from '../../../../lib/pdfStudio/forms/formFieldConstants'
import { DEFAULT_FORM_FIELD_SIZE_RATIO } from './pdfFormFieldSizing'

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
    ...(field.color ? { color: field.color } : null),
    ...(field.align ? { textAlign: field.align } : null),
  }
}

/** Fondo/borde declarados del casillero, o undefined si conserva el chrome por
 *  defecto del modo. El grosor compensa el zoom igual que el frame base. */
export function formFieldChromeCss(
  field: Pick<PdfFormFieldDraft, 'bgColor' | 'borderColor'>,
  zoom = 1,
): CSSProperties | undefined {
  if (!field.bgColor && !field.borderColor) return undefined
  const k = 1 / Math.max(0.25, zoom)
  return {
    ...(field.bgColor ? { backgroundColor: field.bgColor } : null),
    ...(field.borderColor
      ? { borderColor: field.borderColor, borderStyle: 'solid', borderWidth: `${k}px` }
      : null),
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

/** Patch de estilo visual: `null` limpia la propiedad (vuelve al default del
 *  modo), `undefined` la deja como está. */
export type FormFieldVisualPatch = {
  color?: string | null
  bgColor?: string | null
  borderColor?: string | null
  align?: PdfFormFieldAlign | null
}

export function patchFormFieldVisual(
  field: PdfFormFieldDraft,
  patch: FormFieldVisualPatch,
): PdfFormFieldDraft {
  return {
    ...field,
    color: resolveVisual(field.color, patch.color),
    bgColor: resolveVisual(field.bgColor, patch.bgColor),
    borderColor: resolveVisual(field.borderColor, patch.borderColor),
    align: resolveVisual(field.align, patch.align),
  }
}

function resolveVisual<T>(
  current: T | undefined,
  next: T | null | undefined,
): T | undefined {
  if (next === undefined) return current
  return next ?? undefined
}
