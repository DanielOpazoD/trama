import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  pdfStampAssetFromRow,
  pdfStampAssetsApi,
  type PdfStampAssetRow,
} from './pdfStampAssets'

const requestMock = vi.hoisted(() => vi.fn())

vi.mock('./request', () => ({
  request: requestMock,
}))

const pngSrc =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

function row(overrides: Partial<PdfStampAssetRow> = {}): PdfStampAssetRow {
  return {
    id: 'signature-1',
    user_id: 'user-a',
    kind: 'signature',
    name: 'Firma Daniel',
    src: pngSrc,
    mime_type: 'image/png',
    width: 320,
    height: 120,
    byte_size: pngSrc.length,
    created_at: '2026-06-20T22:00:00.000Z',
    updated_at: '2026-06-20T22:01:00.000Z',
    last_used_at: '2026-06-20T22:02:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  requestMock.mockReset()
})

describe('pdfStampAssetsApi', () => {
  it('transforma filas snake_case a PdfStudioStampAsset camelCase', () => {
    expect(pdfStampAssetFromRow(row())).toEqual({
      id: 'signature-1',
      kind: 'signature',
      name: 'Firma Daniel',
      src: pngSrc,
      mimeType: 'image/png',
      width: 320,
      height: 120,
      createdAt: Date.parse('2026-06-20T22:00:00.000Z'),
      updatedAt: Date.parse('2026-06-20T22:01:00.000Z'),
      lastUsedAt: Date.parse('2026-06-20T22:02:00.000Z'),
    })
  })

  it('lista assets desde el endpoint cloud privado', async () => {
    requestMock.mockResolvedValueOnce([row()])

    await expect(pdfStampAssetsApi.list()).resolves.toHaveLength(1)

    expect(requestMock).toHaveBeenCalledWith('/api/pdf-stamp-assets')
  })

  it('crea, renombra, toca y elimina usando rutas cloud privadas', async () => {
    requestMock
      .mockResolvedValueOnce(row({ id: 'stamp-1', kind: 'stamp' }))
      .mockResolvedValueOnce(row({ id: 'stamp-1', name: 'Timbre legal' }))
      .mockResolvedValueOnce(row({ id: 'stamp-1' }))
      .mockResolvedValueOnce({ ok: true })

    const created = await pdfStampAssetsApi.create({
      id: 'stamp-1',
      kind: 'stamp',
      name: 'Timbre',
      src: pngSrc,
      mimeType: 'image/png',
      width: 320,
      height: 120,
      createdAt: 1,
      updatedAt: 1,
      lastUsedAt: 1,
    })
    await pdfStampAssetsApi.rename('stamp-1', 'Timbre legal')
    await pdfStampAssetsApi.touch('stamp-1')
    await pdfStampAssetsApi.remove('stamp-1')

    expect(created.id).toBe('stamp-1')
    expect(requestMock.mock.calls[0]).toEqual([
      '/api/pdf-stamp-assets',
      {
        method: 'POST',
        body: JSON.stringify({
          id: 'stamp-1',
          kind: 'stamp',
          name: 'Timbre',
          src: pngSrc,
          mimeType: 'image/png',
          width: 320,
          height: 120,
        }),
      },
    ])
    expect(requestMock.mock.calls[1]).toEqual([
      '/api/pdf-stamp-assets/stamp-1',
      {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Timbre legal' }),
      },
    ])
    expect(requestMock.mock.calls[2]).toEqual([
      '/api/pdf-stamp-assets/stamp-1/touch',
      { method: 'POST' },
    ])
    expect(requestMock.mock.calls[3]).toEqual([
      '/api/pdf-stamp-assets/stamp-1',
      { method: 'DELETE' },
    ])
  })
})
