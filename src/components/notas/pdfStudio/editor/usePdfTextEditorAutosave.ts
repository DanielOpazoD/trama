import { useEffect, useRef } from 'react'
import type {
  Annotation,
  DocSettings,
  PdfFormFieldDraft,
} from '../../../../lib/pdfStudio/model/model'
import type { PdfTextEditorResult } from './pdfTextEditorResult'

/** Espera desde el último cambio antes de proteger el borrador del editor. */
export const PDF_EDITOR_AUTOSAVE_DELAY_MS = 900

/**
 * Autosave en vivo del editor modal: mientras se diseña, empuja las ediciones
 * (anotaciones + casilleros + ajustes) hacia el autosave local del estudio con
 * debounce. Sin esto, cerrar la pestaña con el editor abierto perdía toda la
 * sesión de diseño: el borrador de IndexedDB solo conocía el documento tal como
 * estaba al abrir el modal. El montaje no dispara guardado (aún no hay cambios).
 */
export function usePdfTextEditorAutosave({
  docSettings,
  edited,
  enabled,
  formFields,
  onAutosave,
  xMarkSize,
  xMarkStroke,
}: {
  docSettings: DocSettings | undefined
  edited: Record<number, Annotation[]>
  enabled: boolean
  formFields: PdfFormFieldDraft[]
  onAutosave?: (edits: PdfTextEditorResult) => void
  xMarkSize: number
  xMarkStroke: number
}) {
  const onAutosaveRef = useRef(onAutosave)
  onAutosaveRef.current = onAutosave
  const pristineRef = useRef(true)

  useEffect(() => {
    if (!enabled || !onAutosaveRef.current) return
    if (pristineRef.current) {
      pristineRef.current = false
      return
    }
    const t = window.setTimeout(() => {
      onAutosaveRef.current?.({
        annotations: edited,
        formFields,
        settings: { ...docSettings, xMarkSize, xMarkStroke },
      })
    }, PDF_EDITOR_AUTOSAVE_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [docSettings, edited, enabled, formFields, xMarkSize, xMarkStroke])
}
