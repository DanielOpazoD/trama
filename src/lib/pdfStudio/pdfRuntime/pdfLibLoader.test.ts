import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('pdf-lib', () => ({
  PDFDocument: { create: vi.fn() },
  StandardFonts: { Helvetica: 'Helvetica' },
  degrees: vi.fn((value: number) => ({ degrees: value })),
  rgb: vi.fn((r: number, g: number, b: number) => ({ r, g, b })),
}))

vi.mock('@pdf-lib/fontkit', () => ({
  default: { registerFormat: vi.fn() },
}))

describe('pdfLibLoader', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('loads pdf-lib through one cached boundary', async () => {
    const pdfLib = await import('pdf-lib')
    const { loadPdfLib } = await import('./pdfLibLoader')

    await expect(loadPdfLib()).resolves.toBe(pdfLib)
    await expect(loadPdfLib()).resolves.toBe(pdfLib)
  })

  it('loads fontkit through one cached boundary', async () => {
    const fontkit = await import('@pdf-lib/fontkit')
    const { loadPdfFontkit } = await import('./pdfLibLoader')

    await expect(loadPdfFontkit()).resolves.toBe(fontkit.default)
    await expect(loadPdfFontkit()).resolves.toBe(fontkit.default)
  })

  it('retries after a pdf-lib import failure', async () => {
    vi.doMock('pdf-lib', () => {
      throw new Error('pdf-lib unavailable')
    })
    const { loadPdfLib } = await import('./pdfLibLoader')

    await expect(loadPdfLib()).rejects.toThrow()

    const retried = { PDFDocument: { create: vi.fn() } }
    vi.doMock('pdf-lib', () => retried)

    const loaded = await loadPdfLib()
    expect(loaded.PDFDocument).toBe(retried.PDFDocument)
  })

  it('retries after a fontkit import failure', async () => {
    vi.doMock('@pdf-lib/fontkit', () => {
      throw new Error('fontkit unavailable')
    })
    const { loadPdfFontkit } = await import('./pdfLibLoader')

    await expect(loadPdfFontkit()).rejects.toThrow()

    const retried = { registerFormat: vi.fn() }
    vi.doMock('@pdf-lib/fontkit', () => ({ default: retried }))

    await expect(loadPdfFontkit()).resolves.toBe(retried)
  })
})
