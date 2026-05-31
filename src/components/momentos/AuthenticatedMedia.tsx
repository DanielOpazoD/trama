import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { apiFetch } from '../../api/request'
import { momentoMediaUrl } from './helpers'

function shouldFetchWithApiClient(src: string): boolean {
  return src.startsWith('/api/momentos-file/')
}

function shouldRetryLegacyMediaWithoutAuth(src: string, response: Response): boolean {
  if (response.status !== 401 && response.status !== 404) return false
  const prefix = '/api/momentos-file/'
  if (!src.startsWith(prefix)) return false
  const keyPath = src.slice(prefix.length)

  return (
    keyPath.startsWith('legacy-single-user/') ||
    keyPath.toLowerCase().startsWith('legacy-single-user%2f') ||
    (!keyPath.includes('/') && !keyPath.toLowerCase().includes('%2f'))
  )
}

async function fetchMediaBlob(src: string, signal: AbortSignal): Promise<Blob> {
  const response = await apiFetch(src, { signal })
  if (response.ok) return response.blob()

  if (shouldRetryLegacyMediaWithoutAuth(src, response)) {
    const legacyResponse = await fetch(src, { signal, headers: {} })
    if (legacyResponse.ok) return legacyResponse.blob()
    throw new Error(`media ${legacyResponse.status}`)
  }

  throw new Error(`media ${response.status}`)
}

export function useAuthenticatedMediaSrc(src: string | null | undefined): string | null {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() =>
    src && !shouldFetchWithApiClient(src) ? src : null,
  )

  useEffect(() => {
    if (!src) {
      setResolvedSrc(null)
      return
    }
    if (!shouldFetchWithApiClient(src)) {
      setResolvedSrc(src)
      return
    }

    const controller = new AbortController()
    let objectUrl: string | null = null
    let active = true
    setResolvedSrc(null)

    void fetchMediaBlob(src, controller.signal)
      .then((blob) => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setResolvedSrc(objectUrl)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (active) setResolvedSrc(null)
      })

    return () => {
      active = false
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src])

  return resolvedSrc
}

export function AuthenticatedMomentoImage({
  storageKey,
  alt,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & {
  storageKey: string
  alt: string
}) {
  const src = useAuthenticatedMediaSrc(momentoMediaUrl(storageKey))
  return <img {...props} alt={alt} src={src ?? undefined} />
}
