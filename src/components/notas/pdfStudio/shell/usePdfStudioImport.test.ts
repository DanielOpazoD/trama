import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyDoc } from '../../../../lib/pdfStudio/model/model'
import { usePdfStudioImport } from './usePdfStudioImport'

const mocks = vi.hoisted(() => ({
  getPdfPageCount: vi.fn(),
  toastShow: vi.fn(),
}))

vi.mock('../../../../lib/pdfStudio/render/pdfRender', () => ({
  getPdfPageCount: mocks.getPdfPageCount,
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
    expect(onImageAssets).toHaveBeenCalledWith([
      expect.objectContaining({ file: expect.objectContaining({ name: 'scan.png' }) }),
    ])
    expect(mocks.toastShow).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/pesadas|notas\.txt/i),
        tone: 'default',
      }),
    )
  })
})
