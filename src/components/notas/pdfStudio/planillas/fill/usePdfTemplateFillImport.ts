import { useState } from 'react'
import type { TemplateFillImportValues } from './pdfTemplateFillImport'
import { parseTemplateFillValues } from './pdfTemplateFillImport'

export type TemplateFillImportFeedback = {
  tone: 'success' | 'error'
  message: string
}

export function usePdfTemplateFillImport(
  applyValues: (values: TemplateFillImportValues) => number,
) {
  const [importFeedback, setImportFeedback] = useState<TemplateFillImportFeedback | null>(
    null,
  )

  async function importTemplateValues(file: File) {
    try {
      const values = parseTemplateFillValues(await file.text())
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
    } catch (err) {
      setImportFeedback({
        tone: 'error',
        message: err instanceof Error ? err.message : 'No se pudo importar el archivo.',
      })
    }
  }

  return { importFeedback, importTemplateValues }
}
