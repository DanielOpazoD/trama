import { request } from './request'

export type NotasAttachmentOwner = 'note' | 'prompt' | 'week'

export type NotasAttachment = {
  id: string
  ownerType: NotasAttachmentOwner
  ownerId: string
  fileName: string
  mimeType: string
  byteSize: number
  storageKey: string
  url: string
  createdAt: string
  updatedAt: string
}

type NotasAttachmentRow = {
  id: string
  owner_type: NotasAttachmentOwner
  owner_id: string
  file_name: string
  mime_type: string
  byte_size: number
  storage_key: string
  created_at: string
  updated_at: string
}

function attachmentUrl(storageKey: string): string {
  return `/api/notas-attachments-file/${storageKey
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
}

function attachmentFromRow(row: NotasAttachmentRow): NotasAttachment {
  return {
    id: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    storageKey: row.storage_key,
    url: attachmentUrl(row.storage_key),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const notasAttachmentsApi = {
  async list(input: {
    ownerType: NotasAttachmentOwner
    ownerId: string
  }): Promise<NotasAttachment[]> {
    const params = new URLSearchParams({
      ownerType: input.ownerType,
      ownerId: input.ownerId,
    })
    const rows = await request<NotasAttachmentRow[]>(
      `/api/notas-attachments?${params.toString()}`,
    )
    return rows.map(attachmentFromRow)
  },
  async upload(input: {
    ownerType: NotasAttachmentOwner
    ownerId: string
    file: File
  }): Promise<NotasAttachment> {
    const form = new FormData()
    form.append('ownerType', input.ownerType)
    form.append('ownerId', input.ownerId)
    form.append('file', input.file)
    const row = await request<NotasAttachmentRow>('/api/notas-attachments-upload', {
      method: 'POST',
      body: form,
    })
    return attachmentFromRow(row)
  },
  async remove(id: string): Promise<void> {
    await request(`/api/notas-attachments/${id}`, { method: 'DELETE' })
  },
}
