import { useCallback, useState } from 'react'
import { downloadBlob } from '../../../../lib/downloadBlob'
import type { PdfDoc } from '../../../../lib/pdfStudio/model/model'
import { printPdfBlob } from '../../../../lib/pdfStudio/export/printPdf'
import { useToast } from '../../../../state'
import { PdfPreviewModal } from '../editor/PdfPreviewModal'
import { exportPdfName } from './pdfStudioFileUtils'

type PreparePdf = (
  target: PdfDoc,
  options?: { flattenFormFields?: boolean },
) => Promise<Blob | null | undefined>

type PreviewState = {
  blob: Blob
  kind?: string
  title?: string
}

export function usePdfStudioPreview({ preparePdf }: { preparePdf: PreparePdf }) {
  const toast = useToast()
  const [previewState, setPreviewState] = useState<PreviewState | null>(null)

  const openPreview = useCallback(
    async (target: PdfDoc, kind?: string, options?: { flattenFormFields?: boolean }) => {
      const blob = await preparePdf(target, options)
      if (blob) setPreviewState({ blob, kind, title: target.title })
    },
    [preparePdf],
  )

  const previewModal = previewState ? (
    <PdfPreviewModal
      blob={previewState.blob}
      onClose={() => setPreviewState(null)}
      onPrint={(blob) => printPdfBlob(blob)}
      onDownload={(blob) => {
        downloadBlob(
          blob,
          exportPdfName(undefined, previewState.kind, previewState.title),
        )
        toast.show({ message: 'PDF descargado.', tone: 'success' })
      }}
    />
  ) : null

  return { openPreview, previewModal }
}
