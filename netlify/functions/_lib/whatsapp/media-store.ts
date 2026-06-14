import { getStore } from '@netlify/blobs'
import { extFromMime } from './media.js'

/**
 * Sube un buffer de media al store de Netlify Blobs y devuelve la key con
 * namespace por usuario (`${userId}/${random}.${ext}`), idéntico patrón que
 * momentos-upload / recortes-image-upload. El endpoint que sirve los blobs
 * re-deriva el userId del path para autorizar.
 */
function randomHex(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Stores de Blobs válidos para media entrante (mismos que usa la app). */
export type MediaStoreName = 'momentos-media' | 'recortes-media'

export async function storeMedia(
  storeName: MediaStoreName,
  userId: string,
  buffer: ArrayBuffer,
  mime: string,
): Promise<string> {
  const key = `${userId}/${randomHex()}.${extFromMime(mime)}`
  const store = getStore(storeName)
  await store.set(key, buffer, {
    metadata: { mime, size: String(buffer.byteLength) },
  })
  return key
}
