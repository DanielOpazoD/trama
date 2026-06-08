import type { PointerEvent as ReactPointerEvent } from 'react'
import type { PdfFormFieldDraft } from '../../../lib/pdfStudio/model'
import type { ResizeHandle } from '../../../lib/pdfStudio/editorGeometry'
import { FormFieldLayer, type VisualPdfFormWidget } from './FormFieldLayer'

export function PdfTextEditorFormSurface({
  detectedWidgets,
  draftFields,
  mode = 'edit',
  activeDraftId,
  showFillGuides,
  selectedDraftId,
  selectedDraftIds,
  pageHeightPx,
  zoom,
  onDetectedValueChange,
  onDraftValueChange,
  onDraftFocus,
  onOpenSignature,
  onSelectDraft,
  onStartDraftDrag,
  onStartDraftResize,
}: {
  detectedWidgets: VisualPdfFormWidget[]
  draftFields: PdfFormFieldDraft[]
  mode?: 'edit' | 'fill'
  activeDraftId?: string | null
  showFillGuides?: boolean
  selectedDraftId: string | null
  selectedDraftIds: string[]
  pageHeightPx: number
  zoom: number
  onDetectedValueChange: (
    sourceId: string,
    fieldName: string,
    value: string | boolean,
  ) => void
  onDraftValueChange: (id: string, value: string | boolean) => void
  onDraftFocus?: (field: PdfFormFieldDraft) => void
  onOpenSignature: (field: PdfFormFieldDraft) => void
  onSelectDraft: (id: string, additive?: boolean) => void
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
        activeDraftId={activeDraftId}
        showFillGuides={showFillGuides}
        selectedDraftId={selectedDraftId}
        selectedDraftIds={selectedDraftIds}
        pageHeightPx={pageHeightPx}
        zoom={zoom}
        onDetectedValueChange={onDetectedValueChange}
        onDraftValueChange={onDraftValueChange}
        onDraftFocus={onDraftFocus}
        onSelectDraft={onSelectDraft}
        onStartDraftDrag={onStartDraftDrag}
        onStartDraftResize={onStartDraftResize}
        onOpenSignature={onOpenSignature}
      />
    </>
  )
}
