import { describe, expect, it } from 'vitest'
import type { Annotation } from '../../../lib/pdfStudio/model/model'
import { snapAnnotationDrag } from './pdfAnnotationSnap'

const box = (
  id: string,
  xRatio: number,
  yRatio: number,
  wRatio: number,
  hRatio: number,
): Annotation => ({
  id,
  kind: 'highlight',
  xRatio,
  yRatio,
  wRatio,
  hRatio,
  color: '#fff4a3',
})

describe('pdfAnnotationSnap · snapAnnotationDrag', () => {
  it('ajusta el delta para alinear el borde izquierdo con otra anotación cercana', () => {
    const dragged = box('a', 0.2, 0.2, 0.2, 0.1)
    const other = box('b', 0.41, 0.5, 0.1, 0.1)

    const snapped = snapAnnotationDrag({
      annotation: dragged,
      annotations: [dragged, other],
      dxRatio: 0.205,
      dyRatio: 0,
      pageWidthPx: 1000,
      pageHeightPx: 1000,
      thresholdPx: 8,
    })

    expect(snapped.dxRatio).toBeCloseTo(0.21)
    expect(snapped.dyRatio).toBeCloseTo(0)
    expect(snapped.guides).toContainEqual({ axis: 'x', ratio: 0.41 })
  })

  it('ajusta el delta para alinear centros con la página', () => {
    const dragged = box('a', 0.15, 0.2, 0.2, 0.1)

    const snapped = snapAnnotationDrag({
      annotation: dragged,
      annotations: [dragged],
      dxRatio: 0.245,
      dyRatio: 0.255,
      pageWidthPx: 1000,
      pageHeightPx: 1000,
      thresholdPx: 8,
    })

    expect(snapped.dxRatio).toBeCloseTo(0.25)
    expect(snapped.dyRatio).toBeCloseTo(0.25)
    expect(snapped.guides).toEqual([
      { axis: 'x', ratio: 0.5 },
      { axis: 'y', ratio: 0.5 },
    ])
  })

  it('no ajusta el movimiento cuando ninguna guía está cerca', () => {
    const dragged = box('a', 0.15, 0.2, 0.2, 0.1)
    const other = box('b', 0.8, 0.8, 0.1, 0.1)

    const snapped = snapAnnotationDrag({
      annotation: dragged,
      annotations: [dragged, other],
      dxRatio: 0.12,
      dyRatio: 0.04,
      pageWidthPx: 1000,
      pageHeightPx: 1000,
      thresholdPx: 8,
    })

    expect(snapped).toEqual({ dxRatio: 0.12, dyRatio: 0.04, guides: [] })
  })
})
