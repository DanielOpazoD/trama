import { type PointerEvent as ReactPointerEvent } from 'react'
import {
  type PdfDoc,
  type PdfFormFieldDraft,
} from '../../../../lib/pdfStudio/model/model'
import type {
  PageLayout,
  ResizeHandle,
} from '../../../../lib/pdfStudio/model/editorGeometry'
import { FormFieldLayer } from '../planillas/FormFieldLayer'
import {
  type DetectedPdfFormForCanvas,
  visualWidgetsForPage,
} from '../planillas/pdfFormVisualMapping'
import { orderFormFieldsForPage } from '../planillas/pdfFormFieldFillOrder'
import { PdfTextEditorFormSurface } from './PdfTextEditorFormSurface'

export function PdfTextEditorPageFormLayer({
  activeDraftId,
  detectedForms,
  draftFields,
  isActive,
  layout,
  mode,
  onActivate,
  onDetectedValueChange,
  onDraftFocus,
  onDraftValueChange,
  onOpenSignature,
  onSelectDraft,
  onStartDraftDrag,
  onStartDraftResize,
  page,
  pageIndex,
  selectedDraftId,
  selectedDraftIds,
  showFillGuides,
  zoom,
}: {
  activeDraftId?: string | null
  detectedForms: DetectedPdfFormForCanvas[]
  draftFields: PdfFormFieldDraft[]
  isActive: boolean
  layout: PageLayout | null
  mode: 'edit' | 'design' | 'fill'
  onActivate: (pageIndex: number) => void
  onDetectedValueChange: (
    sourceId: string,
    fieldName: string,
    value: string | boolean,
  ) => void
  onDraftFocus?: (field: PdfFormFieldDraft) => void
  onDraftValueChange: (id: string, value: string | boolean) => void
  onOpenSignature: (field: PdfFormFieldDraft) => void
  onSelectDraft: (id: string, additive?: boolean) => void
  onStartDraftDrag: (event: ReactPointerEvent, field: PdfFormFieldDraft) => void
  onStartDraftResize: (
    event: ReactPointerEvent,
    field: PdfFormFieldDraft,
    handle: ResizeHandle,
  ) => void
  page: NonNullable<PdfDoc['pages'][number]>
  pageIndex: number
  selectedDraftId: string | null
  selectedDraftIds: string[]
  showFillGuides?: boolean
  zoom: number
}) {
  const visibleFormWidgets = visualWidgetsForPage(page, detectedForms)
  const visibleDraftFields = orderFormFieldsForPage(draftFields, page.id, pageIndex)
  if (!isActive && visibleFormWidgets.length === 0 && visibleDraftFields.length === 0) {
    return null
  }

  const pageHeightPx = layout?.innerH ?? 1
  if (isActive) {
    return (
      <PdfTextEditorFormSurface
        detectedWidgets={visibleFormWidgets}
        draftFields={visibleDraftFields}
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
    )
  }

  return (
    <FormFieldLayer
      detectedWidgets={visibleFormWidgets}
      draftFields={visibleDraftFields}
      mode={mode}
      activeDraftId={activeDraftId}
      showFillGuides={showFillGuides}
      selectedDraftId={null}
      selectedDraftIds={[]}
      pageHeightPx={pageHeightPx}
      zoom={zoom}
      onDetectedValueChange={onDetectedValueChange}
      onDraftValueChange={onDraftValueChange}
      onDraftFocus={onDraftFocus}
      onSelectDraft={(id) => {
        onActivate(pageIndex)
        onSelectDraft(id)
      }}
      onStartDraftDrag={(event) => {
        event.stopPropagation()
        onActivate(pageIndex)
      }}
      onStartDraftResize={(event) => {
        event.stopPropagation()
        onActivate(pageIndex)
      }}
      onOpenSignature={(field) => {
        onActivate(pageIndex)
        onOpenSignature(field)
      }}
    />
  )
}
