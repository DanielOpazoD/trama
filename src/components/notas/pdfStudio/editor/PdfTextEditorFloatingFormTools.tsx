import type { PdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
import type {
  AnnotationDistributionAxis,
  AnnotationHorizontalAlignment,
} from './pdfAnnotationArrange'
import type { TextStyle } from './editorStyle'
import type { FormFieldVisualPatch } from '../planillas/pdfFormFieldStyle'
import { FormFieldInspector } from '../planillas/FormFieldInspector'
import { SignatureCaptureDialog } from '../planillas/SignatureCaptureDialog'

export function PdfTextEditorFloatingFormTools({
  fields,
  signatureField,
  onAlignFields,
  onApplyStyle,
  onApplyVisual,
  onChooseSignatureImage,
  onDeleteField,
  onDistributeFields,
  onPatchField,
  onPatchSelection,
  onRememberStyle,
  onSaveSignature,
  onSetSignatureField,
  onValueChange,
}: {
  /** Selección de casilleros en diseño ([] en modo llenar: sin inspector). */
  fields: PdfFormFieldDraft[]
  signatureField: PdfFormFieldDraft | null
  onAlignFields: (alignment: AnnotationHorizontalAlignment) => void
  onApplyStyle: (patch: Partial<TextStyle>) => void
  onApplyVisual: (patch: FormFieldVisualPatch) => void
  onChooseSignatureImage: (field?: PdfFormFieldDraft | null) => void
  onDeleteField: (id: string) => void
  onDistributeFields: (axis: AnnotationDistributionAxis) => void
  onPatchField: (id: string, patch: Partial<PdfFormFieldDraft>) => void
  onPatchSelection: (patch: { required?: boolean; readOnly?: boolean }) => void
  onRememberStyle: (field: PdfFormFieldDraft) => void
  onSaveSignature: (dataUrl: string) => void
  onSetSignatureField: (field: PdfFormFieldDraft | null) => void
  onValueChange: (id: string, value: string | boolean) => void
}) {
  const active = fields[fields.length - 1] ?? null
  return (
    <>
      {active ? (
        <FormFieldInspector
          fields={fields}
          onAlignFields={onAlignFields}
          onApplyStyle={onApplyStyle}
          onApplyVisual={onApplyVisual}
          onDelete={() => fields.forEach((field) => onDeleteField(field.id))}
          onDistributeFields={onDistributeFields}
          onPatchSelection={onPatchSelection}
          onRememberStyle={() => onRememberStyle(active)}
          onRename={(name) => onPatchField(active.id, { name })}
          onValueChange={(value) => onValueChange(active.id, value)}
        />
      ) : null}
      {signatureField ? (
        <SignatureCaptureDialog
          field={signatureField}
          onCancel={() => onSetSignatureField(null)}
          onChooseImage={() => onChooseSignatureImage(signatureField)}
          onSave={onSaveSignature}
        />
      ) : null}
    </>
  )
}
