import { useState } from 'react'
import type { TemplateFillImportValues } from './pdfTemplateFillImport'
import { parseTemplateFillRows, parseTemplateFillValues } from './pdfTemplateFillImport'

export type TemplateFillImportFeedback = {
  tone: 'success' | 'error'
  message: string
}

export function usePdfTemplateFillImport(
  applyValues: (values: TemplateFillImportValues) => number,
  /** Lote: recibe TODAS las filas del archivo (cuando hay más de una). */
  onRows?: (rows: TemplateFillImportValues[]) => void,
) {
  const [importFeedback, setImportFeedback] = useState<TemplateFillImportFeedback | null>(
    null,
  )

  function applyAndReport(values: TemplateFillImportValues) {
    const applied = applyValues(values)
    setImportFeedback(
      applied > 0
        ? {
            tone: 'success',
            message: `${applied} ${applied === 1 ? 'dato aplicado' : 'datos aplicados'}.`,
          }
        : {
            tone: 'error',
            message: 'El archivo no coincide con ningún nombre de casillero.',
          },
    )
  }

  async function importTemplateValues(file: File) {
    try {
      applyAndReport(parseTemplateFillValues(await file.text()))
    } catch (err) {
      setImportFeedback({
        tone: 'error',
        message: err instanceof Error ? err.message : 'No se pudo importar el archivo.',
      })
    }
  }

  /** Lote: con 1 sola fila degenera al import normal (rellena el formulario). */
  async function importTemplateBatch(file: File) {
    try {
      const rows = parseTemplateFillRows(await file.text())
      if (rows.length === 1) {
        applyAndReport(rows[0]!)
        return
      }
      setImportFeedback({
        tone: 'success',
        message: `Lote de ${rows.length} copias — abriendo la vista previa…`,
      })
      onRows?.(rows)
    } catch (err) {
      setImportFeedback({
        tone: 'error',
        message: err instanceof Error ? err.message : 'No se pudo importar el archivo.',
      })
    }
  }

  return { importFeedback, importTemplateValues, importTemplateBatch }
}
