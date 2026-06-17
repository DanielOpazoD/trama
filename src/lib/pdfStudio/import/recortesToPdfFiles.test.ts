import { describe, expect, it, vi } from 'vitest'
import type { Recorte } from '../../../api'
import { imageKeysFromRecortes, recortesToPdfFiles } from './recortesToPdfFiles'

function recorte(overrides: Partial<Recorte> = {}): Recorte {
  return {
    id: 'r1',
    text: 'foto',
    sourceUrl: null,
    sourceTitle: null,
    sourceAuthor: null,
    note: null,
    imageUrl: null,
    imageKey: null,
    images: [],
    captureMode: 'image',
    status: 'pending',
    promotedTarget: null,
    promotedId: null,
    captureSource: 'whatsapp',
    capturedAt: '2026-06-17T12:00:00.000Z',
    createdAt: '2026-06-17T12:00:00.000Z',
    updatedAt: '2026-06-17T12:00:00.000Z',
    ...overrides,
  }
}

describe('recortesToPdfFiles', () => {
  it('deduplica imageKey e images preservando el orden de selección', () => {
    expect(
      imageKeysFromRecortes([
        recorte({
          imageKey: 'u/a.webp',
          images: [{ storageKey: 'u/a.webp' }, { storageKey: 'u/b.webp' }],
        }),
        recorte({ imageKey: 'u/b.webp' }),
      ]),
    ).toEqual(['u/a.webp', 'u/b.webp'])
  })

  it('descarga las imágenes disponibles y registra fallas sin cancelar el lote', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('missing')) return new Response('no', { status: 404 })
      return new Response(new Blob(['img'], { type: 'image/webp' }))
    })

    const result = await recortesToPdfFiles(
      [
        recorte({ imageKey: 'user/foto uno.webp' }),
        recorte({ imageKey: 'user/missing.webp' }),
      ],
      { fetcher },
    )

    expect(fetcher).toHaveBeenCalledWith('/api/recortes-image/user/foto%20uno.webp')
    expect(result.files).toHaveLength(1)
    expect(result.files[0]!.name).toBe('foto uno.webp')
    expect(result.files[0]!.type).toBe('image/webp')
    expect(result.failures).toEqual([{ key: 'user/missing.webp', reason: 'HTTP 404' }])
  })
})
