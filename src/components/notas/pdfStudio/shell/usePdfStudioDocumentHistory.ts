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

/**
 * Historial del documento. Puede vivir FUERA del componente.
 *
 * Imprenta se desmonta al salir de su sección (`key={section}` en NotasWorld),
 * así que un historial puramente interno se destruye al volver a Notas. Eso
 * hacía que enviar un segundo recorte a Imprenta lo encontrara vacío: cada
 * envío empezaba un documento desde cero en vez de sumar páginas al que estaba
 * en curso. Recibiendo el estado desde arriba, el documento sobrevive.
 *
 * Sin `external` mantiene su propio estado, que es lo que quieren los tests y
 * cualquier montaje aislado.
 */
export type ExternalDocumentHistory = {
  history: History<PdfDoc>
  setHistory: Dispatch<SetStateAction<History<PdfDoc>>>
}

export function usePdfStudioDocumentHistory(external?: ExternalDocumentHistory): {
  history: History<PdfDoc>
  setHistory: Dispatch<SetStateAction<History<PdfDoc>>>
  doc: PdfDoc
  commit: (next: PdfDoc | ((prev: PdfDoc) => PdfDoc)) => void
  updateSettings: (settings: DocSettings) => void
  updateTitle: (title: string) => void
} {
  const propio = useState<History<PdfDoc>>(() => initHistory(emptyDoc()))
  const history = external?.history ?? propio[0]
  const setHistory = external?.setHistory ?? propio[1]
  const doc = history.present
  // `setHistory` va en las dependencias: cuando llega por `external` ya no es
  // el setter estable de `useState`, así que omitirlo dejaría los callbacks
  // atados al primero que se recibió.
  const commit = useCallback(
    (next: PdfDoc | ((prev: PdfDoc) => PdfDoc)) => {
      setHistory((h) => {
        const value = typeof next === 'function' ? next(h.present) : next
        return pushHistory(h, value)
      })
    },
    [setHistory],
  )
  const updateSettings = useCallback(
    (settings: DocSettings) => {
      setHistory((h) => ({ ...h, present: setDocSettings(h.present, settings) }))
    },
    [setHistory],
  )
  // El renombre no pasa por el historial (como los settings): renombrar no es
  // un paso de edición que se deshaga con Cmd+Z.
  const updateTitle = useCallback(
    (title: string) => {
      setHistory((h) => ({ ...h, present: setDocTitle(h.present, title) }))
    },
    [setHistory],
  )

  return { history, setHistory, doc, commit, updateSettings, updateTitle }
}
