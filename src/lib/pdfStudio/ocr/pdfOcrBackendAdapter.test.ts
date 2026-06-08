import { describe, expect, it, vi } from 'vitest'
import {
  createClientPdfOcrAdapter,
  backendPdfOcrAdapterPlaceholder,
} from './pdfOcrBackendAdapter'

describe('pdfStudio/pdfOcrBackendAdapter', () => {
  it('ejecuta OCR client-side con el mismo contrato de adaptador futuro', async () => {
    const run = vi.fn(async () => ({
      pdfBlob: new Blob(['pdf'], { type: 'application/pdf' }),
      textBlob: new Blob(['txt'], { type: 'text/plain' }),
      pages: [],
      warnings: [],
    }))
    const adapter = createClientPdfOcrAdapter(run)
    const file = new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' })

    await adapter.run(file, { language: 'spa' })

    expect(adapter.kind).toBe('client')
    expect(run).toHaveBeenCalledWith(file, { language: 'spa' })
  })

  it('deja explicito que el backend OCRmyPDF aun no esta conectado', async () => {
    await expect(
      backendPdfOcrAdapterPlaceholder.run(
        new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' }),
        { language: 'eng' },
      ),
    ).rejects.toMatchObject({
      code: 'OCR_BACKEND_UNAVAILABLE',
    })
  })
})
