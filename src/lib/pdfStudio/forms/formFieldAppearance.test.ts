import { describe, expect, it } from 'vitest'
import {
  FORM_FIELD_EXPORT_BORDER_WIDTH,
  formFieldAppearanceValues,
  hexToRgb01,
} from './formFieldAppearance'

describe('hexToRgb01', () => {
  it('convierte #rrggbb a componentes 0..1', () => {
    expect(hexToRgb01('#ffffff')).toEqual([1, 1, 1])
    expect(hexToRgb01('#000000')).toEqual([0, 0, 0])
    expect(hexToRgb01('2f5d8a')?.[0]).toBeCloseTo(47 / 255)
  })

  it('rechaza valores ausentes o mal formados', () => {
    expect(hexToRgb01(undefined)).toBeNull()
    expect(hexToRgb01('')).toBeNull()
    expect(hexToRgb01('#fff')).toBeNull()
    expect(hexToRgb01('rojo')).toBeNull()
  })
})

describe('formFieldAppearanceValues', () => {
  it('sin estilo declarado no impone apariencia (queda transparente)', () => {
    expect(formFieldAppearanceValues({})).toEqual({})
  })

  it('mapea solo lo declarado, con grosor de borde al fijar color de borde', () => {
    const appearance = formFieldAppearanceValues({
      color: '#b3412c',
      borderColor: '#222222',
      align: 'center',
    })

    expect(appearance.textColor?.[0]).toBeCloseTo(179 / 255)
    expect(appearance.backgroundColor).toBeUndefined()
    expect(appearance.borderColor?.[0]).toBeCloseTo(34 / 255)
    expect(appearance.borderWidth).toBe(FORM_FIELD_EXPORT_BORDER_WIDTH)
    expect(appearance.align).toBe('center')
  })

  it('ignora hex inválidos sin romper el resto del estilo', () => {
    const appearance = formFieldAppearanceValues({
      color: 'no-es-hex',
      bgColor: '#f2c94c',
    })

    expect(appearance.textColor).toBeUndefined()
    expect(appearance.backgroundColor?.[0]).toBeCloseTo(242 / 255)
  })
})
