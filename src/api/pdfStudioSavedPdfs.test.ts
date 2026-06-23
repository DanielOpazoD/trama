import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestMock = vi.hoisted(() => vi.fn())

vi.mock('./request', () => ({
  request: requestMock,
}))

import {
  deletePdfStudioSavedPdf,
  listPdfStudioSavedPdfs,
  uploadPdfStudioSavedPdf,
} from './pdfStudioSavedPdfs'

beforeEach(() => {
  requestMock.mockReset()
})

describe('pdfStudioSavedPdfs API contract', () => {
  it('lista PDFs guardados desde el endpoint privado sin fetch manual', async () => {
    requestMock.mockResolvedValueOnce([
      {
        id: 'pdf-1',
        savedDocId: 'doc-1',
        name: 'Contrato',
        kind: 'creation',
        mimeType: 'application/pdf',
        byteSize: 1234,
        storageKey: 'u/pdf-1.pdf',
        createdAt: '2026-06-22T00:00:00.000Z',
        updatedAt: '2026-06-22T00:01:00.000Z',
      },
    ])

    await expect(listPdfStudioSavedPdfs()).resolves.toHaveLength(1)

    expect(requestMock).toHaveBeenCalledWith('/api/pdf-studio-saved-pdfs')
  })

  it('sube PDFs como FormData sin forzar Content-Type manual', async () => {
    requestMock.mockResolvedValueOnce({
      id: 'pdf-2',
      savedDocId: 'doc-2',
      name: 'Imprenta',
      kind: 'template',
      mimeType: 'application/pdf',
      byteSize: 3,
      storageKey: 'u/pdf-2.pdf',
      createdAt: '2026-06-22T00:00:00.000Z',
      updatedAt: '2026-06-22T00:01:00.000Z',
    })

    await uploadPdfStudioSavedPdf({
      blob: new Blob(['pdf'], { type: 'application/pdf' }),
      savedDocId: 'doc-2',
      name: 'Imprenta',
      kind: 'template',
    })

    const [, init] = requestMock.mock.calls[0]!
    const form = (init as RequestInit).body as FormData
    const file = form.get('file') as File
    expect(requestMock).toHaveBeenCalledWith(
      '/api/pdf-studio-saved-pdfs',
      expect.objectContaining({ method: 'POST' }),
    )
    expect((init as RequestInit).headers).toBeUndefined()
    expect(file.name).toBe('Imprenta.pdf')
    expect(file.type).toBe('application/pdf')
    expect(form.get('savedDocId')).toBe('doc-2')
    expect(form.get('name')).toBe('Imprenta')
    expect(form.get('kind')).toBe('template')
  })

  it('elimina por id codificado con DELETE', async () => {
    requestMock.mockResolvedValueOnce(undefined)

    await deletePdfStudioSavedPdf('pdf/id con espacios')

    expect(requestMock).toHaveBeenCalledWith(
      '/api/pdf-studio-saved-pdfs/pdf%2Fid%20con%20espacios',
      { method: 'DELETE' },
    )
  })
})
