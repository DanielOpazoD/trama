import { useRef, useState } from 'react'
import type { AssembleOptions } from '../../../../lib/pdfStudio/assemble/assemble'
import { assemblePdfInWorker } from '../../../../lib/pdfStudio/export/exportWorkerClient'
import { canExport, type PdfDoc } from '../../../../lib/pdfStudio/model/model'
import { writePdfFormFieldsInWorker } from '../../../../lib/pdfStudio/forms/pdfFormWorkerClient'
import { downloadBlob } from '../../../../lib/downloadBlob'
import { useToast } from '../../../../state'
import { type SavedDoc } from '../../../../lib/pdfStudio/render/persistence'
import { exportPdfName } from './pdfStudioFileUtils'
import {
  describePdfExportError,
  pdfExportPipelineProgressLabel,
  pdfExportProgressLabel,
} from './pdfExportFeedback'

export function usePdfStudioExport({
  compression = 'balanced',
}: {
  compression?: AssembleOptions['compression']
} = {}) {
  const toast = useToast()
  const abortRef = useRef<AbortController | null>(null)
  const [saving, setSaving] = useState(false)
  const [exportStatus, setExportStatus] = useState<string | null>(null)

  async function assembleOrToast(
    target: PdfDoc,
    options: { flattenFormFields?: boolean } = {},
  ): Promise<Blob | null> {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setExportStatus(pdfExportProgressLabel(target.pages.length))
    try {
      const { blob, skipped, warnings } = await assemblePdfInWorker(target, {
        compression,
        onProgress: (event) => setExportStatus(pdfExportPipelineProgressLabel(event)),
        signal: controller.signal,
      })
      ;(warnings ?? []).forEach((warning) =>
        toast.show({
          message: warning.message,
          tone: 'default',
        }),
      )
      if (skipped.length > 0) {
        toast.show({
          message: `Se saltearon ${skipped.length} archivo(s): ${skipped
            .map((s) => s.name)
            .join(', ')}.`,
          tone: 'error',
        })
      }
      if (!target.formFields || target.formFields.length === 0) return blob
      setExportStatus('Escribiendo campos de formulario…')
      const { blob: withForms } = await writePdfFormFieldsInWorker(
        new File([blob], 'trama.pdf', { type: 'application/pdf' }),
        target.formFields,
        target.pages.map((page) => page.id),
        { flatten: options.flattenFormFields ?? false },
        { signal: controller.signal },
      )
      return withForms
    } catch (err) {
      toast.show({
        message: describePdfExportError(err),
        tone: 'error',
      })
      return null
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  async function downloadSaved(s: SavedDoc) {
    try {
      const blob = await assembleOrToast(s.doc)
      if (blob) downloadBlob(blob, `${s.name || 'creacion'}.pdf`)
    } finally {
      setExportStatus(null)
    }
  }

  // "Guardar PDF" DESCARGA el archivo directamente. Antes abría el PDF en una
  // pestaña nueva (visor del navegador) y eso fallaba en varios navegadores
  // (bloqueador de pop-ups, y Safari ni siquiera navega a un `blob:` en pestaña
  // nueva) → el usuario clickeaba y "no pasaba nada". Descargar es lo que el
  // botón promete y funciona igual en todos lados; para imprimir, se abre el
  // archivo descargado.
  async function downloadPdf(
    target: PdfDoc,
    kind?: string,
    options: { flattenFormFields?: boolean } = {},
  ) {
    if (!canExport(target) || saving) return
    setSaving(true)
    try {
      const blob = await assembleOrToast(target, options)
      if (!blob) return
      downloadBlob(blob, exportPdfName(undefined, kind))
      toast.show({ message: 'PDF descargado.', tone: 'success' })
    } finally {
      setExportStatus(null)
      setSaving(false)
    }
  }

  // Alias histórico: "Guardar PDF" / exportar selección / planilla usan este
  // nombre. Hoy es idéntico a descargar (ver downloadPdf).
  const exportPdf = downloadPdf

  function cancelExport() {
    abortRef.current?.abort()
  }

  return {
    assembleOrToast,
    cancelExport,
    downloadPdf,
    downloadSaved,
    exportPdf,
    exportStatus,
    saving,
  }
}
