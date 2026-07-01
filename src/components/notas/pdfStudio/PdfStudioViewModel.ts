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

export function derivePdfStudioViewLayoutState({
  doc,
  saved,
  selectedCount,
  selectedIndices,
  templateMode,
  templatesEnabled,
}: {
  doc: PdfDoc
  saved: SavedDoc[]
  selectedCount: number
  selectedIndices: number[]
  templateMode: PdfTemplateMode | null
  templatesEnabled: boolean
}) {
  const total = doc.pages.length
  const empty = total === 0
  const hasVisibleSaved = pdfStudioHasVisibleSaved({ saved, templatesEnabled })

  return {
    canCropSelectedPage: canCropPdfStudioSelection({
      doc,
      selectedCount,
      selectedIndices,
    }),
    canSaveTemplate: templatesEnabled && !empty && isPdfTemplate(doc),
    empty,
    hasVisibleSaved,
    showEditBar: !empty && templateMode !== 'fill',
    showPanel: !empty || hasVisibleSaved,
    total,
  }
}
