import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyDoc } from '../../../../lib/pdfStudio/model/model'
import { usePdfStudioImport } from './usePdfStudioImport'

const mocks = vi.hoisted(() => ({
  getPdfPageCount: vi.fn(),
  imagesToSheetPdfFile: vi.fn(),
  toastShow: vi.fn(),
}))

vi.mock('../../../../lib/pdfStudio/render/pdfRender', () => ({
  getPdfPageCount: mocks.getPdfPageCount,
}))

vi.mock('../../../../lib/pdfStudio/assemble/imagesToSheetPdfFile', () => ({
  imagesToSheetPdfFile: mocks.imagesToSheetPdfFile,
}))

vi.mock('../../../../state', () => ({
  useToast: () => ({ show: mocks.toastShow }),
}))

function file(name: string, size: number, type: string): File {
  return new File([new Uint8Array(size)], name, { type })
}

describe('usePdfStudioImport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getPdfPageCount.mockResolvedValue(1)
    mocks.imagesToSheetPdfFile.mockResolvedValue(
      new File(['%PDF-1.4'], 'imagenes.pdf', { type: 'application/pdf' }),
    )
  })

  it('bloquea importaciones sin archivos soportados antes de procesarlas', async () => {
    const commit = vi.fn()
    const onImageAssets = vi.fn()
    const { result } = renderHook(() =>
      usePdfStudioImport({ commit, doc: emptyDoc(), onImageAssets }),
    )

    await act(async () => {
      await result.current.addFiles([file('notas.txt', 1200, 'text/plain')])
    })

    expect(mocks.getPdfPageCount).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
    expect(mocks.toastShow).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('notas.txt'),
        tone: 'error',
      }),
    )
  })

  it('advierte riesgos de importacion y procesa los archivos validos', async () => {
    const commit = vi.fn()
    const onImageAssets = vi.fn()
    const { result } = renderHook(() =>
      usePdfStudioImport({ commit, doc: emptyDoc(), onImageAssets }),
    )

    await act(async () => {
      await result.current.addFiles([
        file('scan.png', 16 * 1024 * 1024, 'image/png'),
        file('notas.txt', 1200, 'text/plain'),
      ])
    })

    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({ pages: expect.arrayContaining([expect.any(Object)]) }),
    )
    expect(onImageAssets).toHaveBeenCalledWith([])
    expect(mocks.toastShow).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/pesadas|notas\.txt/i),
        tone: 'default',
      }),
    )
  })

  it('convierte imagenes importadas en hojas PDF editables con el layout configurado', async () => {
    const commit = vi.fn()
    const onImageAssets = vi.fn()
    const doc = {
      ...emptyDoc(),
      settings: { imageLayout: { imagesPerPage: 4 as const } },
    }
    const { result } = renderHook(() =>
      usePdfStudioImport({ commit, doc, onImageAssets }),
    )

    const files = [
      file('a.png', 1200, 'image/png'),
      file('b.webp', 1200, 'image/webp'),
      file('c.jpg', 1200, 'image/jpeg'),
    ]
    await act(async () => {
      await result.current.addFiles(files)
    })

    expect(mocks.imagesToSheetPdfFile).toHaveBeenCalledWith(files, {
      imagesPerPage: 4,
    })
    expect(mocks.getPdfPageCount).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'imagenes.pdf', type: 'application/pdf' }),
    )
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [expect.objectContaining({ kind: 'pdf' })],
        pages: [expect.objectContaining({ kind: 'pdf', pageIndex: 0 })],
      }),
    )
    expect(onImageAssets).toHaveBeenCalledWith([])
  })
})
