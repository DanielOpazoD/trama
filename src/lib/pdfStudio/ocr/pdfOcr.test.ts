import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildOcrSidecarText, createSearchablePdf } from './pdfOcr'

const drawText = vi.hoisted(() => vi.fn())
const mocks = vi.hoisted(() => ({
  createWorker: vi.fn(),
  getDocument: vi.fn(),
  pdfCreate: vi.fn(),
  pdfLoad: vi.fn(),
  pdfWorkerUrl: '/pdf.worker.test.js',
}))

vi.mock('tesseract.js', () => ({
  createWorker: mocks.createWorker,
}))

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: mocks.pdfWorkerUrl,
}))

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: mocks.getDocument,
}))

vi.mock('pdf-lib', () => ({
  PDFDocument: {
    create: mocks.pdfCreate,
    load: mocks.pdfLoad,
  },
  StandardFonts: { Helvetica: 'Helvetica' },
  rgb: (r: number, g: number, b: number) => ({ r, g, b }),
}))

class FakeCanvas {
  width: number
  height: number

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }

  getContext() {
    return {
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    }
  }

  convertToBlob() {
    return Promise.resolve(new Blob(['jpg'], { type: 'image/jpeg' }))
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('OffscreenCanvas', FakeCanvas)
})

describe('pdfStudio/pdfOcr', () => {
  it('arma sidecar txt por pagina', () => {
    expect(
      buildOcrSidecarText([
        { pageNumber: 1, text: 'Hola mundo', confidence: 91 },
        { pageNumber: 2, text: 'Segunda pagina', confidence: 80 },
      ]),
    ).toBe('[Pagina 1]\nHola mundo\n\n[Pagina 2]\nSegunda pagina\n')
  })

  it('crea PDF buscable con texto invisible desde un PDF escaneado', async () => {
    const render = vi.fn(() => ({ promise: Promise.resolve() }))
    const sourceDoc = {}
    const outPage = {
      drawText,
      getWidth: () => 200,
      getHeight: () => 100,
    }
    const outDoc = {
      copyPages: vi.fn(async () => [outPage]),
      addPage: vi.fn(() => outPage),
      embedFont: vi.fn(async () => ({
        widthOfTextAtSize: () => 40,
      })),
      save: vi.fn(async () => new Uint8Array([1, 2, 3])),
    }
    const tesseractWorker = {
      recognize: vi.fn(async () => ({
        data: {
          text: 'Hola mundo',
          confidence: 91,
          blocks: [
            {
              paragraphs: [
                {
                  lines: [
                    {
                      text: 'Hola mundo',
                      confidence: 91,
                      bbox: { x0: 20, y0: 10, x1: 120, y1: 30 },
                    },
                  ],
                },
              ],
            },
          ],
        },
      })),
      terminate: vi.fn(async () => undefined),
    }

    mocks.getDocument.mockReturnValueOnce({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn(async () => ({
          getViewport: ({ scale }: { scale: number }) => ({
            width: 200 * scale,
            height: 100 * scale,
          }),
          render,
        })),
      }),
      destroy: vi.fn(async () => undefined),
    })
    mocks.pdfLoad.mockResolvedValueOnce(sourceDoc)
    mocks.pdfCreate.mockResolvedValueOnce(outDoc)
    mocks.createWorker.mockResolvedValueOnce(tesseractWorker)

    const result = await createSearchablePdf(
      new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' }),
      { language: 'spa' },
    )

    expect(result.pages).toEqual([{ pageNumber: 1, text: 'Hola mundo', confidence: 91 }])
    await expect(result.textBlob.text()).resolves.toContain('Hola mundo')
    expect(outDoc.copyPages).toHaveBeenCalledWith(sourceDoc, [0])
    expect(drawText).toHaveBeenCalledWith(
      'Hola mundo',
      expect.objectContaining({
        opacity: 0.01,
        x: 10,
        y: 85,
      }),
    )
    expect(tesseractWorker.terminate).toHaveBeenCalled()
  })
})
