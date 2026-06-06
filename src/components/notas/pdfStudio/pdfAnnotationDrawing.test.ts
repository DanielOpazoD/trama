import { describe, expect, it } from 'vitest'
import { createAnnotationFromDrawGesture } from './pdfAnnotationDrawing'

const style = {
  color: '#fff4a3',
  strokeRatio: 0.0025,
  highlightOpacity: 0.35,
}

describe('pdfAnnotationDrawing · createAnnotationFromDrawGesture', () => {
  it('ignora gestos demasiado pequeños para evitar anotaciones accidentales', () => {
    expect(
      createAnnotationFromDrawGesture({
        tool: 'highlight',
        x0: 10,
        y0: 10,
        x1: 12,
        y1: 12,
        pageWidthPx: 800,
        pageHeightPx: 600,
        style,
      }),
    ).toBeNull()
  })

  it('crea resaltados normalizando el rectángulo entre los dos puntos', () => {
    const annotation = createAnnotationFromDrawGesture({
      tool: 'highlight',
      x0: 260,
      y0: 220,
      x1: 100,
      y1: 80,
      pageWidthPx: 800,
      pageHeightPx: 700,
      style,
    })

    expect(annotation).toMatchObject({
      kind: 'highlight',
      xRatio: 0.125,
      yRatio: expect.closeTo(0.114285714, 8),
      wRatio: 0.2,
      hRatio: 0.2,
      color: '#fff4a3',
      opacity: 0.35,
    })
  })

  it('crea formas conservando dirección y grosor configurado', () => {
    const annotation = createAnnotationFromDrawGesture({
      tool: 'arrow',
      x0: 40,
      y0: 50,
      x1: 360,
      y1: 250,
      pageWidthPx: 400,
      pageHeightPx: 500,
      style,
    })

    expect(annotation).toMatchObject({
      kind: 'shape',
      shape: 'arrow',
      x0Ratio: 0.1,
      y0Ratio: 0.1,
      x1Ratio: 0.9,
      y1Ratio: 0.5,
      color: '#fff4a3',
      strokeRatio: 0.0025,
    })
  })
})
