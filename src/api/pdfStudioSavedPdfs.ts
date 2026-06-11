import { request } from './request'

export type PdfStudioSavedPdfKind = 'creation' | 'template' | 'filled-template'

export type PdfStudioSavedPdf = {
  id: string
  savedDocId: string
  name: string
  kind: PdfStudioSavedPdfKind
  mimeType: string
  byteSize: number
  storageKey: string
  createdAt: string
  updatedAt: string
}

export async function listPdfStudioSavedPdfs(): Promise<PdfStudioSavedPdf[]> {
  return request<PdfStudioSavedPdf[]>('/api/pdf-studio-saved-pdfs')
}

export async function uploadPdfStudioSavedPdf(input: {
  blob: Blob
  savedDocId: string
  name: string
  kind: PdfStudioSavedPdfKind
}): Promise<PdfStudioSavedPdf> {
  const form = new FormData()
  form.set(
    'file',
    new File([input.blob], `${input.name || 'imprenta'}.pdf`, {
      type: 'application/pdf',
    }),
  )
  form.set('savedDocId', input.savedDocId)
  form.set('name', input.name)
  form.set('kind', input.kind)
  return request<PdfStudioSavedPdf>('/api/pdf-studio-saved-pdfs', {
    method: 'POST',
    body: form,
  })
}

export async function deletePdfStudioSavedPdf(id: string): Promise<void> {
  await request(`/api/pdf-studio-saved-pdfs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}
