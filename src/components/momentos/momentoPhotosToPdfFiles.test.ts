import { describe, expect, it, vi } from 'vitest'
import type { Momento } from '../../types'
import {
  momentoHasPhotosForImprenta,
  momentoPhotosToPdfFiles,
} from './momentoPhotosToPdfFiles'

function momento(items: Momento['payload']['items']): Momento {
  return {
    id: 'm-1',
    kind: 'foto',
    capturedAt: '2026-09-06T00:00:00.000Z',
    payload: { items },
    note: null,
    entityIds: [],
    origin: { kind: 'manual' },
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
  } as unknown as Momento
}

describe('momentoPhotosToPdfFiles', () => {
  it('baja cada foto por su URL autenticada, salta los videos y nombra por el key', async () => {
    const fetchBlob = vi.fn<(url: string) => Promise<Blob>>(
      async () => new Blob(['img'], { type: 'image/png' }),
    )
    const m = momento([
      { storageKey: 'u1/una.png' },
      { storageKey: 'u1/clip.mp4', type: 'video', posterStorageKey: 'u1/clip.jpg' },
      { storageKey: 'u1/sin-extension' },
    ])
    const { files, failures } = await momentoPhotosToPdfFiles(m, { fetchBlob })
    expect(fetchBlob.mock.calls.map((c) => c[0])).toEqual([
      '/api/momentos-file/u1/una.png',
      '/api/momentos-file/u1/sin-extension',
    ])
    expect(files.map((f) => [f.name, f.type])).toEqual([
      ['una.png', 'image/png'],
      ['sin-extension.jpg', 'image/png'],
    ])
    expect(failures).toEqual([])
  })

  it('una foto que no baja va a failures y las demás siguen', async () => {
    const fetchBlob = vi
      .fn<(url: string) => Promise<Blob>>()
      .mockRejectedValueOnce(new Error('403'))
      .mockResolvedValueOnce(new Blob(['img'], { type: 'image/jpeg' }))
    const m = momento([{ storageKey: 'u1/a.jpg' }, { storageKey: 'u1/b.jpg' }])
    const { files, failures } = await momentoPhotosToPdfFiles(m, { fetchBlob })
    expect(files.map((f) => f.name)).toEqual(['b.jpg'])
    expect(failures).toEqual([{ key: 'u1/a.jpg', reason: '403' }])
  })

  it('un momento solo con video no ofrece Imprenta', () => {
    expect(
      momentoHasPhotosForImprenta(momento([{ storageKey: 'u1/c.mp4', type: 'video' }])),
    ).toBe(false)
    expect(momentoHasPhotosForImprenta(momento([{ storageKey: 'u1/a.jpg' }]))).toBe(true)
    expect(momentoHasPhotosForImprenta(momento([]))).toBe(false)
  })
})
