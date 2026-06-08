export function pdfTextEditorBodyClass(fillMode: boolean): string {
  return fillMode
    ? 'min-h-0 flex flex-1 flex-col md:flex-row'
    : 'min-h-0 flex flex-1 flex-col'
}
