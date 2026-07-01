import type { PdfFormFieldKind } from '../../../../lib/pdfStudio/model/model'

export type EditorToolbarContext = 'editor' | 'templateDesign'

export function isMacLikeUserAgent(userAgent: string | undefined): boolean {
  if (userAgent === undefined) return true
  return /Mac|iPhone|iPad|iPod/i.test(userAgent)
}

export function editorToolbarPrimaryInsertAction(context: EditorToolbarContext): {
  fieldKind: PdfFormFieldKind | null
  hint: string
  label: string
} {
  if (context === 'templateDesign') {
    return {
      fieldKind: 'text',
      hint: 'Crear un casillero rellenable',
      label: 'Crear casillero de texto',
    }
  }
  return {
    fieldKind: null,
    hint: 'Agregar un cuadro editable',
    label: 'Agregar cuadro de texto',
  }
}

export function editorToolbarContextCapabilities(context: EditorToolbarContext) {
  const canUsePdfMarkupTools = context !== 'templateDesign'
  return {
    canShowPdfMarkupTools: canUsePdfMarkupTools,
    canShowShapeTools: canUsePdfMarkupTools,
    canStampImage: canUsePdfMarkupTools,
  }
}
