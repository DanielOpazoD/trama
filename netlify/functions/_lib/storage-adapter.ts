import { getStore } from '@netlify/blobs'

export type StorageProvider = 'netlify-blobs'
export type StorageBlobType = 'arrayBuffer' | 'blob' | 'json' | 'stream' | 'text'
export type StorageMetadata = Record<string, string | number | boolean | null>

export type StoredBlob<T = unknown> = {
  data: T
  etag: string
  metadata: Record<string, unknown>
}

export type StorageAdapter = {
  readonly provider: StorageProvider
  readonly storeName: string
  put(
    key: string,
    data: ArrayBuffer | Blob | string,
    metadata?: StorageMetadata,
  ): Promise<void>
  getWithMetadata<T = unknown>(
    key: string,
    type?: StorageBlobType,
  ): Promise<StoredBlob<T> | null>
  getMetadata(
    key: string,
  ): Promise<{ etag: string; metadata: Record<string, unknown> } | null>
  list(prefix?: string): Promise<{ blobs: Array<{ etag: string; key: string }> }>
  exists(key: string): Promise<boolean>
  delete(key: string): Promise<void>
}

export function createNetlifyBlobStorageAdapter(storeName: string): StorageAdapter {
  const store = getStore(storeName)
  return {
    provider: 'netlify-blobs',
    storeName,
    async put(key, data, metadata) {
      await store.set(key, data, metadata ? { metadata } : undefined)
    },
    async getWithMetadata<T = unknown>(key: string, type?: StorageBlobType) {
      const blobType = type ?? 'arrayBuffer'
      const blob =
        blobType === 'arrayBuffer'
          ? await store.getWithMetadata(key, { type: 'arrayBuffer' })
          : blobType === 'blob'
            ? await store.getWithMetadata(key, { type: 'blob' })
            : blobType === 'json'
              ? await store.getWithMetadata(key, { type: 'json' })
              : blobType === 'stream'
                ? await store.getWithMetadata(key, { type: 'stream' })
                : await store.getWithMetadata(key, { type: 'text' })
      if (!blob || blob.data == null) return null
      return {
        data: blob.data as T,
        etag: blob.etag ?? '',
        metadata: { ...blob.metadata },
      }
    },
    async getMetadata(key: string) {
      const metadata = await store.getMetadata(key)
      if (!metadata) return null
      return {
        etag: metadata.etag ?? '',
        metadata: { ...metadata.metadata },
      }
    },
    async list(prefix?: string) {
      const result = await store.list(prefix ? { prefix } : undefined)
      return {
        blobs: result.blobs.map((blob) => ({
          key: blob.key,
          etag: blob.etag ?? '',
        })),
      }
    },
    async exists(key: string) {
      return (await store.getMetadata(key)) != null
    },
    async delete(key: string) {
      await store.delete(key)
    },
  }
}
