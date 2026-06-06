import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inspectPdfFormInWorker, fillPdfFormInWorker } from './pdfFormWorkerClient'

const mocks = vi.hoisted(() => ({
  runPdfHeavyOperation: vi.fn(),
  inspectPdfForm: vi.fn(),
  fillPdfForm: vi.fn(),
}))

vi.mock('./heavyOperationClient', () => ({
  runPdfHeavyOperation: mocks.runPdfHeavyOperation,
}))
vi.mock('./pdfForms', () => ({
  inspectPdfForm: mocks.inspectPdfForm,
  fillPdfForm: mocks.fillPdfForm,
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

  it('usa los fallbacks locales cuando el runner no puede crear worker', async () => {
    mocks.inspectPdfForm.mockResolvedValueOnce({ fieldCount: 1, fields: [] })
    mocks.runPdfHeavyOperation.mockImplementationOnce(({ fallback }) => fallback())

    await expect(inspectPdfFormInWorker(pdf())).resolves.toEqual({
      fieldCount: 1,
      fields: [],
    })
    expect(mocks.inspectPdfForm).toHaveBeenCalledTimes(1)
  })
})
