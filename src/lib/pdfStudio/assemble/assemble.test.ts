import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  addImageSource,
  addPdfSource,
  baselineDropEm,
  emptyDoc,
  makeHighlightAnnotation,
  makeImageAnnotation,
  makeRedactionAnnotation,
  makeTextAnnotation,
  rotatePage,
  setPageAnnotations,
  setDocSettings,
} from '../model/model'

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
  drawRectangle: vi.fn(),
  setRotation: vi.fn(),
  registerFontkit: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
  failSave: false,
}))
const pdfjsCalls = vi.hoisted(() => ({
  getDocument: vi.fn(),
  render: vi.fn(),
  destroy: vi.fn(),
}))

vi.mock('pdf-lib', () => {
  const makePage = (w: number, h: number) => ({
    getWidth: () => w,
    getHeight: () => h,
    getRotation: () => ({ angle: 0 }),
    setRotation: (...a: unknown[]) => calls.setRotation(...a),
    drawImage: (...a: unknown[]) => calls.drawImage(...a),
    drawText: (...a: unknown[]) => calls.drawText(...a),
    drawRectangle: (...a: unknown[]) => calls.drawRectangle(...a),
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
          embedFont: async (...a: unknown[]) => {
            calls.embedFont(...a)
            return {
              heightAtSize: () => 16,
              widthOfTextAtSize: (text: string, size: number) => text.length * size * 0.5,
            }
          },
          registerFontkit: (...a: unknown[]) => calls.registerFontkit(...a),
          getPageCount: () => count,
          save: async (...a: unknown[]) => {
            calls.save(...a)
            if (calls.failSave) throw new Error('out of memory while saving')
            return new Uint8Array([37, 80, 68, 70])
          },
        }
      },
      load: async (bytes: Uint8Array) => {
        calls.load(bytes)
        const text = String.fromCharCode(...bytes.slice(0, 64))
        if (text.includes('BROKEN') || text.includes('ENCRYPTED')) {
          throw new Error('encrypted or corrupt fixture')
        }
        return {}
      },
    },
    rgb: (r: number, g: number, b: number) => ({ r, g, b }),
    degrees: (n: number) => ({ __deg: n }),
  }
})

// fontkit es browser-only (igual que pdf-lib) → se mockea; sólo importa que se
// registre. Los `?url` de los WOFF resuelven a un string en vitest y `fetch` se
// stubea para devolver bytes sin tocar la red.
vi.mock('@pdf-lib/fontkit', () => ({ default: { registerFormat: () => {} } }))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '/pdf.worker.test.js',
}))
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: (...args: unknown[]) => {
    pdfjsCalls.getDocument(...args)
    return {
      promise: Promise.resolve({
        getPage: async () => ({
          getViewport: ({ scale }: { scale: number }) => ({
            width: 400 * scale,
            height: 560 * scale,
          }),
          render: (...renderArgs: unknown[]) => {
            pdfjsCalls.render(...renderArgs)
            return { promise: Promise.resolve() }
          },
        }),
      }),
      destroy: async () => {
        pdfjsCalls.destroy()
      },
    }
  },
}))

import { assemble, PdfExportPipelineError, readPngSize } from './assemble'

const pngHeader = (w: number, h: number) => {
  const b = new Uint8Array(24)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) // firma PNG
  b.set([0x49, 0x48, 0x44, 0x52], 12) // "IHDR"
  b[16] = (w >>> 24) & 255
  b[17] = (w >>> 16) & 255
  b[18] = (w >>> 8) & 255
  b[19] = w & 255
  b[20] = (h >>> 24) & 255
  b[21] = (h >>> 16) & 255
  b[22] = (h >>> 8) & 255
  b[23] = h & 255
  return b
}
const pngDataUrl = (w = 10, h = 10) =>
  `data:image/png;base64,${btoa(String.fromCharCode(...pngHeader(w, h)))}`

