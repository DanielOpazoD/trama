import { useState } from 'react'
import { isPdfTemplate, type PdfDoc } from '../../../lib/pdfStudio/model'
import type { SavedDoc } from '../../../lib/pdfStudio/persistence'
import { PdfTemplateModeBanner, type PdfTemplateMode } from './PdfTemplateModeBanner'

export function usePdfStudioTemplateMode({
  doc,
  exportPdf,
  openSaved,
  openTemplate,
  saveTemplate,
}: {
  doc: PdfDoc
  exportPdf: (target: PdfDoc, kind?: string) => void | Promise<void>
  openSaved: (saved: SavedDoc) => void
  openTemplate: (saved: SavedDoc) => void
  saveTemplate: (name: string) => void
}) {
  const [templateMode, setTemplateMode] = useState<PdfTemplateMode | null>(null)
  const docIsTemplate = isPdfTemplate(doc)
  const effectiveTemplateMode: PdfTemplateMode | null = docIsTemplate
    ? (templateMode ?? 'design')
    : null

  function resetTemplateMode() {
    setTemplateMode(null)
  }

  function openSavedWithMode(saved: SavedDoc) {
    openSaved(saved)
    setTemplateMode(isPdfTemplate(saved.doc) ? 'design' : null)
  }

  function openTemplateWithFillMode(saved: SavedDoc) {
    openTemplate(saved)
    setTemplateMode('fill')
  }

  function saveTemplateWithMode(name: string) {
    saveTemplate(name)
    setTemplateMode('design')
  }

  const templateModeBanner = effectiveTemplateMode ? (
    <PdfTemplateModeBanner
      mode={effectiveTemplateMode}
      fieldCount={doc.formFields?.length ?? 0}
      onPrint={
        effectiveTemplateMode === 'fill'
          ? () => void exportPdf(doc, 'planilla')
          : undefined
      }
      onEditStructure={
        effectiveTemplateMode === 'fill' ? () => setTemplateMode('design') : undefined
      }
    />
  ) : null

  return {
    effectiveTemplateMode,
    openSavedWithMode,
    resetTemplateMode,
    saveTemplateWithMode,
    templateModeBanner,
    openTemplateWithFillMode,
  }
}
