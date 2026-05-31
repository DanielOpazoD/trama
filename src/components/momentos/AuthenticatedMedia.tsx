import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { apiFetch } from '../../api/request'
import { momentoMediaUrl } from './helpers'

function shouldFetchWithApiClient(src: string): boolean {
  return src.startsWith('/api/momentos-file/')
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

    void apiFetch(src, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`media ${response.status}`)
        return response.blob()
      })
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
