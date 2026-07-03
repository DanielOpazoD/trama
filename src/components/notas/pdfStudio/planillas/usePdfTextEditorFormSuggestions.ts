import { useState } from 'react'
import type { PdfDoc, PdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
import {
  detectHorizontalRunsFromImage,
  suggestTextFieldsFromHorizontalRuns,
} from '../../../../lib/pdfStudio/forms/formFieldSuggestions'
import { labelSuggestedFields } from '../../../../lib/pdfStudio/forms/formFieldLabeling'
import { extractPageTextItems } from '../../../../lib/pdfStudio/render/pdfRender'

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
      let suggestions = suggestTextFieldsFromHorizontalRuns({
        pageId: activePage.id,
        pageWidth: width,
        pageHeight: height,
        runs,
        existingFields: formFields,
      }).slice(0, 12)
      // Con capa de texto (PDF vectorial): la etiqueta impresa a la izquierda
      // nombra la variable e infiere el tipo; los subrayados de texto ya
      // escrito se descartan. Escaneos/imágenes siguen con nombres genéricos.
      if (activePage.kind === 'pdf') {
        try {
          const source = doc.sources.find((s) => s.id === activePage.sourceId)
          if (source) {
            const items = await extractPageTextItems(source.file, activePage.pageIndex)
            if (items.length > 0) {
              suggestions = labelSuggestedFields({ fields: suggestions, items })
            }
          }
        } catch {
          // Sin capa de texto legible: las sugerencias genéricas bastan.
        }
      }
      const named = suggestions.filter((field) => !/^campo_\d+$/.test(field.name)).length
      const count = onAddSuggested(suggestions)
      setStatus(
        count > 0
          ? `${count} ${count === 1 ? 'casillero sugerido' : 'casilleros sugeridos'}${
              named > 0 ? ` (${named} con nombre del formulario)` : ''
            }.`
          : 'No encontramos líneas vacías claras en esta página.',
      )
    } catch {
      setStatus('No pudimos analizar visualmente esta página.')
    }
  }

  return { status, suggestCurrentPage }
}
