import type { Dispatch, SetStateAction } from 'react'
import type { PdfFormFieldDraft } from '../../../lib/pdfStudio/model'
import type { TemplateFillImportValues } from './pdfTemplateFillImport'
import type { TemplateFillImportFeedback } from './usePdfTemplateFillImport'
import { PdfTemplateFillVariablesPanel } from './PdfTemplateFillVariablesPanel'

export type PdfTextEditorFillSidebarProps = {
  activeFieldId: string | null
  fields: PdfFormFieldDraft[]
  importFeedback: TemplateFillImportFeedback | null
  pageIndexById: Record<string, number>
  showFieldGuides: boolean
  showPendingOnly: boolean
  onChange: (id: string, value: string | boolean) => void
  onClearValues: () => void
  onFocusField: (field: PdfFormFieldDraft) => void
  onImportValues: (file: File) => void | Promise<TemplateFillImportValues | void>
  onJump: (field: PdfFormFieldDraft) => void
  onShowFieldGuidesChange: Dispatch<SetStateAction<boolean>>
  onShowPendingOnlyChange: Dispatch<SetStateAction<boolean>>
}

export function PdfTextEditorFillSidebar({
  activeFieldId,
  fields,
  importFeedback,
  pageIndexById,
  showFieldGuides,
  showPendingOnly,
  onChange,
  onClearValues,
  onFocusField,
  onImportValues,
  onJump,
  onShowFieldGuidesChange,
  onShowPendingOnlyChange,
}: PdfTextEditorFillSidebarProps) {
  return (
    <PdfTemplateFillVariablesPanel
      activeFieldId={activeFieldId}
      fields={fields}
      importFeedback={importFeedback}
      pageIndexById={pageIndexById}
      showFieldGuides={showFieldGuides}
      showPendingOnly={showPendingOnly}
      onChange={onChange}
      onClearValues={onClearValues}
      onFocusField={onFocusField}
      onImportValues={onImportValues}
      onShowFieldGuidesChange={onShowFieldGuidesChange}
      onShowPendingOnlyChange={onShowPendingOnlyChange}
      onJump={onJump}
    />
  )
}
