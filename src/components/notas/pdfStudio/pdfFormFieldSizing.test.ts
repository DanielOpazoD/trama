import { describe, expect, it } from 'vitest'
import { initialFieldBox, initialTextFieldBoxFromStyle } from './pdfFormFieldSizing'

describe('pdfFormFieldSizing', () => {
  it('crea casilleros de texto compactos desde el tamaño de letra activo', () => {
    expect(initialTextFieldBoxFromStyle({ sizeRatio: 0.04 })).toMatchObject({
      wRatio: 0.26,
      hRatio: 0.048,
    })
  })

  it('mantiene un mínimo usable para fuentes pequeñas sin volver al margen amplio fijo', () => {
    expect(initialTextFieldBoxFromStyle({ sizeRatio: 0.018 })).toMatchObject({
      wRatio: 0.18,
      hRatio: 0.026,
    })
  })

  it('usa el estilo al calcular el alto inicial de texto y fecha', () => {
    expect(initialFieldBox('text', { sizeRatio: 0.03 }).hRatio).toBeCloseTo(0.038)
    expect(initialFieldBox('date', { sizeRatio: 0.03 }).hRatio).toBeCloseTo(0.038)
  })

  it('preserva tamaños iniciales especiales para checks, radios y firmas', () => {
    expect(initialFieldBox('checkbox')).toMatchObject({ wRatio: 0.045, hRatio: 0.045 })
    expect(initialFieldBox('radio')).toMatchObject({ wRatio: 0.045, hRatio: 0.045 })
    expect(initialFieldBox('signature')).toMatchObject({ wRatio: 0.32, hRatio: 0.11 })
  })
})
