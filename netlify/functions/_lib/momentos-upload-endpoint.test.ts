import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext } from './test-utils'

const blobMocks = vi.hoisted(() => ({
  set: vi.fn(async () => {}),
}))

vi.mock('@netlify/blobs', () => ({
  getStore: vi.fn(() => ({ set: blobMocks.set })),
}))

import photoUploadHandler from '../momentos-upload'
import audioUploadHandler from '../momentos-audio-upload'

function formWithFile(file: File) {
  const form = new FormData()
  form.set('file', file)
  return form
}

describe('momentos upload endpoints', () => {
  beforeEach(() => {
    blobMocks.set.mockClear()
  })

  it('rechazan métodos no POST y requests que no sean multipart', async () => {
    const photoMethod = await photoUploadHandler(
      new Request('http://localhost/api/momentos-upload'),
      mockContext(),
    )
    expect(photoMethod.status).toBe(405)

    const audioMethod = await audioUploadHandler(
      new Request('http://localhost/api/momentos-audio-upload'),
      mockContext(),
    )
    expect(audioMethod.status).toBe(405)

    const photoJson = await photoUploadHandler(
      new Request('http://localhost/api/momentos-upload', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json' },
      }),
      mockContext(),
    )
    expect(photoJson.status).toBe(400)

    const audioJson = await audioUploadHandler(
      new Request('http://localhost/api/momentos-audio-upload', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json' },
      }),
      mockContext(),
    )
    expect(audioJson.status).toBe(400)
  })

  it('valida presencia, mime y tamaño antes de persistir blobs', async () => {
    const emptyForm = new FormData()
    const missing = await photoUploadHandler(
      new Request('http://localhost/api/momentos-upload', {
        method: 'POST',
        body: emptyForm,
      }),
      mockContext(),
    )
    expect(missing.status).toBe(400)

    const wrongPhotoMime = await photoUploadHandler(
      new Request('http://localhost/api/momentos-upload', {
        method: 'POST',
        body: formWithFile(new File(['hello'], 'note.txt', { type: 'text/plain' })),
      }),
      mockContext(),
    )
    expect(wrongPhotoMime.status).toBe(415)

    const wrongAudioMime = await audioUploadHandler(
      new Request('http://localhost/api/momentos-audio-upload', {
        method: 'POST',
        body: formWithFile(new File(['hello'], 'note.txt', { type: 'text/plain' })),
      }),
      mockContext(),
    )
    expect(wrongAudioMime.status).toBe(415)

    const tooLarge = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.jpg', {
      type: 'image/jpeg',
    })
    const largePhoto = await photoUploadHandler(
      new Request('http://localhost/api/momentos-upload', {
        method: 'POST',
        body: formWithFile(tooLarge),
      }),
      mockContext(),
    )
    expect(largePhoto.status).toBe(413)
    expect(blobMocks.set).not.toHaveBeenCalled()
  })

  it('sube fotos namespaced por usuario con metadata de mime y tamaño', async () => {
    const res = await photoUploadHandler(
      new Request('http://localhost/api/momentos-upload', {
        method: 'POST',
        body: formWithFile(
          new File([new Uint8Array([1, 2, 3])], 'foto.png', { type: 'image/png' }),
        ),
      }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ mime: 'image/png', size: 3 })
    expect(body.storageKey).toMatch(/^legacy-single-user\/[a-f0-9]{32}\.png$/)
    expect(blobMocks.set).toHaveBeenCalledWith(body.storageKey, expect.any(ArrayBuffer), {
      metadata: { mime: 'image/png', size: '3' },
    })
  })

  it('sube audios namespaced por usuario con extensión derivada del MIME', async () => {
    const res = await audioUploadHandler(
      new Request('http://localhost/api/momentos-audio-upload', {
        method: 'POST',
        body: formWithFile(
          new File([new Uint8Array([1, 2, 3, 4])], 'voz.webm', { type: 'audio/webm' }),
        ),
      }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ mime: 'audio/webm', size: 4 })
    expect(body.storageKey).toMatch(/^legacy-single-user\/[a-f0-9]{32}\.webm$/)
    expect(blobMocks.set).toHaveBeenCalledWith(body.storageKey, expect.any(ArrayBuffer), {
      metadata: { mime: 'audio/webm', size: '4' },
    })
  })
})
