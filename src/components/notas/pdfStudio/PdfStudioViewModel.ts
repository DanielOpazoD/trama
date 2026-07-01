import { isPdfTemplate, type PdfDoc } from '../../../lib/pdfStudio/model/model'
import type { SavedDoc } from '../../../lib/pdfStudio/render/persistence'
import type { PdfTemplateMode } from './planillas/design/PdfTemplateModeBanner'

export function pdfStudioHasVisibleSaved({
  saved,
  templatesEnabled,
}: {
  saved: SavedDoc[]
  templatesEnabled: boolean
}): boolean {
  if (templatesEnabled) return saved.length > 0
  return saved.some((item) => !isPdfTemplate(item.doc))
}

export function canCropPdfStudioSelection({
  doc,
  selectedCount,
  selectedIndices,
}: {
  doc: PdfDoc
  selectedCount: number
  selectedIndices: number[]
}): boolean {
  return (
    selectedCount === 1 && selectedIndices[0] != null && !!doc.pages[selectedIndices[0]]
  )
}

export function pdfStudioTextEditorMode(
  templateMode: PdfTemplateMode | null,
): 'fill' | 'edit' {
  return templateMode === 'fill' ? 'fill' : 'edit'
}
