import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSearchablePdfInWorker } from './pdfOcrWorkerClient'

const mocks = vi.hoisted(() => ({
  runPdfHeavyOperation: vi.fn(),
  createSearchablePdf: vi.fn(),
}))

vi.mock('../export/heavyOperationClient', () => ({
  runPdfHeavyOperation: mocks.runPdfHeavyOperation,
}))
vi.mock('./pdfOcr', () => ({
  createSearchablePdf: mocks.createSearchablePdf,
}))

const pdf = () => new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('pdfStudio/pdfOcrWorkerClient', () => {
  it('crea un PDF buscable via operacion pesada pdf-ocr', async () => {
    const result = {
      pdfBlob: new Blob(['pdf'], { type: 'application/pdf' }),
      textBlob: new Blob(['texto'], { type: 'text/plain' }),
      pages: [{ pageNumber: 1, text: 'hola mundo', confidence: 88 }],
      warnings: [],
    }
    mocks.runPdfHeavyOperation.mockResolvedValueOnce(result)
    const file = pdf()
    const progress = vi.fn()

    await expect(
      createSearchablePdfInWorker(file, {
        language: 'spa',
        onProgress: progress,
      }),
    ).resolves.toBe(result)

    expect(mocks.runPdfHeavyOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'pdf-ocr',
        payload: {
          file,
          options: { language: 'spa' },
        },
        onProgress: progress,
        fallback: expect.any(Function),
      }),
    )
  })

  it('usa fallback local cuando el worker no esta disponible', async () => {
    const result = {
      pdfBlob: new Blob(['pdf'], { type: 'application/pdf' }),
      textBlob: new Blob(['texto'], { type: 'text/plain' }),
      pages: [],
      warnings: [],
    }
    mocks.createSearchablePdf.mockResolvedValueOnce(result)
    mocks.runPdfHeavyOperation.mockImplementationOnce(({ fallback }) => fallback())
    const file = pdf()

    await expect(createSearchablePdfInWorker(file, { language: 'eng' })).resolves.toBe(
      result,
    )

    expect(mocks.createSearchablePdf).toHaveBeenCalledWith(file, {
      language: 'eng',
      onProgress: undefined,
      signal: undefined,
    })
  })
})
