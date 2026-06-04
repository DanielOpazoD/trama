import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  addImageSource,
  addPdfSource,
  emptyDoc,
  makeAnnotation,
  rotatePage,
  setPageAnnotations,
} from './model'

// pdf-lib es browser-only (canvas/DOMMatrix) → se mockea. Este test guarda el
// CONTRATO del ensamblado (qué llama y con qué args), que vive en `assemble.ts`
// (excluido del coverage). Se usa el camino PNG (`embedPng`) porque NO toca el
// canvas; el camino JPEG (canvas/Image) sigue siendo browser-only.
const calls = vi.hoisted(() => ({
  copyPages: vi.fn(),
  addPage: vi.fn(),
  embedPng: vi.fn(),
  embedJpg: vi.fn(),
  embedFont: vi.fn(),
  drawImage: vi.fn(),
  drawText: vi.fn(),
  setRotation: vi.fn(),
}))

vi.mock('pdf-lib', () => {
  const makePage = (w: number, h: number) => ({
    getWidth: () => w,
    getHeight: () => h,
    getRotation: () => ({ angle: 0 }),
    setRotation: (...a: unknown[]) => calls.setRotation(...a),
    drawImage: (...a: unknown[]) => calls.drawImage(...a),
    drawText: (...a: unknown[]) => calls.drawText(...a),
  })
  return {
    PDFDocument: {
      create: async () => {
        let count = 0
        return {
          copyPages: async (...a: unknown[]) => {
            calls.copyPages(...a)
            return [makePage(400, 560)]
          },
          addPage: (arg: unknown) => {
            calls.addPage(arg)
            count += 1
            return Array.isArray(arg) ? makePage(arg[0], arg[1]) : arg
          },
          embedPng: async (b: unknown) => {
            calls.embedPng(b)
            return { width: 100, height: 200 }
          },
          embedJpg: async (b: unknown) => {
            calls.embedJpg(b)
            return { width: 100, height: 200 }
          },
          embedFont: async (n: unknown) => {
            calls.embedFont(n)
            return { heightAtSize: () => 16 }
          },
          getPageCount: () => count,
          save: async () => new Uint8Array([37, 80, 68, 70]),
        }
      },
      load: async () => ({}),
    },
    rgb: (r: number, g: number, b: number) => ({ r, g, b }),
    degrees: (n: number) => ({ __deg: n }),
  }
})

import { assemble } from './assemble'

const png = (name = 'a.png') =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: 'image/png' })
const pdf = (name = 'a.pdf') => new File(['%PDF'], name, { type: 'application/pdf' })

beforeEach(() => vi.clearAllMocks())

describe('pdfStudio/assemble (contrato browser-only)', () => {
  it('PNG se embebe sin pérdida (embedPng), no JPEG; devuelve blob PDF', async () => {
    const { blob, skipped } = await assemble(addImageSource(emptyDoc(), png()))
    expect(calls.embedPng).toHaveBeenCalledTimes(1)
    expect(calls.embedJpg).not.toHaveBeenCalled()
    expect(calls.drawImage).toHaveBeenCalledTimes(1)
    expect(blob.type).toBe('application/pdf')
    expect(skipped).toEqual([])
  })

  it('una página de PDF se copia (copyPages), no se re-encodea', async () => {
    await assemble(addPdfSource(emptyDoc(), pdf(), 1))
    expect(calls.copyPages).toHaveBeenCalledTimes(1)
    expect(calls.embedPng).not.toHaveBeenCalled()
    expect(calls.embedJpg).not.toHaveBeenCalled()
  })

  it('la rotación aplica setRotation con el ángulo correcto', async () => {
    let doc = addImageSource(emptyDoc(), png())
    doc = rotatePage(doc, 0, 1) // 90°
    await assemble(doc)
    expect(calls.setRotation).toHaveBeenCalledWith({ __deg: 90 })
  })

  it('sin rotación NO llama setRotation', async () => {
    await assemble(addImageSource(emptyDoc(), png()))
    expect(calls.setRotation).not.toHaveBeenCalled()
  })

  it('el texto se dibuja con drawText en las coordenadas del layout', async () => {
    let doc = addImageSource(emptyDoc(), png()) // página → 100 x 200 pt (embedPng mock)
    const ann = makeAnnotation({
      text: 'Hola',
      xRatio: 0.25,
      yRatio: 0.5,
      sizeRatio: 0.1,
      color: '#222222',
      font: 'sans',
      bold: false,
    })
    doc = setPageAnnotations(doc, 0, [ann])
    await assemble(doc)

    expect(calls.embedFont).toHaveBeenCalledWith('Helvetica')
    expect(calls.drawText).toHaveBeenCalledTimes(1)
    const [text, opts] = calls.drawText.mock.calls[0] as [
      string,
      { x: number; y: number; size: number },
    ]
    expect(text).toBe('Hola')
    expect(opts.x).toBeCloseTo(25) // 0.25 * 100
    expect(opts.size).toBeCloseTo(20) // 0.1 * 200
    expect(opts.y).toBeCloseTo(84) // topY(200 - 0.5*200=100) - ascent(16)
  })
})
