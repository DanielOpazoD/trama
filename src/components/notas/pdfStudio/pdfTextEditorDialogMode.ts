export function pdfTextEditorDialogLabel({
  currentPage,
  designMode,
  fillMode,
}: {
  currentPage: number
  designMode: boolean
  fillMode: boolean
}) {
  if (fillMode) return 'Rellenar planilla'
  if (designMode) return 'Crear plantilla'
  return `Editar página ${currentPage + 1}`
}
