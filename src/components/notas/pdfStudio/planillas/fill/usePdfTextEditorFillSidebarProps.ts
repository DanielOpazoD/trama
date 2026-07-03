import { useState } from 'react'
import type { PdfFormFieldDraft } from '../../../../../lib/pdfStudio/model/model'
import type { TemplateFillImportValues } from './pdfTemplateFillImport'
import type { PdfTextEditorFillSidebarProps } from './PdfTextEditorFillSidebar'
import { usePdfTemplateFillImport } from './usePdfTemplateFillImport'

export function usePdfTextEditorFillSidebarProps({
  activeFillFieldId,
  applyDraftFormValues,
  clearDraftFormValues,
  formFields,
  jumpToFormField,
  onMailMergeRows,
  onOpenSignature,
  pageIndexById,
  setActiveFillFieldId,
  updateDraftFormValue,
}: {
  activeFillFieldId: string | null
  applyDraftFormValues: (values: TemplateFillImportValues) => number
  clearDraftFormValues: () => void
  formFields: PdfFormFieldDraft[]
  jumpToFormField: (field: PdfFormFieldDraft) => void
  /** Lote: genera N copias rellenadas (una por fila) y abre la vista previa. */
  onMailMergeRows?: (rows: TemplateFillImportValues[]) => void
  onOpenSignature?: (field: PdfFormFieldDraft) => void
  pageIndexById: Record<string, number>
  setActiveFillFieldId: (id: string | null) => void
  updateDraftFormValue: (id: string, value: string | boolean) => void
}) {
  const [showFillGuides, setShowFillGuides] = useState(false)
  const [showPendingOnly, setShowPendingOnly] = useState(false)
  const { importFeedback, importTemplateValues, importTemplateBatch } =
    usePdfTemplateFillImport(applyDraftFormValues, onMailMergeRows)

  const fillSidebarProps: PdfTextEditorFillSidebarProps = {
    activeFieldId: activeFillFieldId,
    fields: formFields,
    importFeedback,
    pageIndexById,
    showFieldGuides: showFillGuides,
    showPendingOnly,
    onChange: updateDraftFormValue,
    onClearValues: clearDraftFormValues,
    onFocusField: (field) => setActiveFillFieldId(field.id),
    onImportValues: importTemplateValues,
    onImportBatch: onMailMergeRows ? importTemplateBatch : undefined,
    onJump: jumpToFormField,
    onOpenSignature,
    onShowFieldGuidesChange: setShowFillGuides,
    onShowPendingOnlyChange: setShowPendingOnly,
  }

  return { fillSidebarProps, showFillGuides }
}
