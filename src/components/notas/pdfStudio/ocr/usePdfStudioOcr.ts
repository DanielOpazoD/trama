import { useRef, useState } from 'react'
import { assemblePdfInWorker } from '../../../../lib/pdfStudio/export/exportWorkerClient'
import { createSearchablePdfInWorker } from '../../../../lib/pdfStudio/ocr/pdfOcrWorkerClient'
import type { PdfOcrLanguage, PdfOcrProgress } from '../../../../lib/pdfStudio/ocr/pdfOcr'
import { assessPdfOcrDocument } from '../../../../lib/pdfStudio/ocr/pdfOcrLimits'
import {
  addPdfSource,
  canExport,
  type PdfDoc,
} from '../../../../lib/pdfStudio/model/model'
import { getPdfPageCount } from '../../../../lib/pdfStudio/render/pdfRender'
import type { AssembleOptions } from '../../../../lib/pdfStudio/assemble/assemble'
import { downloadBlob } from '../../../../lib/downloadBlob'
import { useToast } from '../../../../state'
import { pdfExportPipelineProgressLabel } from '../shell/pdfExportFeedback'

function ocrProgressLabel(progress: PdfOcrProgress): string {
  if (progress.phase === 'prepare') return 'Preparando OCR…'
  if (progress.phase === 'render') {
    return progress.current && progress.total
      ? `Renderizando para OCR ${progress.current}/${progress.total}…`
      : 'Renderizando páginas para OCR…'
  }
  if (progress.phase === 'recognize') {
    return progress.current && progress.total
      ? `Reconociendo texto ${progress.current}/${progress.total}…`
      : 'Reconociendo texto…'
  }
  if (progress.phase === 'assemble') return 'Creando PDF buscable…'
  if (progress.phase === 'save') return 'Guardando OCR…'
  return 'Procesando OCR…'
}

function ocrFileName(ext: 'pdf' | 'txt'): string {
  return `trama-ocr.${ext}`
}

export function usePdfStudioOcr({
  compression = 'balanced',
  commit,
}: {
  compression?: AssembleOptions['compression']
  /**
   * Si se pasa, el PDF buscable REEMPLAZA al documento abierto al terminar:
   * el OCR vuelve a Imprenta en vez de quedarse en la carpeta de descargas.
   * Las anotaciones ya viajan fijadas dentro del PDF ensamblado. Es un commit
   * normal del historial, así que ⌘Z lo deshace.
   */
  commit?: (next: PdfDoc | ((prev: PdfDoc) => PdfDoc)) => void
} = {}) {
  const toast = useToast()
  const abortRef = useRef<AbortController | null>(null)
  const [language, setLanguage] = useState<PdfOcrLanguage>('spa')
  const [ocrOpen, setOcrOpen] = useState(false)
  const [ocrRunning, setOcrRunning] = useState(false)
  const [ocrStatus, setOcrStatus] = useState<string | null>(null)

  async function startOcr(doc: PdfDoc) {
    if (!canExport(doc) || ocrRunning) return
    const assessment = assessPdfOcrDocument(doc)
    if (!assessment.canRunClientSide) {
      const message = assessment.messages[0] ?? 'OCR client-side no disponible.'
      setOcrStatus(message)
      toast.show({ message, tone: 'error' })
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setOcrRunning(true)
    setOcrStatus('Preparando PDF para OCR…')

    try {
      const assembled = await assemblePdfInWorker(doc, {
        compression,
        signal: controller.signal,
        onProgress: (progress) =>
          setOcrStatus(`Preparando PDF: ${pdfExportPipelineProgressLabel(progress)}`),
      })
      const source = new File([assembled.blob], 'trama-ocr-source.pdf', {
        type: 'application/pdf',
      })
      const result = await createSearchablePdfInWorker(source, {
        language,
        signal: controller.signal,
        onProgress: (progress) => setOcrStatus(ocrProgressLabel(progress)),
      })

      downloadBlob(result.pdfBlob, ocrFileName('pdf'))
      downloadBlob(result.textBlob, ocrFileName('txt'))
      result.warnings.forEach((warning) =>
        toast.show({ message: warning.message, tone: 'default' }),
      )
      const pagesWithText = result.pages.filter((page) => page.text.trim()).length
      let message = `OCR completado: ${pagesWithText}/${result.pages.length} páginas con texto.`
      if (commit) {
        const searchable = new File([result.pdfBlob], ocrFileName('pdf'), {
          type: 'application/pdf',
        })
        const count = await getPdfPageCount(searchable)
        commit((prev) =>
          addPdfSource({ ...prev, sources: [], pages: [] }, searchable, count),
        )
        setOcrOpen(false)
        message += ' El documento ahora es la versión buscable; ⌘Z lo deshace.'
      }
      setOcrStatus(message)
      toast.show({ message, tone: 'success' })
    } catch (err) {
      if (controller.signal.aborted) {
        setOcrStatus('OCR cancelado.')
        toast.show({ message: 'OCR cancelado.', tone: 'default' })
      } else {
        const message =
          err instanceof Error
            ? `No se pudo completar OCR: ${err.message}`
            : 'No se pudo completar OCR.'
        setOcrStatus(message)
        toast.show({ message, tone: 'error' })
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setOcrRunning(false)
    }
  }

  function cancelOcr() {
    abortRef.current?.abort('cancelled')
  }

  return {
    cancelOcr,
    language,
    ocrOpen,
    ocrRunning,
    ocrStatus,
    setLanguage,
    setOcrOpen,
    startOcr,
  }
}
