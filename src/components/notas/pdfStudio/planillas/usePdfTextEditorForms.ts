import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  type PdfDoc,
  type PdfFormFieldDraft,
  type PdfPage,
} from '../../../../lib/pdfStudio/model/model'
import type {
  PageLayout,
  ResizeHandle,
} from '../../../../lib/pdfStudio/model/editorGeometry'
import type { TextStyle, Tool } from '../editor/editorStyle'
import { startFormFieldDrag, startFormFieldResize } from './pdfFormFieldPointer'
import { uniqueFieldName } from './pdfTextEditorFormDefaults'
import {
  patchDraftFormFields,
  removeSelectedFormFieldId,
} from './pdfTextEditorFormDraftModel'
import { usePdfTextEditorFormArrange } from './usePdfTextEditorFormArrange'
import { usePdfTextEditorFormHistory } from './usePdfTextEditorFormHistory'
import { usePdfTextEditorFormPlacement } from './usePdfTextEditorFormPlacement'
import { usePdfTextEditorFormSelection } from './usePdfTextEditorFormSelection'
import { usePdfTextEditorFormShortcuts } from './usePdfTextEditorFormShortcuts'
import { usePdfTextEditorFormSignature } from './usePdfTextEditorFormSignature'
import { usePdfTextEditorFormStyling } from './usePdfTextEditorFormStyling'
import { usePdfTextEditorFormValues } from './usePdfTextEditorFormValues'
import { usePdfFormFieldSnapGuides } from './usePdfFormFieldSnapGuides'

