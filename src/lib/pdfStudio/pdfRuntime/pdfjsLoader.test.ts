import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '/assets/pdf.worker.min.mjs',
}))

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn((input) => ({ input, promise: Promise.resolve({ numPages: 1 }) })),
}))

describe('pdfjsLoader', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('caches pdf.js and configures the worker once', async () => {
    const pdfjs = await import('pdfjs-dist')
    const { loadPdfjs } = await import('./pdfjsLoader')

    const first = await loadPdfjs()
    const second = await loadPdfjs()

    expect(first).toBe(second)
    expect(first).toBe(pdfjs)
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe('/assets/pdf.worker.min.mjs')
  })

  it('creates documents through the shared loader', async () => {
    const pdfjs = await import('pdfjs-dist')
    const { loadPdfjsDocument } = await import('./pdfjsLoader')
    const bytes = new Uint8Array([1, 2, 3])

    const task = await loadPdfjsDocument({
      data: bytes,
      disableWorker: true,
    } as unknown as Parameters<typeof pdfjs.getDocument>[0])

    expect(pdfjs.getDocument).toHaveBeenCalledWith({
      data: bytes,
      disableWorker: true,
    })
    await expect(task.promise).resolves.toEqual({ numPages: 1 })
  })

  it('retries after a worker import failure', async () => {
    vi.doMock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => {
      throw new Error('worker unavailable')
    })
    vi.doMock('pdfjs-dist', () => ({
      GlobalWorkerOptions: { workerSrc: '' },
      getDocument: vi.fn(),
    }))
    const { loadPdfjs } = await import('./pdfjsLoader')

    await expect(loadPdfjs()).rejects.toThrow()

    vi.doMock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
      default: '/assets/retried.worker.mjs',
    }))

    await expect(loadPdfjs()).resolves.toMatchObject({
      GlobalWorkerOptions: { workerSrc: '/assets/retried.worker.mjs' },
    })
  })
})
