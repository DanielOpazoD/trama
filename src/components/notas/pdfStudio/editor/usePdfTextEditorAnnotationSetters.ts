import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { Annotation, PdfDoc } from '../../../../lib/pdfStudio/model/model'
import { pushHistory, type History } from '../../../../lib/pdfStudio/model/history'

type PdfTextEditorHistory = History<Record<number, Annotation[]>>

/** Setters de anotaciones de la página activa: `setAnnotations` empuja al
 *  historial (⌘Z), `editLive` muta el presente sin historia (gestos en vivo). */
export function usePdfTextEditorAnnotationSetters({
  doc,
  pageRef,
  setHistory,
}: {
  doc: PdfDoc
  pageRef: { current: number }
  setHistory: Dispatch<SetStateAction<PdfTextEditorHistory>>
}) {
  const setAnnotations = useCallback(
    (fn: (list: Annotation[]) => Annotation[]) => {
      const i = pageRef.current
      setHistory((h) =>
        pushHistory(h, {
          ...h.present,
          [i]: fn(h.present[i] ?? doc.pages[i]?.annotations ?? []),
        }),
      )
    },
    [doc, pageRef, setHistory],
  )
  const editLive = useCallback(
    (fn: (list: Annotation[]) => Annotation[]) => {
      const i = pageRef.current
      setHistory((h) => ({
        ...h,
        present: {
          ...h.present,
          [i]: fn(h.present[i] ?? doc.pages[i]?.annotations ?? []),
        },
      }))
    },
    [doc, pageRef, setHistory],
  )
  return { editLive, setAnnotations }
}
