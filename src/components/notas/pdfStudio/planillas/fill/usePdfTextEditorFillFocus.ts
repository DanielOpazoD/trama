import { useCallback, useState } from 'react'
import type { PdfFormFieldDraft } from '../../../../../lib/pdfStudio/model/model'

function formFieldControlSelector(id: string): string {
  return `[data-form-field-control="${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`
}

function selectTextIfPossible(control: HTMLElement) {
  if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) {
    return
  }
  if (control instanceof HTMLInputElement) {
    const selectableTypes = new Set(['', 'email', 'search', 'tel', 'text', 'url'])
    if (!selectableTypes.has(control.type)) return
  }
  control.select()
}

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
          formFieldControlSelector(field.id),
        )
        if (!control) return
        control.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' })
        control.focus({ preventScroll: true })
        selectTextIfPossible(control)
      }, 80)
    },
    [goToPage, pageIndexById],
  )

  return { activeFillFieldId, jumpToFormField, setActiveFillFieldId }
}
