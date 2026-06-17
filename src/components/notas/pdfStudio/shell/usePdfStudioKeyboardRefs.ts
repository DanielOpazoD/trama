import { useRef } from 'react'
import type { PdfDoc } from '../../../../lib/pdfStudio/model/model'

export function usePdfStudioKeyboardRefs({
  doc,
  selectedIndices,
  selectAll,
}: {
  doc: PdfDoc
  selectedIndices: number[]
  selectAll: () => void
}) {
  const selectedIndicesRef = useRef(selectedIndices)
  selectedIndicesRef.current = selectedIndices
  const docRef = useRef(doc)
  docRef.current = doc
  const selectAllRef = useRef(selectAll)
  selectAllRef.current = selectAll
  const pageClipboardRef = useRef<PdfDoc | null>(null)

  return { docRef, pageClipboardRef, selectedIndicesRef, selectAllRef }
}
