import { ApiClientError } from '../../api/request'

// Endpoints de blobs autenticados: el browser no adjunta el bearer de Clerk a
// un `<img src>` directo (da 401), así que estos se bajan con `requestBlob`
// (header Authorization) y se sirven como object-URL.
export function shouldFetchWithApiClient(src: string): boolean {
  return (
    src.startsWith('/api/momentos-file/') ||
    src.startsWith('/api/notas-attachments-file/') ||
    src.startsWith('/api/recortes-image/') ||
    src.startsWith('/api/library-uploads-file/')
  )
}

export function shouldRetryLegacyMediaWithoutAuth(src: string, error: unknown): boolean {
  if (!(error instanceof ApiClientError)) return false
  if (error.status !== 401 && error.status !== 404) return false
  const prefix = '/api/momentos-file/'
  if (!src.startsWith(prefix)) return false
  const keyPath = src.slice(prefix.length)

  return (
    keyPath.startsWith('legacy-single-user/') ||
    keyPath.toLowerCase().startsWith('legacy-single-user%2f') ||
    (!keyPath.includes('/') && !keyPath.toLowerCase().includes('%2f'))
  )
}
