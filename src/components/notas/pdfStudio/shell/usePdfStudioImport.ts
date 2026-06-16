import { useCallback, useState } from 'react'
import {
  addImageSource,
  addPdfSource,
  type ImageAsset,
  type PdfDoc,
} from '../../../../lib/pdfStudio/model/model'
import { getPdfPageCount } from '../../../../lib/pdfStudio/render/pdfRender'
import { useToast } from '../../../../state'
import { buildPdfStudioImportPreflight } from '../../../../lib/pdfStudio/preflight/pdfStudioPreflight'
import { isPdfFile, isStudioImageFile } from './pdfStudioFileUtils'

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
        const newAssets: ImageAsset[] = []
        const supportedFiles = files.filter(
          (file) => isPdfFile(file) || isStudioImageFile(file),
        )
        for (const file of supportedFiles) {
          try {
            if (isPdfFile(file)) {
              const count = await getPdfPageCount(file)
              next = addPdfSource(next, file, count)
            } else if (isStudioImageFile(file)) {
              next = addImageSource(next, file)
              newAssets.push({ id: crypto.randomUUID(), file })
            }
          } catch {
            failed.push(file.name)
          }
        }
        commit(next)
        if (newAssets.length > 0) onImageAssets(newAssets)
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
