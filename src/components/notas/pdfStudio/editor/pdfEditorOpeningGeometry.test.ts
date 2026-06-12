import { describe, expect, it } from 'vitest'
import {
  capturePdfEditorHeightBaseline,
  compensatePdfEditorInflation,
  pdfEditorGeometrySignature,
  placePdfEditorPage,
} from './pdfEditorOpeningGeometry'

/**
 * Helpers puros de la transición de apertura. El layout se modela como una
 * columna de secciones cuyas alturas pueden cambiar (placeholder → hoja real):
 * los tops derivan de las alturas vigentes, igual que el flujo del documento.
 */

function rect(top: number, height: number): DOMRect {
  return {
    top,
    left: 0,
    width: 400,
    height,
    bottom: top + height,
    right: 400,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

function makeColumn(heights: number[], sheets: boolean[]) {
  const container = document.createElement('div') as HTMLElement & {
    getBoundingClientRect: () => DOMRect
  }
  Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true })
  container.getBoundingClientRect = () => rect(0, 400)
  heights.forEach((_, i) => {
    const section = document.createElement('section') as HTMLElement & {
      getBoundingClientRect: () => DOMRect
    }
    section.dataset.pdfEditorPage = String(i)
    if (sheets[i]) section.dataset.pdfEditorSheet = String(i)
    section.getBoundingClientRect = () => {
      const top = heights.slice(0, i).reduce((a, b) => a + b, 0)
      return rect(top - container.scrollTop, heights[i] ?? 0)
    }
    container.append(section)
  })
  return container
}

describe('placePdfEditorPage', () => {
  it('centra la hoja real y reporta colocada solo si es la más visible', () => {
    const container = makeColumn([700, 700, 700], [true, true, true])
    const result = placePdfEditorPage(container, 2)
    expect(container.scrollTop).toBe(1400)
    expect(result).toEqual({ placed: true, sheetReady: true })
  })

  it('con placeholder hace mejor esfuerzo sobre la sección pero no la da por colocada', () => {
    const container = makeColumn([700, 700, 700], [true, true, false])
    const result = placePdfEditorPage(container, 2)
    expect(container.scrollTop).toBe(1400)
    expect(result).toEqual({ placed: false, sheetReady: false })
  })

  it('sin destino o sin altura medible no toca el scroll', () => {
    const container = makeColumn([700, 0], [true, false])
    expect(placePdfEditorPage(container, 1)).toEqual({
      placed: false,
      sheetReady: false,
    })
    expect(container.scrollTop).toBe(0)
    expect(placePdfEditorPage(null, 0)).toEqual({ placed: false, sheetReady: false })
  })
})

describe('pdfEditorGeometrySignature', () => {
  it('cambia si una sección HASTA la pedida cambia de alto o gana su hoja', () => {
    const heights = [700, 550, 700]
    const container = makeColumn(heights, [true, false, true])
    const before = pdfEditorGeometrySignature(container, 2)
    heights[1] = 900
    const inflated = pdfEditorGeometrySignature(container, 2)
    expect(inflated).not.toBe(before)
    container
      .querySelector<HTMLElement>('[data-pdf-editor-page="1"]')!
      .setAttribute('data-pdf-editor-sheet', '1')
    expect(pdfEditorGeometrySignature(container, 2)).not.toBe(inflated)
  })

  it('ignora las secciones DESPUÉS de la pedida (no determinan su offset)', () => {
    const heights = [700, 700, 700, 550]
    const container = makeColumn(heights, [true, true, true, false])
    const before = pdfEditorGeometrySignature(container, 2)
    heights[3] = 2000
    expect(pdfEditorGeometrySignature(container, 2)).toBe(before)
  })

  it('es estable frente al scroll (coordenadas de contenido)', () => {
    const container = makeColumn([700, 700, 700], [true, true, true])
    const before = pdfEditorGeometrySignature(container, 2)
    container.scrollTop = 800
    expect(pdfEditorGeometrySignature(container, 2)).toBe(before)
  })
})

describe('compensatePdfEditorInflation', () => {
  it('compensa el scroll cuando una sección completamente arriba se infla', () => {
    const heights = [700, 700, 700, 700]
    const container = makeColumn(heights, [true, true, true, true])
    container.scrollTop = 2100 // mirando la página 4
    const baseline = capturePdfEditorHeightBaseline(container, 1)
    heights[0] = 1000 // render lento: +300px arriba del viewport
    compensatePdfEditorInflation(container, baseline, 1)
    expect(container.scrollTop).toBe(2400)
  })

  it('no compensa secciones visibles o por debajo del viewport', () => {
    const heights = [700, 700, 700, 700]
    const container = makeColumn(heights, [true, true, true, true])
    container.scrollTop = 2100
    const baseline = capturePdfEditorHeightBaseline(container, 1)
    heights[3] = 1000 // la página visible crece hacia abajo
    compensatePdfEditorInflation(container, baseline, 1)
    expect(container.scrollTop).toBe(2100)
  })

  it('un cambio de zoom solo re-fotografía: las anclas de zoom mandan ahí', () => {
    const heights = [700, 700, 700, 700]
    const container = makeColumn(heights, [true, true, true, true])
    container.scrollTop = 2100
    const baseline = capturePdfEditorHeightBaseline(container, 1)
    heights[0] = 875 // todo se re-dimensiona por zoom a la vez
    const next = compensatePdfEditorInflation(container, baseline, 1.25)
    expect(container.scrollTop).toBe(2100)
    expect(next?.zoom).toBe(1.25)
    // La próxima inflación real, ya con la foto nueva, sí compensa.
    heights[1] = 1000
    compensatePdfEditorInflation(container, next, 1.25)
    expect(container.scrollTop).toBe(2400)
  })

  it('devuelve la foto nueva como nueva línea base', () => {
    const heights = [700, 700]
    const container = makeColumn(heights, [true, true])
    const baseline = capturePdfEditorHeightBaseline(container, 1)
    heights[0] = 900
    const next = compensatePdfEditorInflation(container, baseline, 1)
    expect(next?.heights).toEqual([900, 700])
  })
})
