import { useCallback, useState } from 'react'
import {
  addImageSource,
  addPdfSource,
  type ImageAsset,
  type PdfDoc,
} from '../../../lib/pdfStudio/model'
import { getPdfPageCount } from '../../../lib/pdfStudio/pdfRender'
import { useToast } from '../../../state'
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
      setBusy(true)
      try {
        let next = doc
        const failed: string[] = []
        const newAssets: ImageAsset[] = []
        for (const file of files) {
          try {
            if (isPdfFile(file)) {
              const count = await getPdfPageCount(file)
              next = addPdfSource(next, file, count)
            } else if (isStudioImageFile(file)) {
              next = addImageSource(next, file)
              newAssets.push({ id: crypto.randomUUID(), file })
            } else {
              failed.push(file.name)
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
