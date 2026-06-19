import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notesApi, type NoteRow } from './notes'

const requestMock = vi.hoisted(() => vi.fn())

vi.mock('./request', () => ({
  request: requestMock,
}))

const row: NoteRow = {
  id: 'note-1',
  content: 'contenido #tag',
  title: 'Título',
  tags: ['tag'],
  pinned: false,
  promoted_momento_id: 'momento-1',
  source: 'whatsapp',
  created_at: '2026-06-18T10:00:00.000Z',
  updated_at: '2026-06-18T10:01:00.000Z',
  has_images: true,
  has_audio: true,
}

describe('notesApi mutation contracts', () => {
  beforeEach(() => {
    requestMock.mockReset()
  })

  it('crea notas y transforma respuesta snake_case a camelCase', async () => {
    requestMock.mockResolvedValue(row)

    const note = await notesApi.create('contenido #tag', {
      title: 'Título',
      pinned: true,
    })

    expect(requestMock).toHaveBeenCalledWith('/api/notes', {
      method: 'POST',
      body: JSON.stringify({
        content: 'contenido #tag',
        title: 'Título',
        pinned: true,
      }),
    })
    expect(note).toMatchObject({
      id: 'note-1',
      promotedMomentoId: 'momento-1',
      source: 'whatsapp',
      createdAt: '2026-06-18T10:00:00.000Z',
      updatedAt: '2026-06-18T10:01:00.000Z',
      hasImages: true,
      hasAudio: true,
    })
  })

  it('actualiza notas enviando solo el patch definido', async () => {
    requestMock.mockResolvedValue({ ...row, title: null, pinned: true })

    await notesApi.update('note-1', { title: null, pinned: true })

    expect(requestMock).toHaveBeenCalledWith('/api/notes/note-1', {
      method: 'PATCH',
      body: JSON.stringify({ title: null, pinned: true }),
    })
  })

  it('preserva deletedAt/restore/promote como contrato operacional', async () => {
    requestMock
      .mockResolvedValueOnce({ ok: true, deletedAt: '2026-06-18T11:00:00.000Z' })
      .mockResolvedValueOnce({ restored: true })
      .mockResolvedValueOnce({ momentoId: 'momento-2' })

    await expect(notesApi.remove('note-1')).resolves.toEqual({
      deletedAt: '2026-06-18T11:00:00.000Z',
    })
    await notesApi.restore('note-1', '2026-06-18T11:00:00.000Z')
    await expect(notesApi.promote('note-1')).resolves.toEqual({ momentoId: 'momento-2' })

    expect(requestMock.mock.calls[0]).toEqual(['/api/notes/note-1', { method: 'DELETE' }])
    expect(requestMock.mock.calls[1]).toEqual([
      '/api/notes/note-1/restore',
      {
        method: 'POST',
        body: JSON.stringify({ deletedAt: '2026-06-18T11:00:00.000Z' }),
      },
    ])
    expect(requestMock.mock.calls[2]).toEqual([
      '/api/notes/note-1/promote',
      { method: 'POST' },
    ])
  })

  it('rechaza remove si el servidor no devuelve deletedAt', async () => {
    requestMock.mockResolvedValue({ ok: true, deletedAt: null })

    await expect(notesApi.remove('note-1')).rejects.toThrow(
      'DELETE /api/notes/:id did not return deletedAt',
    )
  })
})
