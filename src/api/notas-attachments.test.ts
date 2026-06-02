import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notasAttachmentsApi } from './notas-attachments'

beforeEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('notasAttachmentsApi', () => {
  it('cifra el archivo antes de subirlo y conserva metadata original en form-data', async () => {
    const original = new File(['contenido privado del anexo'], 'brief.md', {
      type: 'text/markdown',
    })
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const form = init?.body as FormData
      const file = form.get('file') as File
      const uploadedText = await file.text()

      expect(form.get('encrypted')).toBe('1')
      expect(form.get('originalFileName')).toBe('brief.md')
      expect(form.get('originalMimeType')).toBe('text/markdown')
      expect(form.get('originalByteSize')).toBe(String(original.size))
      expect(file.name).toBe('brief.md.tramaenc')
      expect(file.type).toBe('application/octet-stream')
      expect(uploadedText).not.toContain('contenido privado')

      return new Response(
        JSON.stringify({
          id: 'a1',
          owner_type: 'prompt',
          owner_id: 'p1',
          file_name: 'brief.md',
          mime_type: 'text/markdown',
          byte_size: 24,
          storage_key: 'user/a1.tramaenc',
          created_at: '2026-06-01T00:00:00.000Z',
          updated_at: '2026-06-01T00:00:00.000Z',
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    await notasAttachmentsApi.upload({
      ownerType: 'prompt',
      ownerId: 'p1',
      file: original,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notas-attachments-upload',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
