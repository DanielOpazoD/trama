import { describe, expect, it } from 'vitest'
import type {
  HighlightAnnotation,
  ImageAnnotation,
  TextAnnotation,
} from '../../../lib/pdfStudio/model'
import { resizeAnnotationFromPointerDelta } from './pdfAnnotationResize'

const text: TextAnnotation = {
  id: 't1',
  kind: 'text',
  text: 'Texto',
  xRatio: 0.2,
  yRatio: 0.3,
  sizeRatio: 0.04,
  color: '#111111',
  font: 'sans',
  bold: false,
}

const highlight: HighlightAnnotation = {
  id: 'h1',
  kind: 'highlight',
  xRatio: 0.2,
  yRatio: 0.3,
  wRatio: 0.25,
  hRatio: 0.1,
  color: '#fff4a3',
  opacity: 0.35,
}

const image: ImageAnnotation = {
  id: 'i1',
  kind: 'image',
  src: 'data:image/png;base64,aaa',
  xRatio: 0.1,
  yRatio: 0.2,
  wRatio: 0.3,
  hRatio: 0.2,
}

describe('pdfAnnotationResize · resizeAnnotationFromPointerDelta', () => {
  it('redimensiona texto desde una esquina cambiando solo el tamaño tipográfico', () => {
    const resized = resizeAnnotationFromPointerDelta(text, 'se', {
      screenDx: 32,
      screenDy: 24,
      pageWidthPx: 800,
      pageHeightPx: 600,
      rotationQuarters: 0,
      minTextSizeRatio: 0.012,
      maxTextSizeRatio: 0.14,
    })

    expect(resized).toEqual({
      ...text,
      sizeRatio: 0.08,
    })
  })

  it('redimensiona resaltados con mínimos táctiles y sin salir de la página', () => {
    const resized = resizeAnnotationFromPointerDelta(highlight, 'nw', {
      screenDx: 500,
      screenDy: 500,
      pageWidthPx: 1000,
      pageHeightPx: 1000,
      rotationQuarters: 0,
      minBoxWidthRatio: 0.05,
      minBoxHeightRatio: 0.05,
    })

    expect(resized).toMatchObject({
      ...highlight,
      xRatio: expect.closeTo(0.4, 8),
      yRatio: expect.closeTo(0.35, 8),
      wRatio: expect.closeTo(0.05, 8),
      hRatio: expect.closeTo(0.05, 8),
    })
  })

  it('redimensiona imágenes usando el delta de página correcto cuando hay rotación', () => {
    const resized = resizeAnnotationFromPointerDelta(image, 'se', {
      screenDx: 40,
      screenDy: 20,
      pageWidthPx: 400,
      pageHeightPx: 200,
      rotationQuarters: 1,
    })

    expect(resized).toMatchObject({
      ...image,
      wRatio: expect.closeTo(0.35, 8),
      hRatio: expect.closeTo(0.02, 8),
    })
  })
})
