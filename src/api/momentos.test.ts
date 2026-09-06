import { beforeEach, describe, expect, it, vi } from 'vitest'
import { momentosApi } from './momentos'
import type { MomentoRow } from './transform'

const requestMock = vi.hoisted(() => vi.fn())

vi.mock('./request', () => ({
  request: requestMock,
  // El contrato solo verifica; para estos tests la lectura es la misma llamada.
  requestContract: (_key: string, url: string, init?: RequestInit) =>
    init === undefined ? requestMock(url) : requestMock(url, init),
}))

const row: MomentoRow = {
  id: 'momento-1',
  kind: 'nota',
  captured_at: '2026-05-31T10:00:00.000Z',
  payload: { bodyText: 'Una nota' },
  note: null,
  origin: { kind: 'manual' },
  entity_ids: ['entity-1'],
  created_at: '2026-05-31T10:00:00.000Z',
  updated_at: '2026-05-31T10:00:00.000Z',
}

describe('momentosApi', () => {
  beforeEach(() => {
    requestMock.mockReset()
  })

  it('lista momentos con query params y transforma rows snake_case a camelCase', async () => {
    requestMock.mockResolvedValue({ items: [row], nextCursor: 'cursor-2' })

    const result = await momentosApi.listMomentos({
      cursor: 'cursor-1',
      limit: 25,
      kind: 'nota',
    })

    expect(requestMock).toHaveBeenCalledWith(
      '/api/momentos?cursor=cursor-1&limit=25&kind=nota',
    )
    expect(result).toEqual({
      items: [
        {
          id: 'momento-1',
          kind: 'nota',
          capturedAt: '2026-05-31T10:00:00.000Z',
          payload: { bodyText: 'Una nota' },
          note: undefined,
          origin: { kind: 'manual' },
          entityIds: ['entity-1'],
          createdAt: '2026-05-31T10:00:00.000Z',
          updatedAt: '2026-05-31T10:00:00.000Z',
        },
      ],
      nextCursor: 'cursor-2',
    })
  })

  it('crea momentos enviando captured_at, entity_ids y origin por defecto', async () => {
    requestMock.mockResolvedValue(row)

    await momentosApi.createMomento({
      kind: 'nota',
      payload: { bodyText: 'Nueva' },
      capturedAt: '2026-05-31T11:00:00.000Z',
    })

    expect(requestMock).toHaveBeenCalledWith('/api/momentos', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'nota',
        payload: { bodyText: 'Nueva' },
        note: null,
        captured_at: '2026-05-31T11:00:00.000Z',
        entity_ids: [],
        origin: { kind: 'manual' },
      }),
    })
  })

  it('actualiza solo los campos definidos y cruza capturedAt/entityIds a snake_case', async () => {
    requestMock.mockResolvedValue(row)

    const updated = await momentosApi.updateMomento('momento-1', {
      note: null,
      capturedAt: '2026-05-31T12:00:00.000Z',
      entityIds: ['entity-2'],
    })

    expect(requestMock).toHaveBeenCalledWith('/api/momentos/momento-1', {
      method: 'PATCH',
      body: JSON.stringify({
        note: null,
        captured_at: '2026-05-31T12:00:00.000Z',
        entity_ids: ['entity-2'],
      }),
    })
    expect(updated).toMatchObject({
      id: 'momento-1',
      capturedAt: '2026-05-31T10:00:00.000Z',
      entityIds: ['entity-1'],
      createdAt: '2026-05-31T10:00:00.000Z',
    })
  })

  it('delete y restore preservan contrato operacional y transforman restore', async () => {
    requestMock
      .mockResolvedValueOnce({ deletedAt: '2026-05-31T12:30:00.000Z' })
      .mockResolvedValueOnce(row)

    await expect(momentosApi.deleteMomento('momento-1')).resolves.toEqual({
      deletedAt: '2026-05-31T12:30:00.000Z',
    })
    await expect(
      momentosApi.restoreMomento('momento-1', '2026-05-31T12:30:00.000Z'),
    ).resolves.toMatchObject({
      id: 'momento-1',
      capturedAt: '2026-05-31T10:00:00.000Z',
      entityIds: ['entity-1'],
      createdAt: '2026-05-31T10:00:00.000Z',
    })

    expect(requestMock.mock.calls[0]).toEqual([
      '/api/momentos/momento-1',
      { method: 'DELETE' },
    ])
    expect(requestMock.mock.calls[1]).toEqual([
      '/api/momentos-restore',
      {
        method: 'POST',
        body: JSON.stringify({
          id: 'momento-1',
          deletedAt: '2026-05-31T12:30:00.000Z',
        }),
      },
    ])
  })

  it('usa endpoints hyphenated para preview, merge, restore y rescate de blobs', async () => {
    requestMock
      .mockResolvedValueOnce({ url: 'https://x.test/a b', fetched: true })
      .mockResolvedValueOnce({ ...row, merged: 2, itemCount: 3, deletedOthers: [] })
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({ orphans: ['old.jpg'], totalInStore: 2, referenced: 1 })
      .mockResolvedValueOnce(row)

    await momentosApi.momentoUrlPreview('https://x.test/a b')
    await momentosApi.mergeMomentos({
      primaryId: 'm1',
      otherIds: ['m2'],
      note: 'unidas',
      capturedAt: '2026-05-31T12:00:00.000Z',
    })
    await momentosApi.restoreMomento('m2', '2026-05-31T12:30:00.000Z')
    await momentosApi.listOrphanedBlobs()
    await momentosApi.rescueOrphanedBlob({
      storageKey: 'old.jpg',
      note: 'rescate',
      capturedAt: '2026-05-31T13:00:00.000Z',
    })

    expect(requestMock.mock.calls[0]?.[0]).toBe(
      '/api/momentos-url-preview?url=https%3A%2F%2Fx.test%2Fa%20b',
    )
    expect(requestMock.mock.calls[1]).toEqual([
      '/api/momentos-merge',
      {
        method: 'POST',
        body: JSON.stringify({
          primaryId: 'm1',
          otherIds: ['m2'],
          note: 'unidas',
          capturedAt: '2026-05-31T12:00:00.000Z',
        }),
      },
    ])
    expect(requestMock.mock.calls[2]).toEqual([
      '/api/momentos-restore',
      {
        method: 'POST',
        body: JSON.stringify({
          id: 'm2',
          deletedAt: '2026-05-31T12:30:00.000Z',
        }),
      },
    ])
    expect(requestMock.mock.calls[3]).toEqual(['/api/momentos-orphaned-blobs'])
    expect(requestMock.mock.calls[4]).toEqual([
      '/api/momentos-orphaned-blobs',
      {
        method: 'POST',
        body: JSON.stringify({
          storageKey: 'old.jpg',
          note: 'rescate',
          capturedAt: '2026-05-31T13:00:00.000Z',
        }),
      },
    ])
  })

  it('sube imagen y audio usando FormData en los endpoints dedicados', async () => {
    requestMock.mockResolvedValue({ storageKey: 'k', mime: 'image/jpeg', size: 10 })
    const image = new File(['img'], 'foto.jpg', { type: 'image/jpeg' })
    const audio = new File(['wav'], 'voz.wav', { type: 'audio/wav' })

    await momentosApi.momentoUpload(image)
    await momentosApi.momentoAudioUpload(audio)

    expect(requestMock.mock.calls[0]?.[0]).toBe('/api/momentos-upload')
    expect(requestMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' })
    expect(requestMock.mock.calls[0]?.[1].body).toBeInstanceOf(FormData)
    expect((requestMock.mock.calls[0]?.[1].body as FormData).get('file')).toBe(image)

    expect(requestMock.mock.calls[1]?.[0]).toBe('/api/momentos-audio-upload')
    expect(requestMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' })
    expect(requestMock.mock.calls[1]?.[1].body).toBeInstanceOf(FormData)
    expect((requestMock.mock.calls[1]?.[1].body as FormData).get('file')).toBe(audio)
  })

  it('expone aliases legibles para uploads privados sin cambiar rutas', async () => {
    const uploadApi = momentosApi as unknown as {
      uploadMedia: typeof momentosApi.momentoUpload
      uploadAudio: typeof momentosApi.momentoAudioUpload
    }
    const image = new File(['img'], 'foto.webp', { type: 'image/webp' })
    const audio = new File(['webm'], 'voz.webm', { type: 'audio/webm' })
    requestMock
      .mockResolvedValueOnce({ storageKey: 'photo-key', mime: 'image/webp', size: 3 })
      .mockResolvedValueOnce({ storageKey: 'audio-key', mime: 'audio/webm', size: 4 })

    await expect(uploadApi.uploadMedia(image)).resolves.toEqual({
      storageKey: 'photo-key',
      mime: 'image/webp',
      size: 3,
    })
    await expect(uploadApi.uploadAudio(audio)).resolves.toEqual({
      storageKey: 'audio-key',
      mime: 'audio/webm',
      size: 4,
    })

    expect(requestMock.mock.calls[0]?.[0]).toBe('/api/momentos-upload')
    expect((requestMock.mock.calls[0]?.[1].body as FormData).get('file')).toBe(image)
    expect(requestMock.mock.calls[1]?.[0]).toBe('/api/momentos-audio-upload')
    expect((requestMock.mock.calls[1]?.[1].body as FormData).get('file')).toBe(audio)
  })

  it('actualiza el permiso de un acceso compartido', async () => {
    requestMock.mockResolvedValue({
      userId: 'user-papa',
      role: 'editor',
      acceptedAt: '2026-06-10T12:00:00.000Z',
    })

    await momentosApi.updateMomentoShareAccessRole('user-papa', 'editor')

    expect(requestMock).toHaveBeenCalledWith('/api/momentos-share-access/user-papa', {
      method: 'PATCH',
      body: JSON.stringify({ role: 'editor' }),
    })
  })
})
