import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { PdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
import { reduceFormFieldShortcut } from './pdfFormFieldShortcuts'

export function usePdfTextEditorFormShortcuts({
  clipboardRef,
  currentPageId,
  fields,
  selectedIds,
  setEditingId,
  setFields,
  setSelectedId,
  setSelectedIds,
}: {
  clipboardRef: { current: PdfFormFieldDraft[] }
  currentPageId: string | null
  fields: PdfFormFieldDraft[]
  selectedIds: string[]
  setEditingId: (id: string | null) => void
  setFields: Dispatch<SetStateAction<PdfFormFieldDraft[]>>
  setSelectedId: (id: string | null) => void
  setSelectedIds: Dispatch<SetStateAction<string[]>>
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, button') || target?.isContentEditable)
        return
      const result = reduceFormFieldShortcut({
        fields,
        selectedIds,
        clipboard: clipboardRef.current,
        selectableIds: fields.map((field) => field.id),
        currentPageId,
        key: e.key,
        mod: e.metaKey || e.ctrlKey,
        shift: e.shiftKey,
      })
      if (!result.handled) return
      e.preventDefault()
      clipboardRef.current = result.clipboard
      setFields(result.fields)
      setSelectedIds(result.selectedIds)
      setSelectedId(null)
      setEditingId(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [
    clipboardRef,
    currentPageId,
    fields,
    selectedIds,
    setEditingId,
    setFields,
    setSelectedId,
    setSelectedIds,
  ])
}
