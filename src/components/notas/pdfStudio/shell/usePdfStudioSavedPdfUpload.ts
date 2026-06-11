import { useCallback } from 'react'
import { uploadPdfStudioSavedPdf } from '../../../../api/pdfStudioSavedPdfs'
import { isPdfTemplate, type PdfDoc } from '../../../../lib/pdfStudio/model/model'
import type { SavedDoc } from '../../../../lib/pdfStudio/render/persistence'

export function usePdfStudioSavedPdfUpload({
  preparePdf,
}: {
  preparePdf: (
    target: PdfDoc,
    options?: { flattenFormFields?: boolean },
  ) => Promise<Blob | null>
}) {
  return useCallback(
    async (saved: SavedDoc) => {
      const blob = await preparePdf(saved.doc)
      if (!blob) throw new Error('No se pudo preparar el PDF para subir')
      const remote = await uploadPdfStudioSavedPdf({
        blob,
        savedDocId: saved.id,
        name: saved.name,
        kind: saved.kind ?? (isPdfTemplate(saved.doc) ? 'template' : 'creation'),
      })
      return {
        id: remote.id,
        uploadedAt: remote.updatedAt,
        byteSize: remote.byteSize,
      }
    },
    [preparePdf],
  )
}
