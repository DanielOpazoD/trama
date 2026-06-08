import { useState } from 'react'
import type { PdfFormFieldDraft } from '../../../lib/pdfStudio/model/model'
import type { TemplateFillImportValues } from './pdfTemplateFillImport'
import type { PdfTextEditorFillSidebarProps } from './PdfTextEditorFillSidebar'
import { usePdfTemplateFillImport } from './usePdfTemplateFillImport'

export function usePdfTextEditorFillSidebarProps({
  activeFillFieldId,
  applyDraftFormValues,
  clearDraftFormValues,
  formFields,
  jumpToFormField,
  pageIndexById,
  setActiveFillFieldId,
  updateDraftFormValue,
}: {
  activeFillFieldId: string | null
  applyDraftFormValues: (values: TemplateFillImportValues) => number
  clearDraftFormValues: () => void
  formFields: PdfFormFieldDraft[]
  jumpToFormField: (field: PdfFormFieldDraft) => void
  pageIndexById: Record<string, number>
  setActiveFillFieldId: (id: string | null) => void
  updateDraftFormValue: (id: string, value: string | boolean) => void
}) {
  const [showFillGuides, setShowFillGuides] = useState(false)
  const [showPendingOnly, setShowPendingOnly] = useState(false)
  const { importFeedback, importTemplateValues } =
    usePdfTemplateFillImport(applyDraftFormValues)

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
    onJump: jumpToFormField,
    onShowFieldGuidesChange: setShowFillGuides,
    onShowPendingOnlyChange: setShowPendingOnly,
  }

  return { fillSidebarProps, showFillGuides }
}
