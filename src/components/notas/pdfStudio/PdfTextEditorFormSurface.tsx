import type { PointerEvent as ReactPointerEvent } from 'react'
import type { PdfFormFieldDraft } from '../../../lib/pdfStudio/model'
import type { ResizeHandle } from '../../../lib/pdfStudio/editorGeometry'
import { FormFieldInspector } from './FormFieldInspector'
import { FormFieldLayer, type VisualPdfFormWidget } from './FormFieldLayer'
import { SignatureCaptureDialog } from './SignatureCaptureDialog'

export function PdfTextEditorFormSurface({
  detectedWidgets,
  draftFields,
  mode = 'edit',
  selectedDraftField,
  selectedDraftId,
  signatureField,
  onChooseSignatureImage,
  onDeleteDraft,
  onDetectedValueChange,
  onDraftPatch,
  onDraftValueChange,
  onOpenSignature,
  onSaveSignature,
  onSelectDraft,
  onSetSignatureField,
  onStartDraftDrag,
  onStartDraftResize,
}: {
  detectedWidgets: VisualPdfFormWidget[]
  draftFields: PdfFormFieldDraft[]
  mode?: 'edit' | 'fill'
  selectedDraftField: PdfFormFieldDraft | null
  selectedDraftId: string | null
  signatureField: PdfFormFieldDraft | null
  onChooseSignatureImage: (field?: PdfFormFieldDraft | null) => void
  onDeleteDraft: (id: string) => void
  onDetectedValueChange: (
    sourceId: string,
    fieldName: string,
    value: string | boolean,
  ) => void
  onDraftPatch: (id: string, patch: Partial<PdfFormFieldDraft>) => void
  onDraftValueChange: (id: string, value: string | boolean) => void
  onOpenSignature: (field: PdfFormFieldDraft) => void
  onSaveSignature: (dataUrl: string) => void
  onSelectDraft: (id: string) => void
  onSetSignatureField: (field: PdfFormFieldDraft | null) => void
  onStartDraftDrag: (event: ReactPointerEvent, field: PdfFormFieldDraft) => void
  onStartDraftResize: (
    event: ReactPointerEvent,
    field: PdfFormFieldDraft,
    handle: ResizeHandle,
  ) => void
}) {
  return (
    <>
      <FormFieldLayer
        detectedWidgets={detectedWidgets}
        draftFields={draftFields}
        mode={mode}
        selectedDraftId={selectedDraftId}
        onDetectedValueChange={onDetectedValueChange}
        onDraftValueChange={onDraftValueChange}
        onSelectDraft={onSelectDraft}
        onStartDraftDrag={onStartDraftDrag}
        onStartDraftResize={onStartDraftResize}
        onOpenSignature={onOpenSignature}
      />
      {mode !== 'fill' && selectedDraftField && (
        <FormFieldInspector
          field={selectedDraftField}
          onDelete={() => onDeleteDraft(selectedDraftField.id)}
          onPatch={(patch) => onDraftPatch(selectedDraftField.id, patch)}
          onValueChange={(value) => onDraftValueChange(selectedDraftField.id, value)}
        />
      )}
      {signatureField && (
        <SignatureCaptureDialog
          field={signatureField}
          onCancel={() => onSetSignatureField(null)}
          onChooseImage={() => onChooseSignatureImage(signatureField)}
          onSave={onSaveSignature}
        />
      )}
    </>
  )
}
