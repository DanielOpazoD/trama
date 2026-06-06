import { describe, expect, it } from 'vitest'
import type { Annotation } from '../../../lib/pdfStudio/model'
import {
  alignAnnotations,
  annotationSelectionBox,
  distributeAnnotations,
  groupAnnotations,
  moveAnnotationLayer,
  selectAnnotationsInBox,
  setAnnotationsLocked,
  setAnnotationBounds,
  ungroupAnnotations,
} from './pdfAnnotationArrange'

const geom = { pageWidthPx: 600, pageHeightPx: 800 }

const text = (id: string, xRatio: number, yRatio: number): Annotation => ({
  id,
  kind: 'text',
  text: 'Texto',
  xRatio,
  yRatio,
  wRatio: 0.2,
  hRatio: 0.08,
  sizeRatio: 0.03,
  color: '#222222',
  font: 'sans',
  bold: false,
})

const mark = (id: string, xRatio: number, yRatio: number, wRatio = 0.1): Annotation => ({
  id,
  kind: 'highlight',
  xRatio,
  yRatio,
  wRatio,
  hRatio: 0.08,
  color: '#f2c94c',
  opacity: 0.45,
})

const shape = (id: string, x0Ratio: number, x1Ratio: number): Annotation => ({
  id,
  kind: 'shape',
  shape: 'line',
  x0Ratio,
  y0Ratio: 0.2,
  x1Ratio,
  y1Ratio: 0.3,
  color: '#222222',
  strokeRatio: 0.003,
})

describe('pdfAnnotationArrange', () => {
  it('alinea una anotación seleccionada contra la página', () => {
    const list = [text('a', 0.25, 0.2), mark('b', 0.4, 0.2)]

    expect(alignAnnotations(list, ['a'], 'left', geom)[0]).toMatchObject({
      xRatio: 0,
    })
    expect(alignAnnotations(list, ['a'], 'center', geom)[0]).toMatchObject({
      xRatio: 0.4,
    })
    expect(alignAnnotations(list, ['a'], 'right', geom)[0]).toMatchObject({
      xRatio: 0.8,
    })
  })

  it('alinea múltiples anotaciones al borde de la selección y conserva bloqueadas', () => {
    const locked = { ...mark('c', 0.45, 0.2), locked: true }
    const list = [text('a', 0.3, 0.2), mark('b', 0.1, 0.2), locked]

    const aligned = alignAnnotations(list, ['a', 'b', 'c'], 'left', geom)

    expect(aligned[0]).toMatchObject({ xRatio: 0.1 })
    expect(aligned[1]).toMatchObject({ xRatio: 0.1 })
    expect(aligned[2]).toBe(locked)
  })

  it('calcula el contorno unido de una selección múltiple', () => {
    const list = [text('a', 0.3, 0.2), mark('b', 0.1, 0.15), shape('c', 0.5, 0.7)]

    expect(annotationSelectionBox(list, ['a', 'b', 'c'], geom)).toMatchObject({
      xRatio: 0.1,
      yRatio: 0.15,
      wRatio: 0.6,
      hRatio: 0.15,
    })
  })

  it('selecciona anotaciones que intersectan un marco de selección', () => {
    const list = [
      text('a', 0.08, 0.08),
      mark('b', 0.36, 0.28),
      shape('c', 0.7, 0.8),
      { ...mark('d', 0.2, 0.2), locked: true },
    ]

    expect(
      selectAnnotationsInBox(
        list,
        { xRatio: 0.05, yRatio: 0.05, wRatio: 0.42, hRatio: 0.28 },
        geom,
      ),
    ).toEqual(['a', 'b', 'd'])
  })

  it('distribuye tres o más anotaciones por centros y respeta formas', () => {
    const list = [
      mark('a', 0.1, 0.1, 0.1),
      shape('b', 0.4, 0.5),
      mark('c', 0.8, 0.1, 0.1),
    ]

    const distributed = distributeAnnotations(list, ['a', 'b', 'c'], 'x', geom)

    expect(distributed[0]).toMatchObject({ xRatio: 0.1 })
    expect(distributed[1]).toMatchObject({ x0Ratio: 0.45, x1Ratio: 0.55 })
    expect(distributed[2]).toMatchObject({ xRatio: 0.8 })
  })

  it('edita posición y tamaño de una anotación desde bounds normalizados', () => {
    const list = [text('a', 0.3, 0.2), mark('b', 0.1, 0.1), shape('c', 0.4, 0.5)]

    expect(
      setAnnotationBounds(list, 'a', { xRatio: 0.12, wRatio: 0.32 })[0],
    ).toMatchObject({
      xRatio: 0.12,
      yRatio: 0.2,
      wRatio: 0.32,
      hRatio: 0.08,
    })
    expect(
      setAnnotationBounds(list, 'b', { yRatio: 0.22, hRatio: 0.18 })[1],
    ).toMatchObject({
      xRatio: 0.1,
      yRatio: 0.22,
      wRatio: 0.1,
      hRatio: 0.18,
    })
    expect(setAnnotationBounds(list, 'c', { xRatio: 0.2, wRatio: 0.3 })[2]).toMatchObject(
      {
        x0Ratio: 0.2,
        x1Ratio: 0.5,
        y0Ratio: 0.2,
        y1Ratio: 0.3,
      },
    )
  })

  it('acota bounds inválidos y respeta anotaciones bloqueadas', () => {
    const locked = { ...mark('a', 0.2, 0.2), locked: true }
    const list = [locked, mark('b', 0.2, 0.2)]

    expect(setAnnotationBounds(list, 'a', { xRatio: 0.8 })).toBe(list)
    expect(
      setAnnotationBounds(list, 'b', {
        xRatio: 1.5,
        yRatio: -1,
        wRatio: 0,
        hRatio: 2,
      })[1],
    ).toMatchObject({
      xRatio: 0.99,
      yRatio: 0,
      wRatio: 0.01,
      hRatio: 1,
    })
  })

  it('mueve capas por orden visual sin mutar la lista original', () => {
    const list = [mark('a', 0.1, 0.1), mark('b', 0.2, 0.1), mark('c', 0.3, 0.1)]

    expect(moveAnnotationLayer(list, 'a', 'front').map((a) => a.id)).toEqual([
      'b',
      'c',
      'a',
    ])
    expect(moveAnnotationLayer(list, 'c', 'back').map((a) => a.id)).toEqual([
      'c',
      'a',
      'b',
    ])
    expect(list.map((a) => a.id)).toEqual(['a', 'b', 'c'])
  })

  it('bloquea y agrupa anotaciones con metadatos mínimos', () => {
    const list = [mark('a', 0.1, 0.1), text('b', 0.2, 0.1), mark('c', 0.3, 0.1)]

    const locked = setAnnotationsLocked(list, ['a', 'b'], true)
    expect(locked.map((a) => a.locked ?? false)).toEqual([true, true, false])

    const grouped = groupAnnotations(locked, ['a', 'b'], 'g1')
    expect(grouped.map((a) => a.groupId ?? null)).toEqual(['g1', 'g1', null])

    const ungrouped = ungroupAnnotations(grouped, ['a'])
    expect(ungrouped.map((a) => a.groupId ?? null)).toEqual([null, 'g1', null])
  })
})
