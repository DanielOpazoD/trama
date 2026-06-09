import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PdfDoc } from '../model/model'

// Red de seguridad del ensamblado: el worker no tiene `document`/`<canvas>`, así
// que en navegadores sin OffscreenCanvas/convertToBlob no puede codificar las
// páginas de imagen (fotos JPEG) y el ensamblado falla. `assemblePdfInWorker`
// debe reensamblar en el main thread, que siempre tiene canvas.
const mocks = vi.hoisted(() => ({
  runPdfHeavyOperation: vi.fn(),
  assemble: vi.fn(),
}))
vi.mock('./heavyOperationClient', () => ({
  runPdfHeavyOperation: mocks.runPdfHeavyOperation,
}))
vi.mock('../assemble/assemble', () => ({ assemble: mocks.assemble }))

import { assemblePdfInWorker } from './exportWorkerClient'

const doc = { pages: [], sources: [] } as unknown as PdfDoc
const ok = { blob: new Blob(['pdf']), skipped: [], warnings: [] }

beforeEach(() => vi.clearAllMocks())

describe('assemblePdfInWorker', () => {
  it('devuelve el resultado del worker cuando funciona', async () => {
    mocks.runPdfHeavyOperation.mockResolvedValue(ok)
    await expect(assemblePdfInWorker(doc)).resolves.toBe(ok)
    expect(mocks.assemble).not.toHaveBeenCalled()
  })

  it('cae al main thread si el worker falla (p. ej. no puede codificar imágenes)', async () => {
    mocks.runPdfHeavyOperation.mockRejectedValue(new Error('worker sin canvas'))
    mocks.assemble.mockResolvedValue(ok)
    await expect(assemblePdfInWorker(doc)).resolves.toBe(ok)
    expect(mocks.assemble).toHaveBeenCalledTimes(1)
    expect(mocks.assemble).toHaveBeenCalledWith(doc, expect.any(Object))
  })

  it('NO reintenta en main thread si el usuario canceló', async () => {
    const controller = new AbortController()
    controller.abort()
    mocks.runPdfHeavyOperation.mockRejectedValue(new Error('cancelado'))
    await expect(
      assemblePdfInWorker(doc, { signal: controller.signal }),
    ).rejects.toThrow()
    expect(mocks.assemble).not.toHaveBeenCalled()
  })
})
