import { useRef, type Dispatch, type SetStateAction } from 'react'
import type { PdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'

const HISTORY_LIMIT = 50

/**
 * Historial de deshacer/rehacer de los casilleros (⌘Z en diseño). Los cambios
 * discretos pasan por `commitFields` (snapshot + set); los gestos continuos
 * (arrastrar/redimensionar) toman UN snapshot al empezar con
 * `beginFieldsGesture` y mueven con el setter crudo. Escribir texto o renombrar
 * no se snapshotea por tecla: el undo opera sobre estructura y estilo.
 */
export function usePdfTextEditorFormHistory({
  fields,
  setFields,
}: {
  fields: PdfFormFieldDraft[]
  setFields: Dispatch<SetStateAction<PdfFormFieldDraft[]>>
}) {
  const fieldsRef = useRef(fields)
  fieldsRef.current = fields
  const pastRef = useRef<PdfFormFieldDraft[][]>([])
  const futureRef = useRef<PdfFormFieldDraft[][]>([])

  function snapshot(current: PdfFormFieldDraft[]) {
    pastRef.current.push(current)
    if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift()
    futureRef.current = []
  }

  /** Setter con historia: úsalo para operaciones discretas. */
  const commitFields: Dispatch<SetStateAction<PdfFormFieldDraft[]>> = (action) => {
    snapshot(fieldsRef.current)
    setFields(action)
  }

  /** Un snapshot al iniciar un gesto continuo (drag/resize). */
  function beginFieldsGesture() {
    snapshot(fieldsRef.current)
  }

  /** Deshace (o rehace) el último cambio de casilleros. Devuelve false si no
   *  hay nada que deshacer — el caller puede caer al historial de anotaciones. */
  function undoFields(redo = false): boolean {
    const source = redo ? futureRef.current : pastRef.current
    const target = redo ? pastRef.current : futureRef.current
    const entry = source.pop()
    if (!entry) return false
    target.push(fieldsRef.current)
    setFields(entry)
    return true
  }

  return { beginFieldsGesture, commitFields, undoFields }
}
