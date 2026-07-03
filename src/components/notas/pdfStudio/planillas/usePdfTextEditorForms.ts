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
import type { TemplateFillImportValues } from './fill/pdfTemplateFillImport'
import {
  applyTemplateFieldValues,
  clearTemplateFieldValues,
} from './fill/pdfTemplateFillValues'
import { startFormFieldDrag, startFormFieldResize } from './pdfFormFieldPointer'
import { uniqueFieldName } from './pdfTextEditorFormDefaults'
import {
  patchDraftFormFields,
  removeSelectedFormFieldId,
} from './pdfTextEditorFormDraftModel'
import { usePdfTextEditorFormArrange } from './usePdfTextEditorFormArrange'
import { usePdfTextEditorFormPlacement } from './usePdfTextEditorFormPlacement'
import { usePdfTextEditorFormSelection } from './usePdfTextEditorFormSelection'
import { usePdfTextEditorFormShortcuts } from './usePdfTextEditorFormShortcuts'
import { usePdfTextEditorFormSignature } from './usePdfTextEditorFormSignature'
import { usePdfTextEditorFormStyling } from './usePdfTextEditorFormStyling'

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
  const formClipboardRef = useRef<PdfFormFieldDraft[]>([])
  const {
    selectDraftFormField,
    selectDraftFormFieldsInBox,
    selectedDraftFormFields,
    selectedFormFieldId,
    selectedFormFieldIds,
    setSelectedFormFieldIds,
  } = usePdfTextEditorFormSelection({
    fields: formFields,
    pageId: page?.id ?? null,
    setEditingId,
    setSelectedId,
  })

  usePdfTextEditorFormShortcuts({
    clipboardRef: formClipboardRef,
    currentPageId: page?.id ?? null,
    fields: formFields,
    selectedIds: selectedFormFieldIds,
    setEditingId,
    setFields: setFormFields,
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
    setFields: setFormFields,
    setSelectedIds: setSelectedFormFieldIds,
  })
  const {
    applyDraftFieldStyle,
    applyDraftFieldVisual,
    fieldStyleDefaults,
    patchSelectedDraftFormFields,
    rememberFieldStyleDefaults,
  } = usePdfTextEditorFormStyling({
    selectedIds: selectedFormFieldIds,
    setFields: setFormFields,
    userKey,
  })
  const {
    addFormField,
    cancelPendingFormField,
    pendingFieldBox,
    pendingFormKind,
    placePendingFormField,
  } = usePdfTextEditorFormPlacement({
    fields: formFields,
    setFields: setFormFields,
    setSelectedIds: setSelectedFormFieldIds,
    setEditingId,
    setSelectedId,
    setTool,
    style,
    styleDefaults: fieldStyleDefaults,
    zoom,
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

  function updateDraftFormValue(id: string, value: string | boolean) {
    setFormFields((fields) =>
      fields.map((field) => (field.id === id ? { ...field, value } : field)),
    )
  }

  function clearDraftFormValues() {
    setFormFields(clearTemplateFieldValues)
  }

  function applyDraftFormValues(values: TemplateFillImportValues): number {
    let applied = 0
    setFormFields((fields) => {
      const result = applyTemplateFieldValues(fields, values)
      applied = result.applied
      return result.fields
    })
    return applied
  }

  function addSuggestedFormFields(suggestions: PdfFormFieldDraft[]): number {
    const validSuggestions = suggestions.filter((suggestion) =>
      doc.pages.some((p) => p.id === suggestion.pageId),
    )
    if (validSuggestions.length === 0) return 0
    setFormFields((fields) => {
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
    setFormFields((fields) => fields.filter((field) => field.id !== id))
    setSelectedFormFieldIds((selected) => removeSelectedFormFieldId(selected, id))
  }

  function startDraftDrag(e: ReactPointerEvent, field: PdfFormFieldDraft) {
    startFormFieldDrag({
      event: e,
      field,
      fields: formFields,
      layout,
      selectedIds: selectedFormFieldIds,
      setFields: setFormFields,
      zoom,
    })
  }

  function startDraftResize(
    e: ReactPointerEvent,
    field: PdfFormFieldDraft,
    handle: ResizeHandle,
  ) {
    startFormFieldResize({
      event: e,
      field,
      handle,
      layout,
      setFields: setFormFields,
      zoom,
    })
  }

  return {
    addFormField,
    addSuggestedFormFields,
    alignDraftFormFields,
    applyDraftFormValues,
    applyDraftFieldStyle,
    applyDraftFieldVisual,
    cancelPendingFormField,
    clearDraftFormValues,
    deleteDraftFormField,
    distributeDraftFormFields,
    duplicateSelectedDraftFormFields,
    formFields,
    matchDraftFormFieldSizes,
    pendingFieldBox,
    pendingFormKind,
    placePendingFormField: placePendingFormFieldOnPage,
    patchSelectedDraftFormFields,
    rememberFieldStyleDefaults,
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
    updateDraftFormValue,
  }
}
