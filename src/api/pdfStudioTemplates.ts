import { request } from './request'

export type PdfStudioTemplateStatus = 'draft' | 'ready'

/** Metadatos de una plantilla sincronizada (la lista no baja el paquete). */
export type PdfStudioTemplateRemote = {
  id: string
  savedDocId: string
  name: string
  description: string
  tags: string[]
  status: PdfStudioTemplateStatus
  pageCount: number
  fieldCount: number
  byteSize: number
  savedAt: string
  createdAt: string
  updatedAt: string
}

export async function listPdfStudioTemplates(): Promise<PdfStudioTemplateRemote[]> {
  return request<PdfStudioTemplateRemote[]>('/api/pdf-studio-templates')
}

export async function uploadPdfStudioTemplate(input: {
  packageJson: string
  savedDocId: string
  name: string
  description?: string
  tags?: string[]
  status?: PdfStudioTemplateStatus
  savedAt: number
  pageCount: number
  fieldCount: number
}): Promise<PdfStudioTemplateRemote> {
  const form = new FormData()
  form.set(
    'package',
    new File([input.packageJson], 'plantilla.json', { type: 'application/json' }),
  )
  form.set('savedDocId', input.savedDocId)
  form.set('name', input.name)
  form.set('description', input.description ?? '')
  form.set('tags', JSON.stringify(input.tags ?? []))
  form.set('status', input.status ?? 'ready')
  form.set('savedAt', String(input.savedAt))
  form.set('pageCount', String(input.pageCount))
  form.set('fieldCount', String(input.fieldCount))
  return request<PdfStudioTemplateRemote>('/api/pdf-studio-templates', {
    method: 'POST',
    body: form,
  })
}

/** Baja el paquete completo (estructura + fuentes) de una plantilla. */
export async function downloadPdfStudioTemplatePackage(id: string): Promise<unknown> {
  return request<unknown>(`/api/pdf-studio-templates/${encodeURIComponent(id)}`)
}

export async function deletePdfStudioTemplate(id: string): Promise<void> {
  await request(`/api/pdf-studio-templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}
