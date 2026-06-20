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
})
