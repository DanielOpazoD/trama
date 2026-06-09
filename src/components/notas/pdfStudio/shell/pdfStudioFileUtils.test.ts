import { describe, expect, it } from 'vitest'
import {
  exportPdfName,
  isIosLike,
  isPdfFile,
  isSafari,
  isStudioImageFile,
} from './pdfStudioFileUtils'

const UA = {
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  safariIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  chromeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Edg/124.0',
}

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

  it('detecta Safari (escritorio e iOS) y NO confunde a Chrome/Edge', () => {
    const nav = (userAgent: string) => ({ userAgent, platform: '', maxTouchPoints: 0 })
    // Safari real → true (es el caso que rompe el visor en pestaña nueva).
    expect(isSafari(nav(UA.safariMac))).toBe(true)
    expect(isSafari(nav(UA.safariIos))).toBe(true)
    // Chromium/Firefox/Edge traen "Safari" en el UA pero NO "Version/" → false.
    expect(isSafari(nav(UA.chromeMac))).toBe(false)
    expect(isSafari(nav(UA.chromeIos))).toBe(false)
    expect(isSafari(nav(UA.edge))).toBe(false)
  })
})
