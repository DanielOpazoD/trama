import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  type PdfDoc,
  type PdfFormFieldDraft,
  type PdfFormFieldKind,
  type PdfPage,
} from '../../../lib/pdfStudio/model'
import type { PageLayout, ResizeHandle } from '../../../lib/pdfStudio/editorGeometry'
import type { TextStyle, Tool } from './editorStyle'
import type { TemplateFillImportValues } from './pdfTemplateFillImport'
import {
  applyTemplateFieldValues,
  clearTemplateFieldValues,
} from './pdfTemplateFillValues'
import { makeDraftFormField } from './pdfFormFieldFactory'
import {
  startFormFieldDrag,
  startFormFieldResize,
  trackNewFieldDrag,
} from './pdfFormFieldPointer'
import { patchFormFieldTextStyle } from './pdfFormFieldStyle'
import { initialFieldBox, uniqueFieldName } from './pdfTextEditorFormDefaults'
import { usePdfTextEditorFormArrange } from './usePdfTextEditorFormArrange'
import { usePdfTextEditorFormShortcuts } from './usePdfTextEditorFormShortcuts'
import { usePdfTextEditorFormSignature } from './usePdfTextEditorFormSignature'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

export function usePdfTextEditorForms({
  doc,
  page,
  layout,
  zoom,
  style,
  setTool,
  setEditingId,
  setSelectedId,
}: {
  doc: PdfDoc
  page: PdfPage | undefined
  layout: PageLayout | null
  zoom: number
  style: TextStyle
  setTool: (tool: Tool) => void
  setEditingId: (id: string | null) => void
  setSelectedId: (id: string | null) => void
}) {
  const [formFields, setFormFields] = useState<PdfFormFieldDraft[]>(
    () => doc.formFields ?? [],
  )
  const [selectedFormFieldIds, setSelectedFormFieldIds] = useState<string[]>([])
  const formClipboardRef = useRef<PdfFormFieldDraft[]>([])
  const selectedFormFieldId =
    selectedFormFieldIds[selectedFormFieldIds.length - 1] ?? null
  const [pendingFormKind, setPendingFormKind] = useState<PdfFormFieldKind | null>(null)

  usePdfTextEditorFormShortcuts({
    clipboardRef: formClipboardRef,
    fields: formFields,
    selectedIds: selectedFormFieldIds,
    setEditingId,
    setFields: setFormFields,
    setSelectedId,
    setSelectedIds: setSelectedFormFieldIds,
  })
  const { alignDraftFormFields, distributeDraftFormFields } = usePdfTextEditorFormArrange(
    {
      selectedIds: selectedFormFieldIds,
      setFields: setFormFields,
    },
  )
  const {
    chooseSignatureImage,
    openSignature,
    saveSignatureDataUrl,
    setSignatureField,
    setSignatureFile,
    signatureField,
    signatureInputRef,
  } = usePdfTextEditorFormSignature({ updateDraftFormValue })

  function addFormField(kind: PdfFormFieldKind) {
    setPendingFormKind(kind)
    setTool('select')
    setEditingId(null)
    setSelectedId(null)
  }

  function placePendingFormField(
    e: ReactPointerEvent,
    targetPage = page,
    targetLayout = layout,
  ) {
    if (!targetPage || !targetLayout || !pendingFormKind) return
    e.stopPropagation()
    e.preventDefault()
    const base = initialFieldBox(pendingFormKind)
    const xRatio = clamp01(
      e.nativeEvent.offsetX / Math.max(1, targetLayout.innerW) - base.wRatio / 2,
    )
    const yRatio = clamp01(
      e.nativeEvent.offsetY / Math.max(1, targetLayout.innerH) - base.hRatio / 2,
    )
    const field = makeDraftFormField({
      kind: pendingFormKind,
      page: targetPage,
      fields: formFields,
      style,
      box: {
        ...base,
        xRatio: Math.min(1 - base.wRatio, xRatio),
        yRatio: Math.min(1 - base.hRatio, yRatio),
      },
    })
    if (!field) return
    setFormFields((fields) => [...fields, field])
    setSelectedFormFieldIds([field.id])
    setPendingFormKind(null)
    trackNewFieldDrag({
      event: e,
      field,
      layout: targetLayout,
      setFields: setFormFields,
      zoom,
    })
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
    setFormFields((fields) =>
      fields.map((field) =>
        field.id === id
          ? {
              ...field,
              ...patch,
              name:
                patch.name == null
                  ? field.name
                  : patch.name.trim().replace(/\s+/g, '_') || field.name,
            }
          : field,
      ),
    )
  }

  function deleteDraftFormField(id: string) {
    setFormFields((fields) => fields.filter((field) => field.id !== id))
    setSelectedFormFieldIds((selected) => selected.filter((fieldId) => fieldId !== id))
  }

  function selectDraftFormField(id: string, additive = false) {
    setSelectedFormFieldIds((selected) =>
      additive
        ? selected.includes(id)
          ? selected.filter((fieldId) => fieldId !== id)
          : [...selected, id]
        : [id],
    )
    setSelectedId(null)
    setEditingId(null)
  }

  function applyDraftFieldStyle(patch: Partial<TextStyle>) {
    if (selectedFormFieldIds.length === 0) return
    const selected = new Set(selectedFormFieldIds)
    setFormFields((fields) =>
      fields.map((field) =>
        selected.has(field.id) ? patchFormFieldTextStyle(field, patch) : field,
      ),
    )
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
    clearDraftFormValues,
    deleteDraftFormField,
    distributeDraftFormFields,
    formFields,
    pendingFormKind,
    placePendingFormField,
    selectedDraftFormField:
      formFields.find((field) => field.id === selectedFormFieldId) ?? null,
    openSignature,
    selectedFormFieldId,
    selectedFormFieldIds,
    selectDraftFormField,
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
