import { describe, expect, it } from 'vitest'
import { displayZoomToPageZoom } from './usePdfTextEditorViewport'

describe('usePdfTextEditorViewport', () => {
  it('usa el 100% visible como escala real usable de la hoja', () => {
    expect(displayZoomToPageZoom(0.9)).toBeCloseTo(0.9)
    expect(displayZoomToPageZoom(1)).toBeCloseTo(1)
    expect(displayZoomToPageZoom(1.1)).toBeCloseTo(1.1)
    const jump75To100 = displayZoomToPageZoom(1) - displayZoomToPageZoom(0.75)
    const jump100To125 = displayZoomToPageZoom(1.25) - displayZoomToPageZoom(1)
    expect(jump75To100).toBeCloseTo(jump100To125)
  })

  it('acota valores fuera del rango permitido', () => {
    expect(displayZoomToPageZoom(0.25)).toBe(0.5)
    expect(displayZoomToPageZoom(5)).toBe(2.1)
  })
})
