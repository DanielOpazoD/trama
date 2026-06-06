import { useState } from 'react'
import { assemble } from '../../../lib/pdfStudio/assemble'
import { canExport, type PdfDoc } from '../../../lib/pdfStudio/model'
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

export function usePdfStudioExport() {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [exportStatus, setExportStatus] = useState<string | null>(null)

  async function assembleOrToast(target: PdfDoc): Promise<Blob | null> {
    setExportStatus(pdfExportProgressLabel(target.pages.length))
    try {
      const { blob, skipped } = await assemble(target, {
        onProgress: (event) => setExportStatus(pdfExportPipelineProgressLabel(event)),
      })
      if (skipped.length > 0) {
        toast.show({
          message: `Se saltearon ${skipped.length} archivo(s): ${skipped
            .map((s) => s.name)
            .join(', ')}.`,
          tone: 'error',
        })
      }
      return blob
    } catch (err) {
      toast.show({
        message: describePdfExportError(err),
        tone: 'error',
      })
      return null
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

  return {
    assembleOrToast,
    downloadPdf,
    downloadSaved,
    exportPdf,
    exportStatus,
    saving,
  }
}
