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
  /** Etiqueta VISIBLE del botón (corta). `label` sigue siendo el nombre
   *  accesible completo; esto es lo que se lee en la barra. La acción que
   *  crea contenido es la única etiquetada — por eso merece una palabra. */
  shortLabel: string
} {
  if (context === 'templateDesign') {
    return {
      fieldKind: 'text',
      hint: 'Crear un casillero rellenable · atajo: Shift + clic en la página',
      label: 'Crear casillero de texto',
      shortLabel: 'Casillero',
    }
  }
  return {
    fieldKind: null,
    hint: 'Agregar un cuadro editable',
    label: 'Agregar cuadro de texto',
    shortLabel: 'Texto',
  }
}

export function editorToolbarContextCapabilities(context: EditorToolbarContext) {
  const canUsePdfMarkupTools = context !== 'templateDesign'
  return {
    canShowPdfMarkupTools: canUsePdfMarkupTools,
    canShowShapeTools: canUsePdfMarkupTools,
    canStampImage: canUsePdfMarkupTools,
    // El header de diseño de planillas ya trae zoom: una sola lupa en pantalla.
    canShowToolbarZoom: canUsePdfMarkupTools,
  }
}
