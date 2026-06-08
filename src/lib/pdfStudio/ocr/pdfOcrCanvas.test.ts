import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createOcrCanvas,
  fillOcrCanvasWhite,
  getOcrCanvasContext,
  ocrCanvasToJpegBlob,
} from './pdfOcrCanvas'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pdfStudio/pdfOcrCanvas', () => {
  it('crea canvas con dimensiones enteras mínimas usando OffscreenCanvas', () => {
    class FakeOffscreenCanvas {
      width: number
      height: number

      constructor(width: number, height: number) {
        this.width = width
        this.height = height
      }

      getContext() {
        return { fillStyle: '', fillRect: vi.fn() }
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas)

    const canvas = createOcrCanvas(0.2, 10.4)

    expect(canvas.width).toBe(1)
    expect(canvas.height).toBe(11)
  })

  it('usa document.createElement cuando OffscreenCanvas no está disponible', () => {
    vi.stubGlobal('OffscreenCanvas', undefined)
    const canvas = createOcrCanvas(12.1, 7.1)

    expect(canvas).toBeInstanceOf(HTMLCanvasElement)
    expect(canvas.width).toBe(13)
    expect(canvas.height).toBe(8)
  })

  it('rellena el canvas de blanco con el contexto recibido', () => {
    const context = {
      fillStyle: '',
      fillRect: vi.fn(),
    }

    fillOcrCanvasWhite(context as unknown as CanvasRenderingContext2D, 20, 30)

    expect(context.fillStyle).toBe('#ffffff')
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 20, 30)
  })

  it('lanza error explícito si no hay contexto 2D', () => {
    const canvas = { getContext: () => null }

    expect(() => getOcrCanvasContext(canvas as unknown as HTMLCanvasElement)).toThrow(
      /Canvas 2D/,
    )
  })

  it('convierte a JPEG con convertToBlob cuando está disponible', async () => {
    const canvas = {
      convertToBlob: vi.fn(async () => new Blob(['jpg'], { type: 'image/jpeg' })),
    }

    await expect(
      ocrCanvasToJpegBlob(canvas as unknown as OffscreenCanvas),
    ).resolves.toBeInstanceOf(Blob)
    expect(canvas.convertToBlob).toHaveBeenCalledWith({
      type: 'image/jpeg',
      quality: 0.9,
    })
  })

  it('usa toBlob como fallback y reporta fallo de codificación', async () => {
    const okCanvas = {
      toBlob: vi.fn((callback: BlobCallback) =>
        callback(new Blob(['jpg'], { type: 'image/jpeg' })),
      ),
    }
    const brokenCanvas = {
      toBlob: vi.fn((callback: BlobCallback) => callback(null)),
    }

    await expect(
      ocrCanvasToJpegBlob(okCanvas as unknown as HTMLCanvasElement),
    ).resolves.toBeInstanceOf(Blob)
    await expect(
      ocrCanvasToJpegBlob(brokenCanvas as unknown as HTMLCanvasElement),
    ).rejects.toThrow(/codificar/)
  })
})
