import { useCallback, useState } from 'react'
import {
  addPdfSource,
  type ImageAsset,
  type PdfDoc,
} from '../../../../lib/pdfStudio/model/model'
import { getPdfPageCount } from '../../../../lib/pdfStudio/render/pdfRender'
import { useToast } from '../../../../state'
import { buildPdfStudioImportPreflight } from '../../../../lib/pdfStudio/preflight/pdfStudioPreflight'
import { isPdfFile, isStudioImageFile } from './pdfStudioFileUtils'
import { imagesToSheetPdfFile } from '../../../../lib/pdfStudio/assemble/imagesToSheetPdfFile'
import { resolveImagesPerPage } from '../../../../lib/pdfStudio/assemble/assembleImages'

export function usePdfStudioImport({
  commit,
  doc,
  onImageAssets,
}: {
  commit: (next: PdfDoc | ((prev: PdfDoc) => PdfDoc)) => void
  doc: PdfDoc
  onImageAssets: (assets: ImageAsset[]) => void
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const addFiles = useCallback(
    async (list: FileList | File[] | null) => {
      const files = list ? Array.from(list) : []
      if (files.length === 0) return
      const preflight = buildPdfStudioImportPreflight(files)
      if (!preflight.canProceed) {
        const blocker = preflight.blockers[0]
        toast.show({
          message: `${blocker?.message ?? 'No se puede importar.'}${blocker?.detail ? ` ${blocker.detail}` : ''}`,
          tone: 'error',
        })
        return
      }
      if (preflight.warnings.length > 0) {
        toast.show({
          message: `Preflight de importación: ${preflight.warnings
            .map((warning) =>
              warning.detail ? `${warning.message} ${warning.detail}` : warning.message,
            )
            .join(' ')}`,
          tone: 'default',
        })
      }
      setBusy(true)
      try {
        let next = doc
        const failed: string[] = []
        const supportedFiles = files.filter(
          (file) => isPdfFile(file) || isStudioImageFile(file),
        )
        let imageBatch: File[] = []
        const flushImages = async () => {
          const imageFiles = imageBatch
          imageBatch = []
          if (imageFiles.length === 0) return
          try {
            const sheetPdf = await imagesToSheetPdfFile(imageFiles, {
              imagesPerPage: resolveImagesPerPage(next.settings),
            })
            const count = await getPdfPageCount(sheetPdf)
            next = addPdfSource(next, sheetPdf, count)
          } catch {
            failed.push(...imageFiles.map((file) => file.name))
          }
        }
        for (const file of supportedFiles) {
          if (isPdfFile(file)) {
            await flushImages()
            try {
              const count = await getPdfPageCount(file)
              next = addPdfSource(next, file, count)
            } catch {
              failed.push(file.name)
            }
          } else if (isStudioImageFile(file)) {
            imageBatch.push(file)
          }
        }
        await flushImages()
        commit(next)
        onImageAssets([])
        if (failed.length > 0) {
          toast.show({
            message: `No se pudo leer: ${failed.join(', ')} (¿PDF cifrado o formato no soportado?).`,
            tone: 'error',
          })
        }
      } finally {
        setBusy(false)
      }
    },
    [commit, doc, onImageAssets, toast],
  )

  return { addFiles, busy }
}
