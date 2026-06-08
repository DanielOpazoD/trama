export function readPdfTextEditorPageArea(el: HTMLElement): { w: number; h: number } {
  const scrollContainer = el.closest<HTMLElement>('[data-pdf-editor-scroll]')
  return {
    w: el.clientWidth,
    h: scrollContainer?.clientHeight ?? el.clientHeight,
  }
}
