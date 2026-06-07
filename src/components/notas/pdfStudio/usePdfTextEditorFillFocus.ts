import { useCallback, useState } from 'react'
import type { PdfFormFieldDraft } from '../../../lib/pdfStudio/model'

export function usePdfTextEditorFillFocus({
  goToPage,
  pageIndexById,
}: {
  goToPage: (pageIndex: number) => void
  pageIndexById: Record<string, number>
}) {
  const [activeFillFieldId, setActiveFillFieldId] = useState<string | null>(null)
  const jumpToFormField = useCallback(
    (field: PdfFormFieldDraft) => {
      setActiveFillFieldId(field.id)
      const targetPage = pageIndexById[field.pageId]
      if (targetPage == null) return
      goToPage(targetPage)
      window.setTimeout(() => {
        const control = document.querySelector<HTMLElement>(
          `[data-form-field-control="${field.id}"]`,
        )
        control?.focus()
      }, 80)
    },
    [goToPage, pageIndexById],
  )

  return { activeFillFieldId, jumpToFormField, setActiveFillFieldId }
}
