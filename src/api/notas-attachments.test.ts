import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notasAttachmentsApi } from './notas-attachments'

beforeEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('notasAttachmentsApi', () => {
  it('sube anexos sin cifrado local porque el vault aplica solo a Claves', async () => {
    const original = new File(['contenido privado del anexo'], 'brief.md', {
      type: 'text/markdown',
    })
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const form = init?.body as FormData
      const file = form.get('file') as File
      const uploadedText = await file.text()

      expect(form.get('encrypted')).toBeNull()
      expect(form.get('originalFileName')).toBeNull()
      expect(form.get('originalMimeType')).toBeNull()
      expect(form.get('originalByteSize')).toBeNull()
      expect(file.name).toBe('brief.md')
      expect(file.type).toBe('text/markdown')
      expect(uploadedText).toContain('contenido privado')
      expect(window.localStorage.getItem('trama.notas.attachments.key.v1')).toBeNull()

      return new Response(
        JSON.stringify({
          id: 'a1',
          owner_type: 'prompt',
          owner_id: 'p1',
          file_name: 'brief.md',
          mime_type: 'text/markdown',
          byte_size: original.size,
          storage_key: 'user/a1.md',
          created_at: '2026-06-01T00:00:00.000Z',
          updated_at: '2026-06-01T00:00:00.000Z',
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      notasAttachmentsApi.upload({
        ownerType: 'prompt',
        ownerId: 'p1',
        file: original,
      }),
    ).resolves.toMatchObject({
      id: 'a1',
      ownerType: 'prompt',
      ownerId: 'p1',
      fileName: 'brief.md',
      mimeType: 'text/markdown',
      byteSize: original.size,
      storageKey: 'user/a1.md',
      url: '/api/notas-attachments-file/user/a1.md',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notas-attachments-upload',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('remove usa DELETE sobre el endpoint de anexo', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await notasAttachmentsApi.remove('a1')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notas-attachments/a1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})
