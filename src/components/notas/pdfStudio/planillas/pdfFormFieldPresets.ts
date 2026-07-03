import type { PdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
import type { TextStyle } from '../editor/editorStyle'
import {
  patchFormFieldTextStyle,
  patchFormFieldVisual,
  type FormFieldVisualPatch,
} from './pdfFormFieldStyle'

export type FormFieldPresetKey = 'limpio' | 'formulario' | 'firma' | 'destacado'

/** Preset = parche puro sobre el sistema de estilo del casillero. Solo toca lo
 *  que declara: `null` limpia (vuelve al default transparente), lo ausente se
 *  conserva (p. ej. el tamaño de letra nunca cambia por un preset). */
export type FormFieldPreset = {
  key: FormFieldPresetKey
  label: string
  hint: string
  text?: Partial<TextStyle>
  visual: FormFieldVisualPatch
}

export const FORM_FIELD_PRESETS: FormFieldPreset[] = [
  {
    key: 'limpio',
    label: 'Limpio',
    hint: 'Solo el texto sobre el PDF: sin fondo, sin borde, tinta',
    text: { bold: false },
    visual: { color: null, bgColor: null, borderColor: null },
  },
  {
    key: 'formulario',
    label: 'Formulario',
    hint: 'Casillero clásico: borde tinta, sin fondo',
    visual: { bgColor: null, borderColor: '#222222' },
  },
  {
    key: 'firma',
    label: 'Firma',
    hint: 'Letra manuscrita sin marco (exporta la fuente real)',
    text: { font: 'script' },
    visual: { bgColor: null, borderColor: null },
  },
  {
    key: 'destacado',
    label: 'Destacado',
    hint: 'Fondo amarillo y negrita para resaltar',
    text: { bold: true },
    visual: { bgColor: '#f2c94c' },
  },
]

export function applyFormFieldPreset(
  field: PdfFormFieldDraft,
  key: FormFieldPresetKey,
): PdfFormFieldDraft {
  const preset = FORM_FIELD_PRESETS.find((candidate) => candidate.key === key)
  if (!preset) return field
  const styled = preset.text ? patchFormFieldTextStyle(field, preset.text) : field
  return patchFormFieldVisual(styled, preset.visual)
}
