import type { PdfFormFieldKind } from '../../../lib/pdfStudio/model/model'
import { clamp } from './editorStyle'

export type InitialFormFieldStyle = {
  sizeRatio?: number
}

export type InitialFormFieldBox = {
  xRatio: number
  yRatio: number
  wRatio: number
  hRatio: number
}

export const DEFAULT_FORM_FIELD_SIZE_RATIO = 0.04

const DEFAULT_X_RATIO = 0.2
const DEFAULT_Y_RATIO = 0.42

export function initialTextFieldBoxFromStyle(
  style: InitialFormFieldStyle = {},
): InitialFormFieldBox {
  const sizeRatio = style.sizeRatio ?? DEFAULT_FORM_FIELD_SIZE_RATIO
  return {
    xRatio: DEFAULT_X_RATIO,
    yRatio: DEFAULT_Y_RATIO,
    wRatio: clamp(Number((sizeRatio * 5.5 + 0.04).toFixed(3)), 0.18, 0.32),
    hRatio: clamp(Number((sizeRatio * 1.1 + 0.004).toFixed(3)), 0.026, 0.07),
  }
}

export function initialFieldBox(
  kind: PdfFormFieldKind,
  style?: InitialFormFieldStyle,
): InitialFormFieldBox {
  if (kind === 'checkbox' || kind === 'radio') {
    return { xRatio: 0.24, yRatio: DEFAULT_Y_RATIO, wRatio: 0.045, hRatio: 0.045 }
  }
  if (kind === 'signature') {
    return { xRatio: 0.22, yRatio: DEFAULT_Y_RATIO, wRatio: 0.32, hRatio: 0.11 }
  }
  return initialTextFieldBoxFromStyle(style)
}
