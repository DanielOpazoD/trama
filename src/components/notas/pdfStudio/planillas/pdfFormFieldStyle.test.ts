import { describe, expect, it } from 'vitest'
import { makePdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
import {
  formFieldChromeCss,
  formFieldTextCss,
  patchFormFieldVisual,
} from './pdfFormFieldStyle'

const base = makePdfFormFieldDraft({
  fieldKind: 'text',
  pageId: 'p1',
  name: 'paciente',
  value: '',
  xRatio: 0.1,
  yRatio: 0.2,
  wRatio: 0.3,
  hRatio: 0.05,
})

describe('patchFormFieldVisual', () => {
  it('fija propiedades visuales y las limpia con null', () => {
    const styled = patchFormFieldVisual(base, {
      color: '#b3412c',
      bgColor: '#ffffff',
      align: 'center',
    })
    expect(styled).toMatchObject({
      color: '#b3412c',
      bgColor: '#ffffff',
      align: 'center',
    })
    // undefined no toca; null limpia y vuelve al default del modo.
    const cleared = patchFormFieldVisual(styled, { bgColor: null })
    expect(cleared.bgColor).toBeUndefined()
    expect(cleared.color).toBe('#b3412c')
    expect(cleared.align).toBe('center')
  })
})

describe('formFieldChromeCss', () => {
  it('sin estilo declarado devuelve undefined (chrome por defecto del modo)', () => {
    expect(formFieldChromeCss(base)).toBeUndefined()
  })

  it('declara fondo y borde con grosor compensado por zoom', () => {
    const css = formFieldChromeCss({ bgColor: '#f2c94c', borderColor: '#222222' }, 2)
    expect(css).toMatchObject({
      backgroundColor: '#f2c94c',
      borderColor: '#222222',
      borderStyle: 'solid',
      borderWidth: '0.5px',
    })
  })
})

describe('formFieldTextCss', () => {
  it('agrega color y alineación solo cuando el casillero los declara', () => {
    expect(formFieldTextCss(base, 800)).not.toHaveProperty('color')
    expect(formFieldTextCss(base, 800)).not.toHaveProperty('textAlign')

    const styled = { ...base, color: '#2f5d8a', align: 'right' as const }
    expect(formFieldTextCss(styled, 800)).toMatchObject({
      color: '#2f5d8a',
      textAlign: 'right',
    })
  })
})
