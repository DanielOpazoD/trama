import type { PdfFormFieldDraft } from '../../../../../lib/pdfStudio/model/model'
import { valueAsFillText } from './pdfTemplateFillProgress'

/** Valores actuales de la copia como JSON `{ variable: valor }`: el mismo
 *  formato que acepta "Importar datos" (roundtrip exportar → importar). */
export function templateFillValuesJson(fields: PdfFormFieldDraft[]): string {
  return JSON.stringify(
    Object.fromEntries(
      fields.map((field) => [
        field.name,
        field.fieldKind === 'checkbox'
          ? field.value === true
          : valueAsFillText(field.value),
      ]),
    ),
    null,
    2,
  )
}
