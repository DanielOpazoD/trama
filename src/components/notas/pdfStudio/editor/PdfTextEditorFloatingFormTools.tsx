import type { PdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
import type { AnnotationDistributionAxis } from './pdfAnnotationArrange'
import type { TextStyle } from './editorStyle'
import type {
  FormFieldAlignment,
  FormFieldSizeDimension,
} from '../planillas/pdfFormFieldArrange'
import type { FormFieldPresetKey } from '../planillas/pdfFormFieldPresets'
import type { FormFieldVisualPatch } from '../planillas/pdfFormFieldStyle'
import { FormFieldInspector } from '../planillas/FormFieldInspector'
import { SignatureCaptureDialog } from '../planillas/SignatureCaptureDialog'
import { useDraggablePanel } from './useDraggablePanel'

export function PdfTextEditorFloatingFormTools({
  fields,
  signatureField,
  onAlignFields,
  onApplyPreset,
  onApplyStyle,
  onApplyVisual,
  onChooseSignatureImage,
  onDeleteField,
  onDistributeFields,
  onDuplicateFields,
  onMatchFieldSizes,
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
  onAlignFields: (alignment: FormFieldAlignment) => void
  onApplyPreset: (key: FormFieldPresetKey) => void
  onApplyStyle: (patch: Partial<TextStyle>) => void
  onApplyVisual: (patch: FormFieldVisualPatch) => void
  onChooseSignatureImage: (field?: PdfFormFieldDraft | null) => void
  onDeleteField: (id: string) => void
  onDistributeFields: (axis: AnnotationDistributionAxis) => void
  onDuplicateFields: () => void
  onMatchFieldSizes: (dimension: FormFieldSizeDimension) => void
  onPatchField: (id: string, patch: Partial<PdfFormFieldDraft>) => void
  onPatchSelection: (patch: { required?: boolean; readOnly?: boolean }) => void
  onRememberStyle: (field: PdfFormFieldDraft) => void
  onSaveSignature: (dataUrl: string) => void
  onSetSignatureField: (field: PdfFormFieldDraft | null) => void
  onValueChange: (id: string, value: string | boolean) => void
}) {
  // El offset del inspector vive acá (este componente persiste): mover el
  // panel se conserva aunque la selección cambie o se vacíe.
  const { panelStyle, startPanelDrag } = useDraggablePanel()
  const active = fields[fields.length - 1] ?? null
  return (
    <>
      {active ? (
        <FormFieldInspector
          fields={fields}
          dragStyle={panelStyle}
          onDragHandlePointerDown={startPanelDrag}
          onAlignFields={onAlignFields}
          onApplyPreset={onApplyPreset}
          onApplyStyle={onApplyStyle}
          onApplyVisual={onApplyVisual}
          onDelete={() => fields.forEach((field) => onDeleteField(field.id))}
          onDistributeFields={onDistributeFields}
          onDuplicateFields={onDuplicateFields}
          onMatchFieldSizes={onMatchFieldSizes}
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
