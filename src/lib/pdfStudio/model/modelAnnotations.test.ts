import { describe, it, expect } from 'vitest'
import {
  makeTextAnnotation,
  makeRedactionAnnotation,
  makeShapeAnnotation,
  cloneAnnotation,
  translateAnnotation,
  isTextAnnotation,
  pageHasAnnotations,
  setPageAnnotations,
  applyEdits,
} from './modelAnnotations'
import type {
  Annotation,
  PdfDoc,
  PdfPage,
  ShapeAnnotation,
  TextAnnotation,
} from './modelTypes'

/**
 * Modelo de anotaciones del editor PDF: factories, clonado, traslación con
 * clamping y reemplazo por página. Todo puro (devuelve copias nuevas; no-op con
 * el MISMO objeto cuando el índice está fuera de rango). Los tests fijan los
 * detalles que sostienen la integridad de las anotaciones: prefijo del id según
 * tipo, opacidad forzada de las redacciones, acotado de anclajes a 0..1 y el
 * ancla doble (x0/y0/x1/y1) de las formas.
 */

const textInit: Omit<TextAnnotation, 'id' | 'kind'> = {
  text: 'hola',
  xRatio: 0.5,
  yRatio: 0.5,
  sizeRatio: 0.05,
  color: '#000',
  font: 'sans',
  bold: false,
}

const shapeInit: Omit<ShapeAnnotation, 'id' | 'kind'> = {
  shape: 'rect',
  x0Ratio: 0.25,
  y0Ratio: 0.25,
  x1Ratio: 0.5,
  y1Ratio: 0.5,
  color: '#000',
  strokeRatio: 0.01,
}

describe('factories de anotaciones', () => {
  it('makeTextAnnotation pone kind=text e id con prefijo "t", y preserva el init', () => {
    const a = makeTextAnnotation(textInit)
    expect(a.kind).toBe('text')
    expect(a.id.startsWith('t')).toBe(true)
    expect(a).toMatchObject(textInit)
  })

  it('makeRedactionAnnotation fuerza opacity=1 (no es un rectángulo visual cualquiera)', () => {
    const r = makeRedactionAnnotation({
      xRatio: 0,
      yRatio: 0,
      wRatio: 0.2,
      hRatio: 0.1,
      color: '#000',
    })
    expect(r.kind).toBe('redaction')
    expect(r.opacity).toBe(1)
    expect(r.id.startsWith('r')).toBe(true)
  })

  it('makeShapeAnnotation pone kind=shape e id con prefijo "a"', () => {
    const s = makeShapeAnnotation(shapeInit)
    expect(s.kind).toBe('shape')
    expect(s.id.startsWith('a')).toBe(true)
  })
})

describe('cloneAnnotation', () => {
  it('clona texto con id NUEVO de prefijo "t", preservando el contenido', () => {
    const original = makeTextAnnotation(textInit)
    const copy = cloneAnnotation(original)
    expect(copy.id).not.toBe(original.id)
    expect(copy.id.startsWith('t')).toBe(true)
    expect(copy).toMatchObject({ kind: 'text', text: 'hola' })
  })

  it('clona no-texto con id NUEVO de prefijo "a"', () => {
    const original = makeShapeAnnotation(shapeInit)
    const copy = cloneAnnotation(original)
    expect(copy.id).not.toBe(original.id)
    expect(copy.id.startsWith('a')).toBe(true)
  })
})

describe('translateAnnotation', () => {
  it('mueve el ancla simple (no-forma) y la acota a 0..1', () => {
    const a = makeTextAnnotation(textInit) // 0.5, 0.5
    const moved = translateAnnotation(a, 0.25, -0.25)
    expect(moved).toMatchObject({ xRatio: 0.75, yRatio: 0.25 })
  })

  it('clampa a [0,1] cuando el desplazamiento se sale del rango', () => {
    const a = makeTextAnnotation({ ...textInit, xRatio: 0.75, yRatio: 0.25 })
    const moved = translateAnnotation(a, 0.5, -0.5) as TextAnnotation
    expect(moved.xRatio).toBe(1) // min(1, 1.25)
    expect(moved.yRatio).toBe(0) // max(0, -0.25)
  })

  it('mueve los CUATRO anclajes de una forma, acotando cada uno', () => {
    const s = makeShapeAnnotation(shapeInit) // 0.25,0.25 → 0.5,0.5
    const moved = translateAnnotation(s, 0.25, 0.25) as ShapeAnnotation
    expect(moved).toMatchObject({
      x0Ratio: 0.5,
      y0Ratio: 0.5,
      x1Ratio: 0.75,
      y1Ratio: 0.75,
    })
  })
})

describe('predicados', () => {
  it('isTextAnnotation discrimina por kind', () => {
    expect(isTextAnnotation(makeTextAnnotation(textInit))).toBe(true)
    expect(isTextAnnotation(makeShapeAnnotation(shapeInit))).toBe(false)
  })

  it('pageHasAnnotations refleja si hay alguna', () => {
    const empty: PdfPage = {
      id: 'pg',
      annotations: [],
      rotationQuarters: 0,
      kind: 'pdf',
      sourceId: 's',
      pageIndex: 0,
    }
    expect(pageHasAnnotations(empty)).toBe(false)
    expect(
      pageHasAnnotations({ ...empty, annotations: [makeTextAnnotation(textInit)] }),
    ).toBe(true)
  })
})

describe('setPageAnnotations / applyEdits', () => {
  function doc(pageCount: number): PdfDoc {
    const file = new File([], 's.pdf', { type: 'application/pdf' })
    return {
      sources: [{ id: 's', kind: 'pdf', file, pageCount }],
      pages: Array.from({ length: pageCount }, (_, i) => ({
        id: `pg-${i}`,
        annotations: [] as Annotation[],
        rotationQuarters: 0,
        kind: 'pdf' as const,
        sourceId: 's',
        pageIndex: i,
      })),
    }
  }

  it('reemplaza las anotaciones de la página indicada sin tocar las demás', () => {
    const d = doc(2)
    const ann = makeTextAnnotation(textInit)
    const after = setPageAnnotations(d, 1, [ann])
    expect(after.pages[0]!.annotations).toEqual([])
    expect(after.pages[1]!.annotations).toEqual([ann])
  })

  it('es no-op (mismo objeto) con índice fuera de rango', () => {
    const d = doc(1)
    expect(setPageAnnotations(d, 5, [makeTextAnnotation(textInit)])).toBe(d)
    expect(setPageAnnotations(d, -1, [])).toBe(d)
  })

  it('applyEdits aplica un mapa índice→anotaciones de una sola pasada', () => {
    const d = doc(3)
    const a0 = makeTextAnnotation({ ...textInit, text: 'p0' })
    const a2 = makeShapeAnnotation(shapeInit)
    const after = applyEdits(d, { 0: [a0], 2: [a2] })
    expect(after.pages[0]!.annotations).toEqual([a0])
    expect(after.pages[1]!.annotations).toEqual([])
    expect(after.pages[2]!.annotations).toEqual([a2])
  })
})
