import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import {
  emptyDoc,
  setDocSettings,
  setDocTitle,
  type DocSettings,
  type PdfDoc,
} from '../../../../lib/pdfStudio/model/model'
import {
  initHistory,
  pushHistory,
  type History,
} from '../../../../lib/pdfStudio/model/history'

export function usePdfStudioDocumentHistory(): {
  history: History<PdfDoc>
  setHistory: Dispatch<SetStateAction<History<PdfDoc>>>
  doc: PdfDoc
  commit: (next: PdfDoc | ((prev: PdfDoc) => PdfDoc)) => void
  updateSettings: (settings: DocSettings) => void
  updateTitle: (title: string) => void
} {
  const [history, setHistory] = useState<History<PdfDoc>>(() => initHistory(emptyDoc()))
  const doc = history.present
  const commit = useCallback((next: PdfDoc | ((prev: PdfDoc) => PdfDoc)) => {
    setHistory((h) => {
      const value = typeof next === 'function' ? next(h.present) : next
      return pushHistory(h, value)
    })
  }, [])
  const updateSettings = useCallback((settings: DocSettings) => {
    setHistory((h) => ({ ...h, present: setDocSettings(h.present, settings) }))
  }, [])
  // El renombre no pasa por el historial (como los settings): renombrar no es
  // un paso de edición que se deshaga con Cmd+Z.
  const updateTitle = useCallback((title: string) => {
    setHistory((h) => ({ ...h, present: setDocTitle(h.present, title) }))
  }, [])

  return { history, setHistory, doc, commit, updateSettings, updateTitle }
}
