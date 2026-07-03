import { describe, expect, it } from 'vitest'
import { snapFormFieldDrag, snapResizedFormFieldBox } from './pdfFormFieldSnap'

const PAGE = { pageWidthPx: 800, pageHeightPx: 1000 }
const other = { xRatio: 0.5, yRatio: 0.3, wRatio: 0.2, hRatio: 0.05 }

describe('snapFormFieldDrag', () => {
  it('imanta el borde izquierdo al borde de otro casillero y emite la guía', () => {
    // Movimiento deja el borde izquierdo a 4px (0.005) del borde de `other`.
    const result = snapFormFieldDrag({
      box: { xRatio: 0.1, yRatio: 0.8, wRatio: 0.1, hRatio: 0.05 },
      others: [other],
      dxRatio: 0.395,
      dyRatio: 0,
      ...PAGE,
    })
    expect(result.dxRatio).toBeCloseTo(0.4, 10)
    expect(result.guides).toContainEqual({ axis: 'x', ratio: 0.5 })
  })

  it('imanta el centro vertical al centro de la página', () => {
    const result = snapFormFieldDrag({
      box: { xRatio: 0.1, yRatio: 0.1, wRatio: 0.1, hRatio: 0.1 },
      others: [],
      dxRatio: 0,
      dyRatio: 0.353, // centro queda en 0.503 → snap a 0.5
      ...PAGE,
    })
    expect(result.dyRatio).toBeCloseTo(0.35, 10)
    expect(result.guides).toContainEqual({ axis: 'y', ratio: 0.5 })
  })

  it('lejos del umbral no ajusta nada ni emite guías', () => {
    const result = snapFormFieldDrag({
      box: { xRatio: 0.1, yRatio: 0.8, wRatio: 0.1, hRatio: 0.05 },
      others: [other],
      dxRatio: 0.05,
      dyRatio: 0.02,
      ...PAGE,
    })
    expect(result.dxRatio).toBe(0.05)
    expect(result.dyRatio).toBe(0.02)
    expect(result.guides).toEqual([])
  })
})

describe('snapResizedFormFieldBox', () => {
  const original = { xRatio: 0.1, yRatio: 0.1, wRatio: 0.2, hRatio: 0.05 }

  it('imanta el borde derecho en un resize hacia la derecha (izquierdo fijo)', () => {
    const next = { ...original, wRatio: 0.395 } // borde derecho en 0.495 → snap 0.5
    const result = snapResizedFormFieldBox({
      original,
      next,
      others: [other],
      ...PAGE,
    })
    expect(result.box.xRatio).toBe(0.1)
    expect(result.box.wRatio).toBeCloseTo(0.4, 10)
    expect(result.guides).toContainEqual({ axis: 'x', ratio: 0.5 })
  })

  it('imanta el borde superior en un resize hacia arriba (inferior fijo)', () => {
    // Original y: 0.4→0.5; el tope sube hasta 0.353, cerca del borde inferior
    // de `other` (0.35). El borde inferior propio no se mueve.
    const tall = { xRatio: 0.1, yRatio: 0.4, wRatio: 0.2, hRatio: 0.1 }
    const result = snapResizedFormFieldBox({
      original: tall,
      next: { xRatio: 0.1, yRatio: 0.353, wRatio: 0.2, hRatio: 0.147 },
      others: [other],
      ...PAGE,
    })
    expect(result.box.yRatio).toBeCloseTo(0.35, 10)
    expect(result.box.yRatio + result.box.hRatio).toBeCloseTo(0.5, 10)
    expect(result.guides).toContainEqual({ axis: 'y', ratio: 0.35 })
  })

  it('no encoge bajo el mínimo aunque haya guía cerca', () => {
    const result = snapResizedFormFieldBox({
      original,
      next: { xRatio: 0.1, yRatio: 0.1, wRatio: 0.398, hRatio: 0.05 },
      others: [other],
      minW: 0.399,
      ...PAGE,
    })
    // El snap más cercano (0.5 → w=0.4) sí respeta el mínimo; probamos el caso
    // contrario: un target que obligaría a encoger bajo minW se descarta.
    const shrink = snapResizedFormFieldBox({
      original,
      next: { xRatio: 0.1, yRatio: 0.1, wRatio: 0.403, hRatio: 0.05 },
      others: [other],
      minW: 0.404,
      ...PAGE,
    })
    expect(result.box.wRatio).toBeCloseTo(0.4, 10)
    expect(shrink.box.wRatio).toBe(0.403)
    expect(shrink.guides).toEqual([])
  })
})
