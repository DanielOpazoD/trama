import type { PdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'

export function orderFormFieldsForFill(
  fields: PdfFormFieldDraft[],
  pageIndexById: Record<string, number>,
): PdfFormFieldDraft[] {
  return [...fields].sort((a, b) => {
    const pageA = pageIndexById[a.pageId] ?? Number.MAX_SAFE_INTEGER
    const pageB = pageIndexById[b.pageId] ?? Number.MAX_SAFE_INTEGER
    if (pageA !== pageB) return pageA - pageB
    if (Math.abs(a.yRatio - b.yRatio) > 0.01) return a.yRatio - b.yRatio
    if (Math.abs(a.xRatio - b.xRatio) > 0.01) return a.xRatio - b.xRatio
    return a.name.localeCompare(b.name, 'es')
  })
}

export function orderFormFieldsForPage(
  fields: PdfFormFieldDraft[],
  pageId: string,
  pageIndex: number,
): PdfFormFieldDraft[] {
  return orderFormFieldsForFill(
    fields.filter((field) => field.pageId === pageId),
    { [pageId]: pageIndex },
  )
}
