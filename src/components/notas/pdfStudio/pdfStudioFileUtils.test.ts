import { describe, expect, it } from 'vitest'
import {
  exportPdfName,
  isIosLike,
  isPdfFile,
  isStudioImageFile,
} from './pdfStudioFileUtils'

describe('pdfStudioFileUtils', () => {
  it('detecta PDFs por MIME o extensión', () => {
    expect(isPdfFile(new File(['x'], 'doc.pdf', { type: '' }))).toBe(true)
    expect(isPdfFile(new File(['x'], 'doc.bin', { type: 'application/pdf' }))).toBe(true)
    expect(isPdfFile(new File(['x'], 'foto.png', { type: 'image/png' }))).toBe(false)
  })

  it('detecta imágenes por MIME', () => {
    expect(isStudioImageFile(new File(['x'], 'foto.png', { type: 'image/png' }))).toBe(
      true,
    )
    expect(
      isStudioImageFile(new File(['x'], 'doc.pdf', { type: 'application/pdf' })),
    ).toBe(false)
  })

  it('genera nombres de exportación con fecha local inyectable', () => {
    const date = new Date(2026, 5, 6)
    expect(exportPdfName(date)).toBe('trama-20260606.pdf')
    expect(exportPdfName(date, 'seleccion')).toBe('trama-seleccion-20260606.pdf')
  })

  it('detecta iOS/iPadOS desde datos de navegador', () => {
    expect(
      isIosLike({ userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 0 }),
    ).toBe(true)
    expect(
      isIosLike({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 }),
    ).toBe(true)
    expect(
      isIosLike({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 0 }),
    ).toBe(false)
  })
})
