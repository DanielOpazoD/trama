import type { PdfTemplateMode } from './PdfTemplateModeBanner'

export type PageInteractionMode = 'editor' | 'templateDesign' | 'templateFill'

export function pdfStudioPageInteractionMode({
  templatesEnabled,
  templateMode,
}: {
  templatesEnabled: boolean
  templateMode: PdfTemplateMode | null
}): PageInteractionMode {
  if (!templatesEnabled) return 'editor'
  return templateMode === 'fill' ? 'templateFill' : 'templateDesign'
}
