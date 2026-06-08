import { useState } from 'react'
import type { PdfDoc, PdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
import {
  detectHorizontalRunsFromImage,
  suggestTextFieldsFromHorizontalRuns,
} from '../../../../lib/pdfStudio/forms/formFieldSuggestions'

export function usePdfTextEditorFormSuggestions({
  currentPage,
  doc,
  formFields,
  onAddSuggested,
}: {
  currentPage: number
  doc: PdfDoc
  formFields: PdfFormFieldDraft[]
  onAddSuggested: (fields: PdfFormFieldDraft[]) => number
}) {
  const [status, setStatus] = useState<string | null>(null)

  async function suggestCurrentPage() {
    const activePage = doc.pages[currentPage]
    if (!activePage) return
    const sheet = document.querySelector<HTMLElement>(
      `[data-pdf-editor-sheet="${currentPage}"]`,
    )
    const image = sheet?.querySelector<HTMLImageElement>('img')
    if (!image?.src) {
      setStatus('La página aún se está cargando.')
      return
    }
    setStatus('Buscando espacios vacíos…')
    try {
      const { runs, width, height } = await detectHorizontalRunsFromImage(image.src)
      const suggestions = suggestTextFieldsFromHorizontalRuns({
        pageId: activePage.id,
        pageWidth: width,
        pageHeight: height,
        runs,
        existingFields: formFields,
      }).slice(0, 12)
      const count = onAddSuggested(suggestions)
      setStatus(
        count > 0
          ? `${count} ${count === 1 ? 'casillero sugerido' : 'casilleros sugeridos'}.`
          : 'No encontramos líneas vacías claras en esta página.',
      )
    } catch {
      setStatus('No pudimos analizar visualmente esta página.')
    }
  }

  return { status, suggestCurrentPage }
}
