import { beforeEach, describe, expect, it, vi } from 'vitest'

const blobStoreMocks = vi.hoisted(() => ({
  set: vi.fn(async () => {}),
  getWithMetadata: vi.fn(async () => null as unknown),
  getMetadata: vi.fn(async () => null as unknown),
  delete: vi.fn(async () => {}),
}))

const getStoreMock = vi.hoisted(() => vi.fn(() => blobStoreMocks))

vi.mock('@netlify/blobs', () => ({
  getStore: getStoreMock,
}))

import { createNetlifyBlobStorageAdapter } from './storage-adapter'

describe('StorageAdapter', () => {
  beforeEach(() => {
    getStoreMock.mockClear()
    blobStoreMocks.set.mockClear()
    blobStoreMocks.getWithMetadata.mockClear()
    blobStoreMocks.getMetadata.mockClear()
    blobStoreMocks.delete.mockClear()
  })

  it('encapsula escrituras y lecturas de Netlify Blobs con metadata tipada', async () => {
    blobStoreMocks.getWithMetadata.mockResolvedValueOnce({
      data: new Uint8Array([1, 2]).buffer,
      etag: 'etag-1',
      metadata: { mime: 'image/png', size: '2' },
    })

    const adapter = createNetlifyBlobStorageAdapter('recortes-media')
    await adapter.put('user-a/blob.png', new Uint8Array([1, 2]).buffer, {
      mime: 'image/png',
      size: '2',
    })
    const blob = await adapter.getWithMetadata('user-a/blob.png', 'arrayBuffer')

    expect(getStoreMock).toHaveBeenCalledWith('recortes-media')
    expect(blobStoreMocks.set).toHaveBeenCalledWith(
      'user-a/blob.png',
      expect.any(ArrayBuffer),
      { metadata: { mime: 'image/png', size: '2' } },
    )
    expect(blob).toMatchObject({
      data: expect.any(ArrayBuffer),
      etag: 'etag-1',
      metadata: { mime: 'image/png', size: '2' },
    })
  })

  it('expone exists y delete sin filtrar detalles del proveedor', async () => {
    blobStoreMocks.getMetadata.mockResolvedValueOnce({
      etag: 'etag-2',
      metadata: { mime: 'text/plain' },
    })

    const adapter = createNetlifyBlobStorageAdapter('notas-attachments')

    await expect(adapter.exists('user-a/file.txt')).resolves.toBe(true)
    await adapter.delete('user-a/file.txt')

    expect(blobStoreMocks.getMetadata).toHaveBeenCalledWith('user-a/file.txt')
    expect(blobStoreMocks.delete).toHaveBeenCalledWith('user-a/file.txt')
  })
})