export function usePdfTextEditorForms({
  doc,
  page,
  layout,
  zoom,
  style,
  userKey,
  setTool,
  setEditingId,
  setSelectedId,
}: {
  doc: PdfDoc
  page: PdfPage | undefined
  layout: PageLayout | null
  zoom: number
  style: TextStyle
  userKey?: string
  setTool: (tool: Tool) => void
  setEditingId: (id: string | null) => void
  setSelectedId: (id: string | null) => void
}) {
  const [formFields, setFormFields] = useState<PdfFormFieldDraft[]>(
    () => doc.formFields ?? [],
  )
  const { beginFieldsGesture, commitFields, undoFields } = usePdfTextEditorFormHistory({
    fields: formFields,
    setFields: setFormFields,
  })
  const formClipboardRef = useRef<PdfFormFieldDraft[]>([])
  const {
    selectAdjacentDraftFormField,
    selectDraftFormField,
    selectDraftFormFieldsInBox,
    selectedDraftFormFields,
    selectedFormFieldId,
    selectedFormFieldIds,
    setSelectedFormFieldIds,
  } = usePdfTextEditorFormSelection({
    fields: formFields,
    pageId: page?.id ?? null,
    pageIndexById: Object.fromEntries(doc.pages.map((p, index) => [p.id, index])),
    setEditingId,
    setSelectedId,
  })

  usePdfTextEditorFormShortcuts({
    clipboardRef: formClipboardRef,
    currentPageId: page?.id ?? null,
    fields: formFields,
    selectedIds: selectedFormFieldIds,
    setEditingId,
    setFields: commitFields,
    setSelectedId,
    setSelectedIds: setSelectedFormFieldIds,
  })
  const {
    alignDraftFormFields,
    distributeDraftFormFields,
    duplicateSelectedDraftFormFields,
    matchDraftFormFieldSizes,
  } = usePdfTextEditorFormArrange({
    fields: formFields,
    selectedIds: selectedFormFieldIds,
    setFields: commitFields,
    setSelectedIds: setSelectedFormFieldIds,
  })
  const {
    applyDraftFieldPreset,
    applyDraftFieldStyle,
    applyDraftFieldVisual,
    fieldStyleDefaults,
    patchSelectedDraftFormFields,
    rememberFieldStyleDefaults,
  } = usePdfTextEditorFormStyling({
    selectedIds: selectedFormFieldIds,
    setFields: commitFields,
    userKey,
  })
  const {
    addFormField,
    cancelPendingFormField,
    pendingFieldBox,
    pendingFormKind,
    placePendingFormField,
    quickPlaceFormField,
  } = usePdfTextEditorFormPlacement({
    fields: formFields,
    setFields: commitFields,
    setFieldsLive: setFormFields,
    setSelectedIds: setSelectedFormFieldIds,
    setEditingId,
    setSelectedId,
    setTool,
    style,
    styleDefaults: fieldStyleDefaults,
    zoom,
  })
  const { applyDraftFormValues, clearDraftFormValues, updateDraftFormValue } =
    usePdfTextEditorFormValues({ setFields: setFormFields })
  const { formSnapGuides, snapForDrag, snapForResize } = usePdfFormFieldSnapGuides({
    fields: formFields,
    pageId: page?.id ?? null,
  })
  const {
    chooseSignatureImage,
    openSignature,
    saveSignatureDataUrl,
    setSignatureField,
    setSignatureFile,
    signatureField,
    signatureInputRef,
  } = usePdfTextEditorFormSignature({ updateDraftFormValue })

  function placePendingFormFieldOnPage(
    e: ReactPointerEvent,
    targetPage = page,
    targetLayout = layout,
  ) {
    placePendingFormField(e, targetPage, targetLayout)
  }

  /** Shift+clic sobre la página activa crea un casillero de texto al instante. */
  function quickPlaceDraftFormField(point: { xRatio: number; yRatio: number }): boolean {
    return quickPlaceFormField(point, page)
  }

  function addSuggestedFormFields(suggestions: PdfFormFieldDraft[]): number {
    const validSuggestions = suggestions.filter((suggestion) =>
      doc.pages.some((p) => p.id === suggestion.pageId),
    )
    if (validSuggestions.length === 0) return 0
    commitFields((fields) => {
      const next = [...fields]
      for (const suggestion of validSuggestions) {
        const field = {
          ...suggestion,
          name: uniqueFieldName(suggestion.name, next),
        }
        next.push(field)
      }
      return next
    })
    const first = validSuggestions[0]
    if (first) setSelectedFormFieldIds([first.id])
    setTool('select')
    setEditingId(null)
    setSelectedId(null)
    return validSuggestions.length
  }

  function patchDraftFormField(id: string, patch: Partial<PdfFormFieldDraft>) {
    setFormFields((fields) => patchDraftFormFields(fields, id, patch))
  }

  function deleteDraftFormField(id: string) {
    commitFields((fields) => fields.filter((field) => field.id !== id))
    setSelectedFormFieldIds((selected) => removeSelectedFormFieldId(selected, id))
  }

  function startDraftDrag(e: ReactPointerEvent, field: PdfFormFieldDraft) {
    // Un solo snapshot por gesto: el ⌘Z deshace el arrastre completo.
    beginFieldsGesture()
    startFormFieldDrag({
      event: e,
      field,
      fields: formFields,
      layout,
      selectedIds: selectedFormFieldIds,
      setFields: setFormFields,
      snap: snapForDrag(field, selectedFormFieldIds),
      zoom,
    })
  }

  function startDraftResize(
    e: ReactPointerEvent,
    field: PdfFormFieldDraft,
    handle: ResizeHandle,
  ) {
    beginFieldsGesture()
    startFormFieldResize({
      event: e,
      field,
      handle,
      layout,
      setFields: setFormFields,
      snap: snapForResize(field),
      zoom,
    })
  }

  return {
    addFormField,
    addSuggestedFormFields,
    alignDraftFormFields,
    applyDraftFormValues,
    applyDraftFieldPreset,
    applyDraftFieldStyle,
    applyDraftFieldVisual,
    cancelPendingFormField,
    clearDraftFormValues,
    deleteDraftFormField,
    distributeDraftFormFields,
    duplicateSelectedDraftFormFields,
    formFields,
    formSnapGuides,
    matchDraftFormFieldSizes,
    pendingFieldBox,
    pendingFormKind,
    placePendingFormField: placePendingFormFieldOnPage,
    quickPlaceDraftFormField,
    patchSelectedDraftFormFields,
    rememberFieldStyleDefaults,
    selectAdjacentDraftFormField,
    selectedDraftFormField:
      formFields.find((field) => field.id === selectedFormFieldId) ?? null,
    selectedDraftFormFields,
    openSignature,
    selectedFormFieldId,
    selectedFormFieldIds,
    selectDraftFormField,
    selectDraftFormFieldsInBox,
    chooseSignatureImage,
    saveSignatureDataUrl,
    setSignatureFile,
    setSignatureField,
    signatureField,
    signatureInputRef,
    startDraftDrag,
    startDraftResize,
    patchDraftFormField,
    undoDraftFormFields: undoFields,
    updateDraftFormValue,
  }
}
