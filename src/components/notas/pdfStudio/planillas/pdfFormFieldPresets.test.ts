import { describe, expect, it } from 'vitest'
import { makePdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
import { applyFormFieldPreset, FORM_FIELD_PRESETS } from './pdfFormFieldPresets'

const styled = makePdfFormFieldDraft({
  fieldKind: 'text',
  pageId: 'p1',
  name: 'paciente',
  value: '',
  xRatio: 0.1,
  yRatio: 0.2,
  wRatio: 0.3,
  hRatio: 0.05,
  sizeRatio: 0.06,
  bold: true,
  color: '#b3412c',
  bgColor: '#f2c94c',
  borderColor: '#2f5d8a',
  align: 'center',
})

describe('applyFormFieldPreset', () => {
  it('limpio deja solo el texto: sin fondo, sin borde, tinta, sin negrita', () => {
    const clean = applyFormFieldPreset(styled, 'limpio')

    expect(clean).toMatchObject({ bold: false })
    expect(clean.color).toBeUndefined()
    expect(clean.bgColor).toBeUndefined()
    expect(clean.borderColor).toBeUndefined()
    // Lo que el preset no declara se conserva (tamaño y alineación).
    expect(clean.sizeRatio).toBe(0.06)
    expect(clean.align).toBe('center')
  })

  it('formulario pone borde tinta y quita el fondo, sin tocar el texto', () => {
    const form = applyFormFieldPreset(styled, 'formulario')

    expect(form.borderColor).toBe('#222222')
    expect(form.bgColor).toBeUndefined()
    expect(form.bold).toBe(true)
    expect(form.color).toBe('#b3412c')
  })

  it('firma cambia a manuscrita y quita el marco', () => {
    const signature = applyFormFieldPreset(styled, 'firma')

    expect(signature.font).toBe('script')
    expect(signature.bgColor).toBeUndefined()
    expect(signature.borderColor).toBeUndefined()
  })

  it('destacado pone fondo amarillo y negrita', () => {
    const highlight = applyFormFieldPreset(
      { ...styled, bold: false, bgColor: undefined },
      'destacado',
    )

    expect(highlight.bgColor).toBe('#f2c94c')
    expect(highlight.bold).toBe(true)
  })

  it('una clave desconocida no toca el casillero', () => {
    expect(
      applyFormFieldPreset(
        styled,
        'inexistente' as Parameters<typeof applyFormFieldPreset>[1],
      ),
    ).toBe(styled)
  })

  it('todos los presets declaran label y hint para la UI', () => {
    for (const preset of FORM_FIELD_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0)
      expect(preset.hint.length).toBeGreaterThan(0)
    }
  })
})
