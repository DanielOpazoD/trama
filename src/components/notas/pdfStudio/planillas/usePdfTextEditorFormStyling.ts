import { useState, type Dispatch, type SetStateAction } from 'react'
import type { PdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
import type { TextStyle } from '../editor/editorStyle'
import { applyFormFieldPreset, type FormFieldPresetKey } from './pdfFormFieldPresets'
import {
  patchFormFieldTextStyle,
  patchFormFieldVisual,
  type FormFieldVisualPatch,
} from './pdfFormFieldStyle'
import {
  formFieldStyleDefaultsFromField,
  loadFormFieldStyleDefaults,
  saveFormFieldStyleDefaults,
  type FormFieldStyleDefaults,
} from './pdfFormFieldStyleDefaults'

/** Estilo de la selección de casilleros: texto (fuente/tamaño/negrita), visual
 *  (color/fondo/borde/alineación), flags en lote y el default recordado para
 *  nuevos casilleros. Vive aparte de `usePdfTextEditorForms` para mantener ese
 *  hook como orquestador acotado. */
export function usePdfTextEditorFormStyling({
  selectedIds,
  setFields,
  userKey,
}: {
  selectedIds: string[]
  setFields: Dispatch<SetStateAction<PdfFormFieldDraft[]>>
  userKey?: string
}) {
  const [fieldStyleDefaults, setFieldStyleDefaults] =
    useState<FormFieldStyleDefaults | null>(() => loadFormFieldStyleDefaults(userKey))

  function applyToSelection(fn: (field: PdfFormFieldDraft) => PdfFormFieldDraft) {
    if (selectedIds.length === 0) return
    const selected = new Set(selectedIds)
    setFields((fields) =>
      fields.map((field) => (selected.has(field.id) ? fn(field) : field)),
    )
  }

  function applyDraftFieldStyle(patch: Partial<TextStyle>) {
    applyToSelection((field) => patchFormFieldTextStyle(field, patch))
  }

  function applyDraftFieldVisual(patch: FormFieldVisualPatch) {
    applyToSelection((field) => patchFormFieldVisual(field, patch))
  }

  function applyDraftFieldPreset(key: FormFieldPresetKey) {
    applyToSelection((field) => applyFormFieldPreset(field, key))
  }

  function patchSelectedDraftFormFields(
    patch: Partial<Pick<PdfFormFieldDraft, 'required' | 'readOnly'>>,
  ) {
    applyToSelection((field) => ({ ...field, ...patch }))
  }

  /** Fija el estilo del casillero como inicial para los próximos (persistente). */
  function rememberFieldStyleDefaults(field: PdfFormFieldDraft) {
    const defaults = formFieldStyleDefaultsFromField(field)
    setFieldStyleDefaults(defaults)
    saveFormFieldStyleDefaults(userKey, defaults)
  }

  return {
    applyDraftFieldPreset,
    applyDraftFieldStyle,
    applyDraftFieldVisual,
    fieldStyleDefaults,
    patchSelectedDraftFormFields,
    rememberFieldStyleDefaults,
  }
}
