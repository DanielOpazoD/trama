import { describe, expect, it } from 'vitest'
import {
  centerPdfEditorSheetHorizontally,
  capturePdfEditorScrollAnchor,
  findMostVisiblePdfEditorPage,
  restorePdfEditorScrollAnchor,
} from './pdfEditorZoomScroll'

function rect(top: number, left: number, width: number, height: number): DOMRect {
  return {
    top,
    left,
    width,
    height,
    bottom: top + height,
    right: left + width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

function makeContainer() {
  const container = document.createElement('div') as HTMLDivElement & {
    getBoundingClientRect: () => DOMRect
  }
  Object.defineProperties(container, {
    clientWidth: { value: 500, configurable: true },
    clientHeight: { value: 400, configurable: true },
  })
  container.scrollTop = 120
  container.scrollLeft = 40
  container.getBoundingClientRect = () => rect(100, 50, 500, 400)
  return container
}

describe('pdfEditorZoomScroll', () => {
  it('captura la hoja que cruza el centro visible y restaura ese mismo punto tras zoom', () => {
    const container = makeContainer()
    const page = document.createElement('section') as HTMLElement & {
      getBoundingClientRect: () => DOMRect
    }
    page.dataset.pdfEditorPage = '0'
    page.getBoundingClientRect = () => rect(40, 100, 300, 600)
    container.append(page)

    const anchor = capturePdfEditorScrollAnchor(container)

    expect(anchor).toEqual({
      pageIndex: 0,
      xRatio: 0.5,
      yRatio: 0.43333333333333335,
    })

    page.getBoundingClientRect = () => rect(-220, 75, 450, 900)
    restorePdfEditorScrollAnchor(container, anchor)

    expect(container.scrollTop).toBeCloseTo(-10)
    expect(container.scrollLeft).toBeCloseTo(40)
  })

  it('usa la página más cercana cuando el centro queda entre dos hojas', () => {
    const container = makeContainer()
    const first = document.createElement('section') as HTMLElement & {
      getBoundingClientRect: () => DOMRect
    }
    const second = document.createElement('section') as HTMLElement & {
      getBoundingClientRect: () => DOMRect
    }
    first.dataset.pdfEditorPage = '0'
    second.dataset.pdfEditorPage = '1'
    first.getBoundingClientRect = () => rect(-500, 100, 300, 300)
    second.getBoundingClientRect = () => rect(360, 100, 300, 300)
    container.append(first, second)

    expect(capturePdfEditorScrollAnchor(container)?.pageIndex).toBe(1)
  })

  it('detecta la página más visible al navegar con scroll', () => {
    const container = makeContainer()
    const first = document.createElement('section') as HTMLElement & {
      getBoundingClientRect: () => DOMRect
    }
    const second = document.createElement('section') as HTMLElement & {
      getBoundingClientRect: () => DOMRect
    }
    first.dataset.pdfEditorPage = '0'
    second.dataset.pdfEditorPage = '1'
    first.getBoundingClientRect = () => rect(-260, 100, 300, 600)
    second.getBoundingClientRect = () => rect(180, 100, 300, 600)
    container.append(first, second)

    expect(findMostVisiblePdfEditorPage(container)).toBe(1)
  })

  it('ancla el zoom contra la hoja real, no contra el contenedor de página', () => {
    const container = makeContainer()
    const page = document.createElement('section') as HTMLElement & {
      getBoundingClientRect: () => DOMRect
    }
    const sheet = document.createElement('div') as HTMLElement & {
      getBoundingClientRect: () => DOMRect
    }
    page.dataset.pdfEditorPage = '0'
    sheet.dataset.pdfEditorSheet = '0'
    page.getBoundingClientRect = () => rect(0, 50, 500, 900)
    sheet.getBoundingClientRect = () => rect(100, 125, 300, 600)
    page.append(sheet)
    container.append(page)

    const anchor = capturePdfEditorScrollAnchor(container)

    expect(anchor).toEqual({
      pageIndex: 0,
      xRatio: 0.5,
      yRatio: 0.3333333333333333,
    })

    sheet.getBoundingClientRect = () => rect(40, 90, 450, 900)
    restorePdfEditorScrollAnchor(container, anchor)

    expect(container.scrollTop).toBeCloseTo(160)
    expect(container.scrollLeft).toBeCloseTo(55)
  })

  it('centra horizontalmente la hoja real cuando abre sobredimensionada', () => {
    const container = makeContainer()
    const page = document.createElement('section') as HTMLElement & {
      getBoundingClientRect: () => DOMRect
    }
    const sheet = document.createElement('div') as HTMLElement & {
      getBoundingClientRect: () => DOMRect
    }
    page.dataset.pdfEditorPage = '0'
    sheet.dataset.pdfEditorSheet = '0'
    page.getBoundingClientRect = () => rect(0, 50, 500, 900)
    sheet.getBoundingClientRect = () => rect(40, 90, 900, 900)
    page.append(sheet)
    container.append(page)

    centerPdfEditorSheetHorizontally(container, 0)

    expect(container.scrollLeft).toBeCloseTo(280)
  })
})
