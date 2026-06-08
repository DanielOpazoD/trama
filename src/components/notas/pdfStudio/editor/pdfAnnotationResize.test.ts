import { describe, expect, it } from 'vitest'
import type {
  HighlightAnnotation,
  ImageAnnotation,
  ShapeAnnotation,
  TextAnnotation,
} from '../../../../lib/pdfStudio/model/model'
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

const arrow: ShapeAnnotation = {
  id: 's1',
  kind: 'shape',
  shape: 'arrow',
  x0Ratio: 0.7,
  y0Ratio: 0.2,
  x1Ratio: 0.3,
  y1Ratio: 0.6,
  color: '#111111',
  strokeRatio: 0.003,
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

  it('redimensiona la caja real de texto cuando tiene ancho y alto', () => {
    const boxedText = { ...text, wRatio: 0.22, hRatio: 0.08 }
    const resized = resizeAnnotationFromPointerDelta(boxedText, 'se', {
      screenDx: 80,
      screenDy: 40,
      pageWidthPx: 800,
      pageHeightPx: 1000,
      rotationQuarters: 0,
      minBoxWidthRatio: 0.02,
      minBoxHeightRatio: 0.02,
    })

    expect(resized.sizeRatio).toBe(boxedText.sizeRatio)
    expect(resized.wRatio).toBeCloseTo(0.32)
    expect(resized.hRatio).toBeCloseTo(0.12)
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

  it('bloquea la proporción visual de imágenes cuando se redimensiona con modificador', () => {
    const resized = resizeAnnotationFromPointerDelta(image, 'se', {
      screenDx: 160,
      screenDy: 10,
      pageWidthPx: 800,
      pageHeightPx: 400,
      rotationQuarters: 0,
      lockAspectRatio: true,
    })

    expect((resized.wRatio * 800) / (resized.hRatio * 400)).toBeCloseTo(
      (image.wRatio * 800) / (image.hRatio * 400),
    )
    expect(resized.wRatio).toBeCloseTo(0.5)
    expect(resized.hRatio).toBeCloseTo(1 / 3)
  })

  it('redimensiona formas preservando la dirección de líneas y flechas', () => {
    const resized = resizeAnnotationFromPointerDelta(arrow, 'nw', {
      screenDx: -80,
      screenDy: -40,
      pageWidthPx: 800,
      pageHeightPx: 400,
      rotationQuarters: 0,
      minBoxWidthRatio: 0.02,
      minBoxHeightRatio: 0.02,
    })

    expect(resized).toMatchObject({
      ...arrow,
      x0Ratio: expect.closeTo(0.7, 8),
      y0Ratio: expect.closeTo(0.1, 8),
      x1Ratio: expect.closeTo(0.2, 8),
      y1Ratio: expect.closeTo(0.6, 8),
    })
  })
})
