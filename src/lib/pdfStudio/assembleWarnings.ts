import type { PdfDoc } from './model'
import type { PdfExportWarning } from './assemblePipeline'

export function exportWarnings(doc: PdfDoc, imageCount: number): PdfExportWarning[] {
  const warnings: PdfExportWarning[] = []
  if (doc.pages.length >= 75) {
    warnings.push({
      code: 'LARGE_EXPORT',
      message: `Documento grande: ${doc.pages.length} páginas. La exportación puede tardar o usar más memoria.`,
    })
  }
  const heavyImageSources = doc.sources.filter(
    (source) => source.kind === 'image' && source.file.size >= 8 * 1024 * 1024,
  )
  if (imageCount >= 20 || heavyImageSources.length > 0) {
    warnings.push({
      code: 'LARGE_IMAGE_SET',
      message:
        heavyImageSources.length > 0
          ? `Hay ${heavyImageSources.length} imagen(es) grandes; considera reducirlas si el navegador se queda sin memoria.`
          : `Hay ${imageCount} imágenes; la exportación puede requerir más memoria.`,
    })
  }
  return warnings
}
