import { describe, expect, it } from 'vitest'
import { formatExtensionTokenDate } from './extensionPanelModel'

describe('extensionPanelModel', () => {
  it('formatea fechas válidas con el formato corto del panel', () => {
    expect(formatExtensionTokenDate('2026-06-10T12:00:00.000Z')).toBe('10 jun 2026')
  })

  it('muestra nunca cuando no hay fecha o la fecha es inválida', () => {
    expect(formatExtensionTokenDate(null)).toBe('nunca')
    expect(formatExtensionTokenDate('fecha-imposible')).toBe('nunca')
  })
})
