import type { PdfPage, PdfSource } from '../model/model'
import { addImageSheetPage, resolveImagesPerPage } from './assembleImages'
import type { DocSettings } from '../model/model'
import { loadPdfLib } from '../pdfRuntime/pdfLibLoader'

type ImagesToSheetPdfFileOptions = {
  imagesPerPage?: NonNullable<DocSettings['imageLayout']>['imagesPerPage']
}

export async function imagesToSheetPdfFile(
  files: File[],
  { imagesPerPage = 1 }: ImagesToSheetPdfFileOptions = {},
): Promise<File> {
  const { PDFDocument } = await loadPdfLib()
  const out = await PDFDocument.create()
  const perPage = resolveImagesPerPage({ imageLayout: { imagesPerPage } })

  for (let index = 0; index < files.length; index += perPage) {
    const batch = files.slice(index, index + perPage)
    const entries = batch.map((file, offset) => {
      const sourceId = `import-image-${index + offset}`
      return {
        source: { id: sourceId, kind: 'image', file, pageCount: 1 } satisfies PdfSource,
        page: {
          id: `import-page-${index + offset}`,
          kind: 'image',
          sourceId,
          annotations: [],
          rotationQuarters: 0,
        } satisfies PdfPage,
      }
    })
    await addImageSheetPage({ out, entries, imagesPerPage: perPage })
  }

  const bytes = await out.save({ useObjectStreams: true })
  return new File([bytes as BlobPart], 'imagenes.pdf', { type: 'application/pdf' })
}
