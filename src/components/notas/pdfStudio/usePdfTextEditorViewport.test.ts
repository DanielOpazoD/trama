import { describe, expect, it } from 'vitest'
import { displayZoomToPageZoom } from './usePdfTextEditorViewport'

describe('usePdfTextEditorViewport', () => {
  it('usa 190% interno como el nuevo 100% visible', () => {
    expect(displayZoomToPageZoom(0.9)).toBeCloseTo(1.71)
    expect(displayZoomToPageZoom(1)).toBeCloseTo(1.9)
    expect(displayZoomToPageZoom(1.1)).toBeCloseTo(2.09)
    const jump75To100 = displayZoomToPageZoom(1) - displayZoomToPageZoom(0.75)
    const jump100To125 = displayZoomToPageZoom(1.25) - displayZoomToPageZoom(1)
    expect(jump75To100).toBeCloseTo(jump100To125)
  })

  it('acota valores fuera del rango permitido', () => {
    expect(displayZoomToPageZoom(0.25)).toBe(0.95)
    expect(displayZoomToPageZoom(5)).toBe(4)
  })
})
