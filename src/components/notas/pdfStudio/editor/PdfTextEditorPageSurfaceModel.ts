export type PdfTextEditorPageSurfaceMode = 'edit' | 'design' | 'fill'

export function pdfTextEditorPageSurfacePermissions(mode: PdfTextEditorPageSurfaceMode) {
  const fillMode = mode === 'fill'
  const canEditAnnotations = mode === 'edit' || mode === 'design'
  return {
    canEditAnnotations,
    canToggleXMarks: canEditAnnotations || fillMode,
    fillMode,
  }
}
