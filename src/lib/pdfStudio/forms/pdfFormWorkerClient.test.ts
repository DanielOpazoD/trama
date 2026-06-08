import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fillPdfFormInWorker,
  inspectPdfFormInWorker,
  writePdfFormFieldsInWorker,
} from './pdfFormWorkerClient'

const mocks = vi.hoisted(() => ({
  runPdfHeavyOperation: vi.fn(),
  inspectPdfForm: vi.fn(),
  fillPdfForm: vi.fn(),
  writePdfFormFields: vi.fn(),
}))

vi.mock('../export/heavyOperationClient', () => ({
  runPdfHeavyOperation: mocks.runPdfHeavyOperation,
}))
vi.mock('./pdfForms', () => ({
  inspectPdfForm: mocks.inspectPdfForm,
  fillPdfForm: mocks.fillPdfForm,
  writePdfFormFields: mocks.writePdfFormFields,
}))

const pdf = () => new File(['%PDF'], 'form.pdf', { type: 'application/pdf' })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('pdfStudio/pdfFormWorkerClient', () => {
  it('inspecciona formularios via operacion pesada pdf-form', async () => {
    mocks.runPdfHeavyOperation.mockResolvedValueOnce({ fieldCount: 0, fields: [] })
    const file = pdf()

    await expect(inspectPdfFormInWorker(file)).resolves.toEqual({
      fieldCount: 0,
      fields: [],
    })

    expect(mocks.runPdfHeavyOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'pdf-form',
        payload: { action: 'inspect', file },
        fallback: expect.any(Function),
      }),
    )
  })

  it('rellena formularios via operacion pesada pdf-form', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' })
    mocks.runPdfHeavyOperation.mockResolvedValueOnce({ blob })
    const file = pdf()

    await expect(
      fillPdfFormInWorker(file, { approved: true }, { flatten: true }),
    ).resolves.toEqual({ blob })

    expect(mocks.runPdfHeavyOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'pdf-form',
        payload: {
          action: 'fill',
          file,
          values: { approved: true },
          options: { flatten: true },
        },
        fallback: expect.any(Function),
      }),
    )
  })

  it('crea campos nuevos via operacion pesada pdf-form', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' })
    mocks.runPdfHeavyOperation.mockResolvedValueOnce({ blob })
    const file = pdf()
    const fields = [
      {
        id: 'f1',
        fieldKind: 'text' as const,
        pageId: 'p1',
        name: 'paciente',
        value: 'Daniel',
        xRatio: 0.1,
        yRatio: 0.2,
        wRatio: 0.3,
        hRatio: 0.04,
      },
    ]

    await expect(
      writePdfFormFieldsInWorker(file, fields, ['p1'], { flatten: false }),
    ).resolves.toEqual({ blob })

    expect(mocks.runPdfHeavyOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'pdf-form',
        payload: {
          action: 'write',
          file,
          fields,
          pageIds: ['p1'],
          options: { flatten: false },
        },
        fallback: expect.any(Function),
      }),
    )
  })

  it('usa los fallbacks locales cuando el runner no puede crear worker', async () => {
    mocks.inspectPdfForm.mockResolvedValueOnce({ fieldCount: 1, fields: [] })
    mocks.runPdfHeavyOperation.mockImplementationOnce(({ fallback }) => fallback())

    await expect(inspectPdfFormInWorker(pdf())).resolves.toEqual({
      fieldCount: 1,
      fields: [],
    })
    expect(mocks.inspectPdfForm).toHaveBeenCalledTimes(1)
  })

  it('usa fallback local al escribir campos si el worker no está disponible', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' })
    mocks.writePdfFormFields.mockResolvedValueOnce({ blob })
    mocks.runPdfHeavyOperation.mockImplementationOnce(({ fallback }) => fallback())

    await expect(
      writePdfFormFieldsInWorker(pdf(), [], [], { flatten: true }),
    ).resolves.toEqual({
      blob,
    })
    expect(mocks.writePdfFormFields).toHaveBeenCalledTimes(1)
  })
})
