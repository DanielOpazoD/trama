import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addImageSource,
  addPdfFormField,
  emptyDoc,
  makePdfFormFieldDraft,
} from '../../../../lib/pdfStudio/model/model'
import { usePdfStudioExport } from './usePdfStudioExport'

const mocks = vi.hoisted(() => ({
  assemblePdfInWorker: vi.fn(),
  writePdfFormFieldsInWorker: vi.fn(),
  toastShow: vi.fn(),
}))

vi.mock('../../../../lib/pdfStudio/export/exportWorkerClient', () => ({
  assemblePdfInWorker: mocks.assemblePdfInWorker,
}))

vi.mock('../../../../lib/pdfStudio/forms/pdfFormWorkerClient', () => ({
  writePdfFormFieldsInWorker: mocks.writePdfFormFieldsInWorker,
}))

vi.mock('../../../../state', () => ({
  useToast: () => ({ show: mocks.toastShow }),
}))

function imageFile(name = 'scan.png') {
  return new File(['scan'], name, { type: 'image/png' })
}

describe('usePdfStudioExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.assemblePdfInWorker.mockResolvedValue({
      blob: new Blob(['pdf'], { type: 'application/pdf' }),
      skipped: [],
      warnings: [],
    })
    mocks.writePdfFormFieldsInWorker.mockResolvedValue({
      blob: new Blob(['with-forms'], { type: 'application/pdf' }),
    })
  })

  it('bloquea exportaciones vacias antes de llamar al worker', async () => {
    const { result } = renderHook(() => usePdfStudioExport())
    let blob: Blob | null = null

    await act(async () => {
      blob = await result.current.preparePdf(emptyDoc())
    })

    expect(blob).toBeNull()
    expect(mocks.assemblePdfInWorker).not.toHaveBeenCalled()
    expect(mocks.toastShow).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('No hay páginas para procesar'),
        tone: 'error',
      }),
    )
  })

  it('advierte preflight de formularios incompletos y permite exportar', async () => {
    const base = addImageSource(emptyDoc(), imageFile())
    const doc = addPdfFormField(
      base,
      makePdfFormFieldDraft({
        fieldKind: 'text',
        pageId: base.pages[0]!.id,
        name: 'rut',
        value: '',
        required: true,
        xRatio: 0.1,
        yRatio: 0.2,
        wRatio: 0.3,
        hRatio: 0.05,
      }),
    )
    const { result } = renderHook(() => usePdfStudioExport())

    await act(async () => {
      await result.current.preparePdf(doc)
    })

    expect(mocks.toastShow).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/Hay campos requeridos sin completar.*rut/i),
        tone: 'default',
      }),
    )
    expect(mocks.assemblePdfInWorker).toHaveBeenCalledWith(
      doc,
      expect.objectContaining({ compression: 'balanced' }),
    )
  })
})
