import { useEffect, useState } from 'react'
import { isPdfTemplate, type PdfDoc } from '../../../lib/pdfStudio/model/model'
import {
  isSavedFilledTemplate,
  type SavedDoc,
} from '../../../lib/pdfStudio/render/persistence'
import { PdfTemplateModeBanner, type PdfTemplateMode } from './PdfTemplateModeBanner'

export function usePdfStudioTemplateMode({
  doc,
  enabled = true,
  exportPdf,
  openSaved,
  openTemplate,
  saveTemplate,
}: {
  doc: PdfDoc
  enabled?: boolean
  exportPdf: (
    target: PdfDoc,
    kind?: string,
    options?: { flattenFormFields?: boolean },
  ) => void | Promise<void>
  openSaved: (saved: SavedDoc) => void
  openTemplate: (saved: SavedDoc) => void
  saveTemplate: (name: string) => void
}) {
  const [templateMode, setTemplateMode] = useState<PdfTemplateMode | null>(null)
  const [activeTemplateName, setActiveTemplateName] = useState<string | null>(null)
  const docIsTemplate = enabled && isPdfTemplate(doc)
  const effectiveTemplateMode: PdfTemplateMode | null = docIsTemplate
    ? (templateMode ?? 'design')
    : null

  useEffect(() => {
    if (!enabled) {
      setTemplateMode(null)
      setActiveTemplateName(null)
    }
  }, [enabled])

  function resetTemplateMode() {
    setTemplateMode(null)
    setActiveTemplateName(null)
  }

  function openSavedWithMode(saved: SavedDoc) {
    openSaved(saved)
    if (enabled && isSavedFilledTemplate(saved)) {
      setTemplateMode('fill')
      setActiveTemplateName(saved.name)
      return
    }
    setTemplateMode(enabled && isPdfTemplate(saved.doc) ? 'design' : null)
    setActiveTemplateName(null)
  }

  function openTemplateWithFillMode(saved: SavedDoc) {
    openTemplate(saved)
    setTemplateMode(enabled ? 'fill' : null)
    setActiveTemplateName(saved.name)
  }

  function saveTemplateWithMode(name: string) {
    saveTemplate(name)
    setTemplateMode('design')
    setActiveTemplateName(name)
  }

  const templateModeBanner =
    enabled && effectiveTemplateMode ? (
      <PdfTemplateModeBanner
        mode={effectiveTemplateMode}
        fieldCount={doc.formFields?.length ?? 0}
        onPrint={
          effectiveTemplateMode === 'fill'
            ? () => void exportPdf(doc, 'planilla', { flattenFormFields: true })
            : undefined
        }
      />
    ) : null

  return {
    effectiveTemplateMode,
    activeTemplateName,
    openSavedWithMode,
    resetTemplateMode,
    saveTemplateWithMode,
    templateModeBanner,
    openTemplateWithFillMode,
  }
}
