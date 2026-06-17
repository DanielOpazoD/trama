import type { DocSettings, PdfDoc } from '../../../../lib/pdfStudio/model/model'

type UpdateSettings = (settings: DocSettings) => void

export function usePdfStudioDocumentSettings(
  doc: PdfDoc,
  updateSettings: UpdateSettings,
) {
  const settings = doc.settings
  const setSettings = (next: Partial<DocSettings>) =>
    updateSettings({ ...settings, ...next })

  return {
    footerText: settings?.footer?.text ?? '',
    headerText: settings?.header?.text ?? '',
    imagesPerPage: settings?.imageLayout?.imagesPerPage ?? 1,
    pageNumbers: settings?.pageNumbers,
    watermarkText: settings?.watermark?.text ?? '',
    setFooter: (text: string) =>
      setSettings({ footer: text.trim() ? { text } : undefined }),
    setHeader: (text: string) =>
      setSettings({ header: text.trim() ? { text } : undefined }),
    setImagesPerPage: (
      imagesPerPage: NonNullable<DocSettings['imageLayout']>['imagesPerPage'],
    ) => setSettings({ imageLayout: { imagesPerPage } }),
    setPageNumbers: (pageNumbers: DocSettings['pageNumbers']) =>
      setSettings({ pageNumbers }),
    setWatermark: (text: string) =>
      setSettings({ watermark: text.trim() ? { text } : undefined }),
  }
}
