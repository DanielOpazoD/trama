import type {
  PdfFormFieldInfo,
  PdfFormFillValues,
} from '../../../../lib/pdfStudio/forms/pdfForms'
import type { PdfPage } from '../../../../lib/pdfStudio/model/model'
import type { VisualPdfFormWidget } from './FormFieldLayer'

export type DetectedPdfFormForCanvas = {
  sourceId: string
  fields: PdfFormFieldInfo[]
  values: PdfFormFillValues
}

export function visualWidgetsForPage(
  page: PdfPage,
  forms: DetectedPdfFormForCanvas[],
): VisualPdfFormWidget[] {
  if (page.kind !== 'pdf') return []
  const widgets: VisualPdfFormWidget[] = []

  for (const form of forms) {
    if (form.sourceId !== page.sourceId) continue
    for (const field of form.fields) {
      for (const widget of field.widgets) {
        if (widget.pageIndex !== page.pageIndex) continue
        widgets.push({
          id: `${form.sourceId}:${field.name}:${widget.widgetIndex}`,
          sourceId: form.sourceId,
          fieldName: field.name,
          type: field.type,
          value: form.values[field.name] ?? field.value,
          options: field.options,
          readOnly: field.readOnly,
          xRatio: widget.xRatio,
          yRatio: widget.yRatio,
          wRatio: widget.wRatio,
          hRatio: widget.hRatio,
        })
      }
    }
  }

  return widgets
}
