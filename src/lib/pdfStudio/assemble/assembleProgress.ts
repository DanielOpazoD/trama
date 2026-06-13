import type { PdfDoc } from '../model/model'
import type { PdfExportProgressEvent } from './assemblePipeline'

export function countImages(doc: PdfDoc): number {
  return (
    doc.sources.filter((source) => source.kind === 'image').length +
    doc.pages.reduce(
      (count, page) =>
        count +
        page.annotations.filter((annotation) => annotation.kind === 'image').length,
      0,
    )
  )
}

export function emitLifecycle(
  emit: (event: PdfExportProgressEvent) => void,
  phase: PdfExportProgressEvent['phase'],
  status: PdfExportProgressEvent['status'],
  current?: number,
  total?: number,
) {
  emit({ phase, status, current, total })
}
