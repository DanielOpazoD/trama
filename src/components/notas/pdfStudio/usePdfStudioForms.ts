import { useState } from 'react'
import {
  getSource,
  replacePdfSourceFile,
  type PdfDoc,
  type PdfSource,
} from '../../../lib/pdfStudio/model'
import {
  fillPdfFormInWorker,
  inspectPdfFormInWorker,
} from '../../../lib/pdfStudio/pdfFormWorkerClient'
import type {
  PdfFormFieldInfo,
  PdfFormFieldValue,
  PdfFormFillValues,
} from '../../../lib/pdfStudio/pdfForms'
import { useToast } from '../../../state'

export type PdfStudioDetectedForm = {
  sourceId: string
  fileName: string
  fields: PdfFormFieldInfo[]
  values: PdfFormFillValues
}

function isPdfSource(
  source: PdfSource | undefined,
): source is PdfSource & { kind: 'pdf' } {
  return source?.kind === 'pdf'
}

function initialFieldValue(value: PdfFormFieldValue): string | boolean {
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.join(', ')
  return value ?? ''
}

function filledFileName(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '') + '.pdf'
}

export function usePdfStudioForms(
  doc: PdfDoc,
  commit: (next: PdfDoc | ((prev: PdfDoc) => PdfDoc)) => void,
) {
  const toast = useToast()
  const [formSummary, setFormSummary] = useState<string | null>(null)
  const [forms, setForms] = useState<PdfStudioDetectedForm[]>([])

  async function inspectForms() {
    const pdfSources = new Map(
      doc.pages
        .map((page) => getSource(doc, page.sourceId))
        .filter(isPdfSource)
        .map((source) => [source.id, source]),
    )
    if (pdfSources.size === 0) {
      const message = 'No hay PDFs importados para revisar formularios.'
      setFormSummary(message)
      toast.show({ message, tone: 'default' })
      return
    }

    try {
      const inspections = await Promise.all(
        Array.from(pdfSources.values()).map(async (source) => ({
          source,
          inspection: await inspectPdfFormInWorker(source.file),
        })),
      )
      const totalFields = inspections.reduce(
        (count, item) => count + item.inspection.fieldCount,
        0,
      )
      if (totalFields === 0) {
        const message = 'No se detectaron campos de formulario en los PDFs importados.'
        setFormSummary(message)
        setForms([])
        toast.show({ message, tone: 'default' })
        return
      }
      setForms(
        inspections
          .filter((item) => item.inspection.fieldCount > 0)
          .map((item) => ({
            sourceId: item.source.id,
            fileName: item.source.file.name,
            fields: item.inspection.fields,
            values: Object.fromEntries(
              item.inspection.fields.map((field) => [
                field.name,
                initialFieldValue(field.value),
              ]),
            ),
          })),
      )
      const names = inspections
        .filter((item) => item.inspection.fieldCount > 0)
        .map((item) => `${item.source.file.name}: ${item.inspection.fieldCount}`)
        .join(' · ')
      const message = `${totalFields} campos de formulario detectados. ${names}`
      setFormSummary(message)
      toast.show({ message, tone: 'default' })
    } catch (err) {
      const message =
        err instanceof Error
          ? `No se pudo revisar formularios: ${err.message}`
          : 'No se pudo revisar formularios.'
      setFormSummary(message)
      toast.show({ message, tone: 'error' })
    }
  }

  function updateFormValue(sourceId: string, fieldName: string, value: string | boolean) {
    setForms((current) =>
      current.map((form) =>
        form.sourceId === sourceId
          ? { ...form, values: { ...form.values, [fieldName]: value } }
          : form,
      ),
    )
  }

  async function applyForms(flatten: boolean) {
    if (forms.length === 0) return
    try {
      const filled = await Promise.all(
        forms.map(async (form) => {
          const source = getSource(doc, form.sourceId)
          if (!isPdfSource(source)) return null
          const { blob } = await fillPdfFormInWorker(source.file, form.values, {
            flatten,
          })
          return {
            sourceId: form.sourceId,
            file: new File([blob], filledFileName(source.file.name), {
              type: 'application/pdf',
            }),
          }
        }),
      )
      commit((current) =>
        filled.reduce(
          (next, item) =>
            item ? replacePdfSourceFile(next, item.sourceId, item.file) : next,
          current,
        ),
      )
      const mode = flatten ? 'aplanado' : 'editable'
      const message = `Formulario aplicado como ${mode}.`
      setFormSummary(message)
      toast.show({ message, tone: 'default' })
    } catch (err) {
      const message =
        err instanceof Error
          ? `No se pudo aplicar el formulario: ${err.message}`
          : 'No se pudo aplicar el formulario.'
      setFormSummary(message)
      toast.show({ message, tone: 'error' })
    }
  }

  function clearForms() {
    setForms([])
    setFormSummary(null)
  }

  return { applyForms, clearForms, formSummary, forms, inspectForms, updateFormValue }
}
