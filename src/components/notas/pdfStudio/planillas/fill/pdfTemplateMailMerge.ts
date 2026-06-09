import {
  repeatDocPages,
  type PdfDoc,
  type PdfFormFieldDraft,
} from '../../../../../lib/pdfStudio/model/model'
import type { TemplateFillImportValues } from './pdfTemplateFillImport'
import { applyTemplateFieldValues } from './pdfTemplateFillValues'

/**
 * Construye el documento del LOTE (relleno en serie / mail-merge): una copia
 * completa de la planilla por cada fila, con los valores de ESA fila aplicados
 * a los casilleros de su copia (matching por nombre, case-insensitive — el
 * mismo del import de copia única). El resultado se ensambla con
 * `flattenFormFields: true` para que cada copia quede impresa con sus datos.
 *
 * Puro y testeable: la duplicación de bloques vive en el modelo
 * (`repeatDocPages`); acá solo se reparte cada fila a su bloque de páginas.
 */
export function buildMailMergeDoc(
  doc: PdfDoc,
  rows: TemplateFillImportValues[],
): { doc: PdfDoc; applied: number } {
  if (rows.length === 0 || doc.pages.length === 0) return { doc, applied: 0 }
  const originals = doc.formFields ?? []
  const merged = repeatDocPages(doc, rows.length)
  // repeatDocPages agrega los casilleros POR BLOQUES en el orden original:
  // [originales, clones copia 2, clones copia 3, …]. Los clones llevan nombre
  // único (`_copia_N`, exigencia de AcroForm), así que el matching por nombre
  // de columna se hace contra el nombre ORIGINAL de su posición y el nombre
  // único se conserva en el resultado.
  const allFields = merged.formFields ?? []
  let applied = 0
  const formFields: PdfFormFieldDraft[] = rows.flatMap((row, block) => {
    const slice = allFields.slice(
      block * originals.length,
      (block + 1) * originals.length,
    )
    const masked = slice.map((field, j) => ({ ...field, name: originals[j]!.name }))
    const result = applyTemplateFieldValues(masked, row)
    applied += result.applied
    return result.fields.map((field, j) => ({ ...field, name: slice[j]!.name }))
  })
  return { doc: { ...merged, formFields }, applied }
}
