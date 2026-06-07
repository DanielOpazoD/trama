import { describe, expect, it } from 'vitest'
import { readPdfTextEditorPageArea } from './pdfEditorPageArea'

function sizedDiv(size: { w: number; h: number }): HTMLDivElement {
  const el = document.createElement('div')
  Object.defineProperties(el, {
    clientWidth: { value: size.w, configurable: true },
    clientHeight: { value: size.h, configurable: true },
  })
  return el
}

describe('readPdfTextEditorPageArea', () => {
  it('usa la altura del visor scrolleable para evitar feedback de zoom', () => {
    const scroll = sizedDiv({ w: 1000, h: 640 })
    scroll.dataset.pdfEditorScroll = 'true'
    const pageCanvas = sizedDiv({ w: 920, h: 1600 })
    scroll.append(pageCanvas)

    expect(readPdfTextEditorPageArea(pageCanvas)).toEqual({ w: 920, h: 640 })
  })

  it('usa su propia altura cuando no está dentro del visor del editor', () => {
    const pageCanvas = sizedDiv({ w: 720, h: 540 })

    expect(readPdfTextEditorPageArea(pageCanvas)).toEqual({ w: 720, h: 540 })
  })
})
