import { useRef, useState } from 'react'
import type { AssembleOptions } from '../../../lib/pdfStudio/assemble'
import { assemblePdfInWorker } from '../../../lib/pdfStudio/exportWorkerClient'
import { canExport, type PdfDoc } from '../../../lib/pdfStudio/model'
import { writePdfFormFieldsInWorker } from '../../../lib/pdfStudio/pdfFormWorkerClient'
import { openBlankPdfTab, showPdfInTab } from '../../../lib/pdfStudio/printPdf'
import { downloadBlob } from '../../../lib/downloadBlob'
import { useToast } from '../../../state'
import { type SavedDoc } from '../../../lib/pdfStudio/persistence'
import { exportPdfName, shouldDownloadPdfDirectly } from './pdfStudioFileUtils'
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

  async function assembleOrToast(target: PdfDoc): Promise<Blob | null> {
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
        { flatten: false },
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

  async function exportPdf(target: PdfDoc, kind?: string) {
    if (!canExport(target) || saving) return
    setSaving(true)
    const ios = shouldDownloadPdfDirectly()
    const viewer = ios ? null : openBlankPdfTab()
    try {
      const blob = await assembleOrToast(target)
      if (!blob) {
        viewer?.close()
        return
      }
      if (ios) {
        downloadBlob(blob, exportPdfName(undefined, kind))
        toast.show({
          message: 'Descargamos el PDF; ábrelo desde Archivos para imprimir.',
          tone: 'default',
        })
        return
      }
      showPdfInTab(viewer, blob, () => {
        downloadBlob(blob, exportPdfName(undefined, kind))
        toast.show({
          message: 'Tu navegador bloqueó la ventana; descargamos el PDF.',
          tone: 'default',
        })
      })
    } finally {
      setExportStatus(null)
      setSaving(false)
    }
  }

  async function downloadPdf(target: PdfDoc, kind?: string) {
    if (!canExport(target) || saving) return
    setSaving(true)
    try {
      const blob = await assembleOrToast(target)
      if (blob) downloadBlob(blob, exportPdfName(undefined, kind))
    } finally {
      setExportStatus(null)
      setSaving(false)
    }
  }

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
