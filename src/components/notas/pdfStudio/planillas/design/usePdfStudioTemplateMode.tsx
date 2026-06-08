import { useEffect, useState } from 'react'
import { isPdfTemplate, type PdfDoc } from '../../../../../lib/pdfStudio/model/model'
import {
  isSavedFilledTemplate,
  type SavedDoc,
} from '../../../../../lib/pdfStudio/render/persistence'
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

  // El banner sólo aporta en LLENADO (acción de imprimir + contexto). En diseño
  // la guía de una línea ya orienta, así que no se muestra (evita la etiqueta
  // redundante "Diseñar planilla").
  const templateModeBanner =
    enabled && effectiveTemplateMode === 'fill' ? (
      <PdfTemplateModeBanner
        mode="fill"
        fieldCount={doc.formFields?.length ?? 0}
        onPrint={() => void exportPdf(doc, 'planilla', { flattenFormFields: true })}
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
