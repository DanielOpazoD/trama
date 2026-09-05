import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addPdfSource,
  emptyDoc,
  type PdfDoc,
} from '../../../../lib/pdfStudio/model/model'
import { usePdfStudioOcr } from './usePdfStudioOcr'

const mocks = vi.hoisted(() => ({
  assemblePdfInWorker: vi.fn(),
  createSearchablePdfInWorker: vi.fn(),
  getPdfPageCount: vi.fn(),
  downloadBlob: vi.fn(),
  toastShow: vi.fn(),
}))

vi.mock('../../../../lib/pdfStudio/export/exportWorkerClient', () => ({
  assemblePdfInWorker: mocks.assemblePdfInWorker,
}))
vi.mock('../../../../lib/pdfStudio/ocr/pdfOcrWorkerClient', () => ({
  createSearchablePdfInWorker: mocks.createSearchablePdfInWorker,
}))
vi.mock('../../../../lib/pdfStudio/render/pdfRender', () => ({
  getPdfPageCount: mocks.getPdfPageCount,
}))
vi.mock('../../../../lib/downloadBlob', () => ({ downloadBlob: mocks.downloadBlob }))
vi.mock('../../../../state', () => ({ useToast: () => ({ show: mocks.toastShow }) }))

const pdf = (name: string) => new File(['%PDF-1.4'], name, { type: 'application/pdf' })

function docWithPages(count: number): PdfDoc {
  return addPdfSource(
    { ...emptyDoc(), settings: { header: { text: 'cabecera' } } },
    pdf('base.pdf'),
    count,
  )
}

describe('usePdfStudioOcr', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.assemblePdfInWorker.mockResolvedValue({ blob: new Blob(['%PDF-flat']) })
    mocks.createSearchablePdfInWorker.mockResolvedValue({
      pdfBlob: new Blob(['%PDF-searchable']),
      textBlob: new Blob(['texto']),
      pages: [{ text: 'hola' }, { text: '' }],
      warnings: [],
    })
    mocks.getPdfPageCount.mockResolvedValue(2)
  })

  it('con commit, el PDF buscable reemplaza al documento y conserva los ajustes', async () => {
    const commit = vi.fn()
    const before = docWithPages(2)
    const { result } = renderHook(() => usePdfStudioOcr({ commit }))
    act(() => result.current.setOcrOpen(true))

    await act(async () => {
      await result.current.startOcr(before)
    })

    expect(commit).toHaveBeenCalledTimes(1)
    const updater = commit.mock.calls[0]![0] as (prev: PdfDoc) => PdfDoc
    const after = updater(before)
    expect(after.sources).toHaveLength(1)
    expect(after.sources[0]?.file.name).toBe('trama-ocr.pdf')
    expect(after.pages).toHaveLength(2)
    expect(after.pages.every((page) => page.sourceId === after.sources[0]?.id)).toBe(true)
    expect(after.settings).toEqual(before.settings)

    // El panel sigue abierto: ahí se lee el resultado.
    expect(result.current.ocrOpen).toBe(true)
    expect(result.current.ocrStatus).toMatch(/1\/2 páginas con texto/)
    expect(result.current.ocrStatus).toMatch(/versión buscable/)
    // Las descargas siguen: el .txt es un artefacto propio y el PDF, por si acaso.
    expect(mocks.downloadBlob).toHaveBeenCalledTimes(2)
  })

  it('sin commit, se comporta como antes: descarga y no toca el documento', async () => {
    const { result } = renderHook(() => usePdfStudioOcr())
    await act(async () => {
      await result.current.startOcr(docWithPages(1))
    })
    expect(mocks.downloadBlob).toHaveBeenCalledTimes(2)
    expect(mocks.getPdfPageCount).not.toHaveBeenCalled()
    expect(result.current.ocrStatus).not.toMatch(/versión buscable/)
  })

  it('si el OCR falla, el documento queda intacto', async () => {
    mocks.createSearchablePdfInWorker.mockRejectedValue(new Error('tesseract se cayó'))
    const commit = vi.fn()
    const { result } = renderHook(() => usePdfStudioOcr({ commit }))
    await act(async () => {
      await result.current.startOcr(docWithPages(1))
    })
    expect(commit).not.toHaveBeenCalled()
    expect(result.current.ocrStatus).toMatch(
      /No se pudo completar OCR: tesseract se cayó/,
    )
  })
})
