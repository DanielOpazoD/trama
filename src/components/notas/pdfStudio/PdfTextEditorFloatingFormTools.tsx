import type { PdfFormFieldDraft } from '../../../lib/pdfStudio/model'
import type {
  AnnotationDistributionAxis,
  AnnotationHorizontalAlignment,
} from './pdfAnnotationArrange'
import type { TextStyle } from './editorStyle'
import { FormFieldInspector } from './FormFieldInspector'
import { FormFieldSelectionInspector } from './FormFieldSelectionInspector'
import { SignatureCaptureDialog } from './SignatureCaptureDialog'

export function PdfTextEditorFloatingFormTools({
  field,
  activeBold,
  activeSizeRatio,
  selectionCount = 0,
  signatureField,
  onAlignFields,
  onApplyStyle,
  onChooseSignatureImage,
  onDeleteField,
  onDistributeFields,
  onPatchField,
  onSaveSignature,
  onSetSignatureField,
  onValueChange,
}: {
  field: PdfFormFieldDraft | null
  activeBold?: boolean
  activeSizeRatio?: number
  selectionCount?: number
  signatureField: PdfFormFieldDraft | null
  onAlignFields?: (alignment: AnnotationHorizontalAlignment) => void
  onApplyStyle?: (patch: Partial<TextStyle>) => void
  onChooseSignatureImage: (field?: PdfFormFieldDraft | null) => void
  onDeleteField: (id: string) => void
  onDistributeFields?: (axis: AnnotationDistributionAxis) => void
  onPatchField: (id: string, patch: Partial<PdfFormFieldDraft>) => void
  onSaveSignature: (dataUrl: string) => void
  onSetSignatureField: (field: PdfFormFieldDraft | null) => void
  onValueChange: (id: string, value: string | boolean) => void
}) {
  return (
    <>
      {selectionCount > 1 && onAlignFields && onDistributeFields ? (
        <FormFieldSelectionInspector
          count={selectionCount}
          activeBold={activeBold}
          activeSizeRatio={activeSizeRatio}
          onAlign={onAlignFields}
          onApplyStyle={onApplyStyle}
          onDistribute={onDistributeFields}
        />
      ) : field ? (
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
