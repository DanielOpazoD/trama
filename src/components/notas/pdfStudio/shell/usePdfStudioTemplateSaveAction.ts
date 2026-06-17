import { isPdfTemplate, type PdfDoc } from '../../../../lib/pdfStudio/model/model'

export function usePdfStudioTemplateSaveAction({
  doc,
  empty,
  enabled,
  setPanelCollapsed,
  setSaveTemplateSignal,
  setTextPage,
}: {
  doc: PdfDoc
  empty: boolean
  enabled: boolean
  setPanelCollapsed: (collapsed: boolean) => void
  setSaveTemplateSignal: (update: (signal: number) => number) => void
  setTextPage: (page: number) => void
}) {
  return () => {
    if (!enabled || empty) return
    if (!isPdfTemplate(doc)) return setTextPage(0)
    setPanelCollapsed(false)
    setSaveTemplateSignal((signal) => signal + 1)
  }
}
