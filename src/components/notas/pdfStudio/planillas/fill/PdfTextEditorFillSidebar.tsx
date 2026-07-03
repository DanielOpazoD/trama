import type { Dispatch, SetStateAction } from 'react'
import type { PdfFormFieldDraft } from '../../../../../lib/pdfStudio/model/model'
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
  /** Lote: CSV con una fila por copia → N copias rellenadas en un solo PDF. */
  onImportBatch?: (file: File) => void | Promise<void>
  /** «Mis datos»: aplica el perfil propio por nombre; devuelve cuántos llenó. */
  onApplyProfile?: (values: TemplateFillImportValues) => number
  onJump: (field: PdfFormFieldDraft) => void
  onOpenSignature?: (field: PdfFormFieldDraft) => void
  profileUserKey?: string
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
  onApplyProfile,
  onImportValues,
  onImportBatch,
  onJump,
  onOpenSignature,
  onShowFieldGuidesChange,
  onShowPendingOnlyChange,
  profileUserKey,
}: PdfTextEditorFillSidebarProps) {
  return (
    <PdfTemplateFillVariablesPanel
      activeFieldId={activeFieldId}
      autoFocusFirstPending
      fields={fields}
      importFeedback={importFeedback}
      pageIndexById={pageIndexById}
      showFieldGuides={showFieldGuides}
      showPendingOnly={showPendingOnly}
      onChange={onChange}
      onClearValues={onClearValues}
      onFocusField={onFocusField}
      onImportValues={onImportValues}
      onImportBatch={onImportBatch}
      onShowFieldGuidesChange={onShowFieldGuidesChange}
      onShowPendingOnlyChange={onShowPendingOnlyChange}
      onJump={onJump}
      onOpenSignature={onOpenSignature}
      onApplyProfile={onApplyProfile}
      profileUserKey={profileUserKey}
    />
  )
}
