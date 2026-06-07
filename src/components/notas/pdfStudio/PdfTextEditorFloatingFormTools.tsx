import type { PdfFormFieldDraft } from '../../../lib/pdfStudio/model'
import { FormFieldInspector } from './FormFieldInspector'
import { SignatureCaptureDialog } from './SignatureCaptureDialog'

export function PdfTextEditorFloatingFormTools({
  field,
  signatureField,
  onChooseSignatureImage,
  onDeleteField,
  onPatchField,
  onSaveSignature,
  onSetSignatureField,
  onValueChange,
}: {
  field: PdfFormFieldDraft | null
  signatureField: PdfFormFieldDraft | null
  onChooseSignatureImage: (field?: PdfFormFieldDraft | null) => void
  onDeleteField: (id: string) => void
  onPatchField: (id: string, patch: Partial<PdfFormFieldDraft>) => void
  onSaveSignature: (dataUrl: string) => void
  onSetSignatureField: (field: PdfFormFieldDraft | null) => void
  onValueChange: (id: string, value: string | boolean) => void
}) {
  return (
    <>
      {field ? (
        <FormFieldInspector
          field={field}
          onDelete={() => onDeleteField(field.id)}
          onPatch={(patch) => onPatchField(field.id, patch)}
          onValueChange={(value) => onValueChange(field.id, value)}
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
