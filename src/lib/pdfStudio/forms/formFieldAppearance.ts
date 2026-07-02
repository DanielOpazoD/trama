import type { PdfFormFieldAlign, PdfFormFieldDraft } from '../model/modelTypes'

export type RgbTuple = [number, number, number]

/** Apariencia exportable de un casillero, en valores planos (0..1) listos para
 *  `rgb(...)` de pdf-lib. Solo incluye lo que el usuario fijó: lo demás queda
 *  transparente para no tapar el PDF base. */
export type FormFieldAppearanceValues = {
  textColor?: RgbTuple
  backgroundColor?: RgbTuple
  borderColor?: RgbTuple
  borderWidth?: number
  align?: PdfFormFieldAlign
}

/** Grosor del borde exportado cuando el casillero define color de borde. */
export const FORM_FIELD_EXPORT_BORDER_WIDTH = 1

/** `#rrggbb` → [r, g, b] en 0..1, o null si el hex no es válido. */
export function hexToRgb01(hex: string | undefined): RgbTuple | null {
  if (!hex) return null
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1]!, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function formFieldAppearanceValues(
  field: Pick<PdfFormFieldDraft, 'color' | 'bgColor' | 'borderColor' | 'align'>,
): FormFieldAppearanceValues {
  const textColor = hexToRgb01(field.color)
  const backgroundColor = hexToRgb01(field.bgColor)
  const borderColor = hexToRgb01(field.borderColor)
  return {
    ...(textColor ? { textColor } : null),
    ...(backgroundColor ? { backgroundColor } : null),
    ...(borderColor
      ? { borderColor, borderWidth: FORM_FIELD_EXPORT_BORDER_WIDTH }
      : null),
    ...(field.align ? { align: field.align } : null),
  }
}
