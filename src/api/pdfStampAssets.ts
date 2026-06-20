import type { PdfStudioStampAsset } from '../lib/pdfStudio/stamps/stampAssets'
import { request } from './request'

export type PdfStampAssetRow = {
  id: string
  user_id: string
  kind: PdfStudioStampAsset['kind']
  name: string
  src: string
  mime_type: PdfStudioStampAsset['mimeType']
  width: number
  height: number
  byte_size: number
  created_at: string
  updated_at: string
  last_used_at: string
}

export function pdfStampAssetFromRow(row: PdfStampAssetRow): PdfStudioStampAsset {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    src: row.src,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
    lastUsedAt: Date.parse(row.last_used_at),
  }
}

export const pdfStampAssetsApi = {
  async list(): Promise<PdfStudioStampAsset[]> {
    const rows = await request<PdfStampAssetRow[]>('/api/pdf-stamp-assets')
    return rows.map(pdfStampAssetFromRow)
  },

  async create(asset: PdfStudioStampAsset): Promise<PdfStudioStampAsset> {
    const row = await request<PdfStampAssetRow>('/api/pdf-stamp-assets', {
      method: 'POST',
      body: JSON.stringify({
        id: asset.id,
        kind: asset.kind,
        name: asset.name,
        src: asset.src,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
      }),
    })
    return pdfStampAssetFromRow(row)
  },

  async rename(id: string, name: string): Promise<PdfStudioStampAsset> {
    const row = await request<PdfStampAssetRow>(`/api/pdf-stamp-assets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    })
    return pdfStampAssetFromRow(row)
  },

  async touch(id: string): Promise<PdfStudioStampAsset> {
    const row = await request<PdfStampAssetRow>(`/api/pdf-stamp-assets/${id}/touch`, {
      method: 'POST',
    })
    return pdfStampAssetFromRow(row)
  },

  async remove(id: string): Promise<void> {
    await request<{ ok: boolean }>(`/api/pdf-stamp-assets/${id}`, {
      method: 'DELETE',
    })
  },
}