const png = (name = 'a.png') =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: 'image/png' })
const pdf = (name = 'a.pdf', body = '%PDF') =>
  new File([body], name, { type: 'application/pdf' })

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  pdfjsCalls.getDocument.mockClear()
  pdfjsCalls.render.mockClear()
  pdfjsCalls.destroy.mockClear()
  calls.failSave = false
  // `fetch` del WOFF → bytes cualquiera (pdf-lib está mockeado, no los parsea).
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    })),
  )
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({
      width: 100,
      height: 200,
      close: vi.fn(),
    })),
  )
  const realCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
    if (tagName !== 'canvas') return realCreateElement(tagName, options)
    return {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        fillStyle: '#ffffff',
        fillRect: vi.fn(),
        drawImage: vi.fn(),
      })),
      toBlob: vi.fn((callback: BlobCallback) => {
        callback(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }))
      }),
    } as unknown as HTMLCanvasElement
  })
})

describe('pdfStudio/assemble (contrato browser-only)', () => {
  it('PNG se embebe sin pérdida (embedPng), no JPEG; devuelve blob PDF', async () => {
    const { blob, skipped } = await assemble(addImageSource(emptyDoc(), png()))
    expect(calls.embedPng).toHaveBeenCalledTimes(1)
    expect(calls.embedJpg).not.toHaveBeenCalled()
    expect(calls.drawImage).toHaveBeenCalledTimes(1)
    expect(blob.type).toBe('application/pdf')
    expect(skipped).toEqual([])
  })

  it('agrupa páginas de imagen limpias según imagesPerPage', async () => {
    let doc = emptyDoc()
    for (let i = 0; i < 5; i += 1) doc = addImageSource(doc, png(`foto-${i}.png`))
    doc = setDocSettings(doc, { imageLayout: { imagesPerPage: 2 } })

    await assemble(doc)

    expect(calls.addPage).toHaveBeenCalledTimes(3)
    expect(calls.addPage).toHaveBeenCalledWith([595.28, 841.89])
    expect(calls.drawImage).toHaveBeenCalledTimes(5)
  })

  it('no agrupa imágenes que tienen anotaciones para no perder edición por página', async () => {
    let doc = addImageSource(emptyDoc(), png('foto-1.png'))
    doc = addImageSource(doc, png('foto-2.png'))
    doc = setDocSettings(doc, { imageLayout: { imagesPerPage: 2 } })
    doc = setPageAnnotations(doc, 1, [
      makeTextAnnotation({
        text: 'nota',
        xRatio: 0.1,
        yRatio: 0.1,
        wRatio: 0.2,
        hRatio: 0.08,
        sizeRatio: 0.03,
        color: '#222222',
        font: 'sans',
        bold: false,
      }),
    ])

    await assemble(doc)

    expect(calls.addPage).toHaveBeenCalledTimes(2)
    expect(calls.drawImage).toHaveBeenCalledTimes(2)
    expect(calls.drawText).toHaveBeenCalledWith(
      'nota',
      expect.objectContaining({ maxWidth: expect.any(Number) }),
    )
  })

  it('emite progreso por fases del pipeline de exportación', async () => {
    const progress: Array<{ phase: string; status: string }> = []

    await assemble(addImageSource(emptyDoc(), png()), {
      onProgress: (event) => progress.push(event),
    })

    expect(progress.map((event) => `${event.phase}:${event.status}`)).toEqual([
      'load-fonts:start',
      'load-fonts:complete',
      'validate-images:start',
      'validate-images:complete',
      'process-pages:start',
      'apply-annotations:start',
      'apply-annotations:complete',
      'process-pages:progress',
      'process-pages:complete',
      'compress:start',
      'compress:complete',
      'save:start',
      'save:complete',
    ])
  })

  it('lanza un error tipado si ninguna página se puede exportar', async () => {
    await expect(assemble(emptyDoc())).rejects.toMatchObject({
      name: 'PdfExportPipelineError',
      phase: 'process-pages',
      code: 'NO_PAGES_EXPORTED',
    })
    await expect(assemble(emptyDoc())).rejects.toBeInstanceOf(PdfExportPipelineError)
  })

  it('una página de PDF se copia (copyPages), no se re-encodea', async () => {
    await assemble(addPdfSource(emptyDoc(), pdf(), 1))
    expect(calls.copyPages).toHaveBeenCalledTimes(1)
    expect(calls.embedPng).not.toHaveBeenCalled()
    expect(calls.embedJpg).not.toHaveBeenCalled()
  })

  it('cachea un PDF grande y copia múltiples páginas sin recargar el source', async () => {
    await assemble(addPdfSource(emptyDoc(), pdf('heavy.pdf'), 20))

    expect(calls.load).toHaveBeenCalledTimes(1)
    expect(calls.copyPages).toHaveBeenCalledTimes(20)
    expect(calls.save).toHaveBeenCalledTimes(1)
  })

  it('permite configurar compatibilidad de compresión al guardar', async () => {
    await assemble(addImageSource(emptyDoc(), png()), { compression: 'compatibility' })

    expect(calls.save).toHaveBeenCalledWith({ useObjectStreams: false })
  })

  it('emite warnings tempranos para exportaciones grandes o con muchas imágenes', async () => {
    let doc = emptyDoc()
    for (let i = 0; i < 20; i += 1) {
      doc = addImageSource(doc, png(`img-${i}.png`))
    }

    const { warnings } = await assemble(doc)

    expect(warnings).toEqual([expect.objectContaining({ code: 'LARGE_IMAGE_SET' })])
  })

  it('cancela la exportación con AbortSignal entre fases del pipeline', async () => {
    const controller = new AbortController()
    const progress: string[] = []

    await expect(
      assemble(addImageSource(emptyDoc(), png()), {
        signal: controller.signal,
        onProgress: (event) => {
          progress.push(`${event.phase}:${event.status}`)
          if (event.phase === 'validate-images' && event.status === 'complete') {
            controller.abort()
          }
        },
      }),
    ).rejects.toMatchObject({
      name: 'PdfExportPipelineError',
      phase: 'process-pages',
      code: 'CANCELLED',
    })

    expect(progress).toContain('validate-images:complete')
    expect(calls.save).not.toHaveBeenCalled()
  })

  it('salta un PDF corrupto o cifrado y exporta las páginas restantes', async () => {
    let doc = addPdfSource(emptyDoc(), pdf('cifrado.pdf', 'ENCRYPTED'), 1)
    doc = addImageSource(doc, png('respaldo.png'))

    const { skipped, blob } = await assemble(doc)

    expect(blob.type).toBe('application/pdf')
    expect(skipped).toEqual([
      { name: 'cifrado.pdf', reason: 'encrypted or corrupt fixture' },
    ])
    expect(calls.embedPng).toHaveBeenCalledTimes(1)
  })

  it('lanza error tipado cuando falla el guardado del PDF final', async () => {
    calls.failSave = true

    await expect(assemble(addImageSource(emptyDoc(), png()))).rejects.toMatchObject({
      name: 'PdfExportPipelineError',
      phase: 'save',
      code: 'SAVE_FAILED',
      message: expect.stringContaining('out of memory while saving'),
    })
  })

  it('exporta redacciones quemándolas en una página rasterizada', async () => {
    let doc = addImageSource(emptyDoc(), png())
    doc = setPageAnnotations(doc, 0, [
      makeRedactionAnnotation({
        xRatio: 0.2,
        yRatio: 0.3,
        wRatio: 0.4,
        hRatio: 0.1,
        color: '#000000',
      }),
    ])

    await expect(assemble(doc)).resolves.toMatchObject({
      blob: expect.objectContaining({ type: 'application/pdf' }),
      skipped: [],
    })
    expect(calls.drawRectangle).not.toHaveBeenCalled()
    expect(calls.embedJpg).toHaveBeenCalledTimes(1)
    expect(calls.save).toHaveBeenCalledTimes(1)
  })

  it('redacta páginas PDF rasterizando sin copiar el PDF original', async () => {
    let doc = addPdfSource(emptyDoc(), pdf('secreto.pdf'), 1)
    doc = setPageAnnotations(doc, 0, [
      makeRedactionAnnotation({
        xRatio: 0.1,
        yRatio: 0.1,
        wRatio: 0.5,
        hRatio: 0.2,
        color: '#000000',
      }),
    ])

    await assemble(doc)

    expect(calls.load).not.toHaveBeenCalled()
    expect(calls.copyPages).not.toHaveBeenCalled()
    expect(pdfjsCalls.getDocument).toHaveBeenCalledWith(
      expect.objectContaining({ disableWorker: true }),
    )
    expect(pdfjsCalls.render).toHaveBeenCalledTimes(1)
    expect(calls.embedJpg).toHaveBeenCalledTimes(1)
    expect(calls.save).toHaveBeenCalledTimes(1)
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

  it('el texto sans embebe la fuente REAL (Inter por bytes + subconjunto) y dibuja en el layout', async () => {
    let doc = addImageSource(emptyDoc(), png()) // página → 100 x 200 pt (embedPng mock)
    const ann = makeTextAnnotation({
      text: 'Hola',
      xRatio: 0.25,
      yRatio: 0.5,
      sizeRatio: 0.1,
      color: '#222222',
      font: 'sans',
      bold: false,
      opacity: 0.5,
      rotation: 30,
    })
    doc = setPageAnnotations(doc, 0, [ann])
    await assemble(doc)

    // Se registró fontkit y la fuente se embebió por BYTES (no por nombre estándar).
    expect(calls.registerFontkit).toHaveBeenCalledTimes(1)
    const [fontArg, fontOpts] = calls.embedFont.mock.calls[0] as [unknown, unknown]
    expect(fontArg).toBeInstanceOf(Uint8Array)
    expect(fontOpts).toEqual({ subset: true })

    expect(calls.drawText).toHaveBeenCalledTimes(1)
    const [text, opts] = calls.drawText.mock.calls[0] as [
      string,
      { x: number; y: number; size: number; opacity: number; rotate: { __deg: number } },
    ]
    expect(text).toBe('Hola')
    expect(opts.x).toBeCloseTo(25) // 0.25 * 100
    expect(opts.size).toBeCloseTo(20) // 0.1 * 200
    // topY(100) − baselineDropEm('sans')·size — modelo de line-box, no heightAtSize.
    expect(opts.y).toBeCloseTo(100 - baselineDropEm('sans') * 20)
    expect(opts.opacity).toBe(0.5)
    expect(opts.rotate).toEqual({ __deg: -30 }) // CSS horario → pdf-lib antihorario
  })

  it('el texto con caja real se exporta con maxWidth para envolver líneas', async () => {
    let doc = addImageSource(emptyDoc(), png())
    doc = setPageAnnotations(doc, 0, [
      makeTextAnnotation({
        text: 'Texto largo para envolver',
        xRatio: 0.1,
        yRatio: 0.2,
        wRatio: 0.35,
        hRatio: 0.12,
        sizeRatio: 0.04,
        color: '#111111',
        font: 'sans',
        bold: false,
      }),
    ])
    await assemble(doc)

    const [_text, opts] = calls.drawText.mock.calls[0] as [
      string,
      { maxWidth?: number; lineHeight: number },
    ]
    expect(opts.maxWidth).toBeCloseTo(35)
    expect(opts.lineHeight).toBeCloseTo(8 * 1.15)
  })

  it('el texto con caja real respeta el alto máximo al exportar', async () => {
    let doc = addImageSource(emptyDoc(), png())
    doc = setPageAnnotations(doc, 0, [
      makeTextAnnotation({
        text: 'uno dos tres cuatro cinco seis',
        xRatio: 0.1,
        yRatio: 0.2,
        wRatio: 0.2,
        hRatio: 0.12,
        sizeRatio: 0.05,
        color: '#111111',
        font: 'sans',
        bold: false,
      }),
    ])
    await assemble(doc)

    const [text] = calls.drawText.mock.calls[0] as [string]
    expect(text.split('\n')).toHaveLength(2)
    expect(text).toBe('uno\ndos')
  })

  it('mono usa la fuente ESTÁNDAR (Courier), sin embeber ni registrar fontkit', async () => {
    let doc = addImageSource(emptyDoc(), png())
    doc = setPageAnnotations(doc, 0, [
      makeTextAnnotation({
        text: 'cod',
        xRatio: 0.1,
        yRatio: 0.1,
        sizeRatio: 0.05,
        color: '#000000',
        font: 'mono',
        bold: false,
      }),
    ])
    await assemble(doc)
    expect(calls.registerFontkit).not.toHaveBeenCalled()
    expect(calls.embedFont).toHaveBeenCalledWith('Courier')
  })

  it('si la fuente embebible no carga (fetch falla), cae a la estándar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        arrayBuffer: async () => new ArrayBuffer(0),
      })),
    )
    let doc = addImageSource(emptyDoc(), png())
    doc = setPageAnnotations(doc, 0, [
      makeTextAnnotation({
        text: 'x',
        xRatio: 0.1,
        yRatio: 0.1,
        sizeRatio: 0.05,
        color: '#000000',
        font: 'serif',
        bold: true,
      }),
    ])
    await assemble(doc)
    // El WOFF no cargó → se embebió la estándar equivalente (Times-Bold).
    expect(calls.embedFont).toHaveBeenCalledWith('Times-Bold')
  })

  it('el resaltado se dibuja con drawRectangle translúcido en las coords del layout', async () => {
    let doc = addImageSource(emptyDoc(), png()) // página → 100 x 200 pt
    doc = setPageAnnotations(doc, 0, [
      makeHighlightAnnotation({
        xRatio: 0.2,
        yRatio: 0.3,
        wRatio: 0.4,
        hRatio: 0.1,
        color: '#ff0000',
        opacity: 0.5,
      }),
    ])
    await assemble(doc)

    expect(calls.drawText).not.toHaveBeenCalled()
    expect(calls.drawRectangle).toHaveBeenCalledTimes(1)
    const [opts] = calls.drawRectangle.mock.calls[0] as [
      { x: number; y: number; width: number; height: number; opacity: number },
    ]
    expect(opts.x).toBeCloseTo(20) // 0.2 * 100
    expect(opts.width).toBeCloseTo(40) // 0.4 * 100
    expect(opts.height).toBeCloseTo(20) // 0.1 * 200
    expect(opts.y).toBeCloseTo(120) // 200 − (0.3+0.1)*200
    expect(opts.opacity).toBe(0.5)
  })

  it('la imagen estampada se embebe y dibuja en las coords del layout', async () => {
    let doc = addImageSource(emptyDoc(), png()) // página → 100 x 200 pt
    doc = setPageAnnotations(doc, 0, [
      makeImageAnnotation({
        src: pngDataUrl(),
        xRatio: 0.2,
        yRatio: 0.3,
        wRatio: 0.4,
        hRatio: 0.1,
        opacity: 0.75,
      }),
    ])
    await assemble(doc)

    expect(calls.embedPng).toHaveBeenCalledTimes(2) // página base + imagen estampada
    expect(calls.drawImage).toHaveBeenCalledTimes(2)
    const [_img, opts] = calls.drawImage.mock.calls[1] as [
      unknown,
      { x: number; y: number; width: number; height: number; opacity: number },
    ]
    expect(opts.x).toBeCloseTo(20)
    expect(opts.width).toBeCloseTo(40)
    expect(opts.height).toBeCloseTo(20)
    expect(opts.y).toBeCloseTo(120)
    expect(opts.opacity).toBe(0.75)
  })

  it('readPngSize lee las dimensiones del IHDR; null si no es PNG', () => {
    expect(readPngSize(pngHeader(800, 600))).toEqual({ w: 800, h: 600 })
    expect(readPngSize(pngHeader(12000, 9000))).toEqual({ w: 12000, h: 9000 })
    expect(readPngSize(pngHeader(30000, 24000))).toEqual({ w: 30000, h: 24000 })
    expect(readPngSize(new Uint8Array([1, 2, 3]))).toBeNull()
  })
})
