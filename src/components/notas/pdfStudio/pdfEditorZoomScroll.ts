export type PdfEditorScrollAnchor = {
  pageIndex: number
  xRatio: number
  yRatio: number
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

function pdfEditorPages(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-pdf-editor-page]'))
}

function pdfEditorScrollAnchors(container: HTMLElement): HTMLElement[] {
  const sheets = Array.from(
    container.querySelectorAll<HTMLElement>('[data-pdf-editor-sheet]'),
  )
  return sheets.length > 0 ? sheets : pdfEditorPages(container)
}

function pageIndexForAnchor(element: HTMLElement): number {
  return Number(element.dataset.pdfEditorSheet ?? element.dataset.pdfEditorPage ?? 0)
}

export function capturePdfEditorScrollAnchor(
  container: HTMLElement | null,
): PdfEditorScrollAnchor | null {
  if (!container) return null
  const anchors = pdfEditorScrollAnchors(container)
  if (anchors.length === 0) return null

  const containerRect = container.getBoundingClientRect()
  const centerX = containerRect.left + container.clientWidth / 2
  const centerY = containerRect.top + container.clientHeight / 2
  let best: { element: HTMLElement; distance: number; rect: DOMRect } | null = null

  for (const element of anchors) {
    const rect = element.getBoundingClientRect()
    const nearestY = Math.min(rect.bottom, Math.max(rect.top, centerY))
    const nearestX = Math.min(rect.right, Math.max(rect.left, centerX))
    const distance = Math.hypot(centerX - nearestX, centerY - nearestY)
    if (!best || distance < best.distance) best = { element, distance, rect }
  }

  if (!best || best.rect.width <= 0 || best.rect.height <= 0) return null
  return {
    pageIndex: pageIndexForAnchor(best.element),
    xRatio: 0.5,
    yRatio:
      best.rect.height <= container.clientHeight
        ? 0.5
        : clamp01((centerY - best.rect.top) / best.rect.height),
  }
}

export function restorePdfEditorScrollAnchor(
  container: HTMLElement | null,
  anchor: PdfEditorScrollAnchor | null,
): void {
  if (!container || !anchor) return
  const target =
    container.querySelector<HTMLElement>(
      `[data-pdf-editor-sheet="${anchor.pageIndex}"]`,
    ) ??
    container.querySelector<HTMLElement>(`[data-pdf-editor-page="${anchor.pageIndex}"]`)
  if (!target) return

  const containerRect = container.getBoundingClientRect()
  const rect = target.getBoundingClientRect()
  const targetContentX =
    container.scrollLeft + (rect.left - containerRect.left) + rect.width * anchor.xRatio
  const targetContentY =
    container.scrollTop + (rect.top - containerRect.top) + rect.height * anchor.yRatio

  container.scrollLeft = targetContentX - container.clientWidth / 2
  container.scrollTop = targetContentY - container.clientHeight / 2
}

export function centerPdfEditorSheetHorizontally(
  container: HTMLElement | null,
  pageIndex: number,
): void {
  if (!container) return
  const target =
    container.querySelector<HTMLElement>(`[data-pdf-editor-sheet="${pageIndex}"]`) ??
    container.querySelector<HTMLElement>(`[data-pdf-editor-page="${pageIndex}"]`)
  if (!target) return

  const containerRect = container.getBoundingClientRect()
  const rect = target.getBoundingClientRect()
  const targetContentX =
    container.scrollLeft + (rect.left - containerRect.left) + rect.width / 2
  container.scrollLeft = targetContentX - container.clientWidth / 2
}
