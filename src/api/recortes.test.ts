import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  recorteFromRow,
  recorteImageUrl,
  recortesApi,
  type PromoteRecorteInput,
  type RecorteRow,
} from './recortes'

const requestMock = vi.hoisted(() => vi.fn())

vi.mock('./request', () => ({
  request: requestMock,
}))

function row(over: Partial<RecorteRow> = {}): RecorteRow {
  return {
    id: 'r1',
    text: 'captura',
    source_url: null,
    source_title: null,
    source_author: null,
    note: null,
    image_url: null,
    image_key: null,
    capture_mode: 'image',
    status: 'pending',
    promoted_target: null,
    promoted_id: null,
    captured_at: null,
    created_at: '2026-06-14T12:00:00.000Z',
    updated_at: '2026-06-14T12:00:00.000Z',
    ...over,
  }
}

beforeEach(() => {
  requestMock.mockReset()
})

describe('recorteFromRow — normalización de images[]', () => {
  it('usa recorte_images (evento multi-imagen) cuando hay filas', () => {
    const r = recorteFromRow(
      row({
        image_key: 'cover.jpg',
        images: [{ storage_key: 'cover.jpg' }, { storage_key: 'b.jpg' }],
      }),
    )
    expect(r.images).toEqual([{ storageKey: 'cover.jpg' }, { storageKey: 'b.jpg' }])
    // image_key sigue siendo la portada.
    expect(r.imageKey).toBe('cover.jpg')
  })

  it('cae a [image_key] cuando no hay recorte_images (recorte legacy de una imagen)', () => {
    const r = recorteFromRow(row({ image_key: 'sola.jpg', images: [] }))
    expect(r.images).toEqual([{ storageKey: 'sola.jpg' }])
  })

  it('cae a [image_key] cuando images viene ausente (null/undefined)', () => {
    const r = recorteFromRow(row({ image_key: 'sola.jpg', images: null }))
    expect(r.images).toEqual([{ storageKey: 'sola.jpg' }])
  })

  it('queda vacío cuando el recorte no tiene imagen propia (solo texto/enlace)', () => {
    const r = recorteFromRow(row({ image_key: null, images: [] }))
    expect(r.images).toEqual([])
  })
})

describe('recorteImageUrl', () => {
  it('codifica cada segmento por separado preservando el path de dos partes', () => {
    expect(recorteImageUrl('user 1/blob a.jpg')).toBe(
      '/api/recortes-image/user%201/blob%20a.jpg',
    )
  })
})

describe('recortesApi mutation contracts', () => {
  it('remove/restore preservan deletedAt y endpoint restore', async () => {
    requestMock
      .mockResolvedValueOnce({ ok: true, deletedAt: '2026-06-18T11:00:00.000Z' })
      .mockResolvedValueOnce({ restored: true })

    await expect(recortesApi.removeRecorte('r1')).resolves.toEqual({
      deletedAt: '2026-06-18T11:00:00.000Z',
    })
    await recortesApi.restoreRecorte('r1', '2026-06-18T11:00:00.000Z')

    expect(requestMock.mock.calls[0]).toEqual(['/api/recortes/r1', { method: 'DELETE' }])
    expect(requestMock.mock.calls[1]).toEqual([
      '/api/recortes/r1/restore',
      {
        method: 'POST',
        body: JSON.stringify({ deletedAt: '2026-06-18T11:00:00.000Z' }),
      },
    ])
  })

  it('promote/unpromote transforman la fila snake_case a camelCase', async () => {
    const promoted = row({
      status: 'promoted',
      promoted_target: 'momento',
      promoted_id: 'momento-1',
      source: 'whatsapp',
    })
    const pending = row({
      status: 'pending',
      promoted_target: null,
      promoted_id: null,
    })
    const input: PromoteRecorteInput = {
      target: 'momento',
      momento: {
        kind: 'recorte',
        payload: { bodyText: 'captura' },
      },
    }
    requestMock.mockResolvedValueOnce(promoted).mockResolvedValueOnce(pending)

    await expect(recortesApi.promoteRecorte('r1', input)).resolves.toMatchObject({
      status: 'promoted',
      promotedTarget: 'momento',
      promotedId: 'momento-1',
      captureSource: 'whatsapp',
      createdAt: '2026-06-14T12:00:00.000Z',
    })
    await expect(recortesApi.unpromoteRecorte('r1')).resolves.toMatchObject({
      status: 'pending',
      promotedTarget: null,
      promotedId: null,
    })

    expect(requestMock.mock.calls[0]).toEqual([
      '/api/recortes/r1/promote',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ])
    expect(requestMock.mock.calls[1]).toEqual([
      '/api/recortes/r1/unpromote',
      { method: 'POST' },
    ])
  })
})
