import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { ApiClientError, requestBlob } from '../../api/request'
import { momentoMediaUrl } from './helpers'

// Endpoints de blobs autenticados: el browser no adjunta el bearer de Clerk a
// un `<img src>` directo (da 401), así que estos se bajan con `requestBlob`
// (header Authorization) y se sirven como object-URL. Aplica a media de
// Momentos y a los anexos de Notas/Tareas.
function shouldFetchWithApiClient(src: string): boolean {
  return (
    src.startsWith('/api/momentos-file/') ||
    src.startsWith('/api/notas-attachments-file/') ||
    src.startsWith('/api/recortes-image/') ||
    src.startsWith('/api/library-uploads-file/')
  )
}

function shouldRetryLegacyMediaWithoutAuth(src: string, error: unknown): boolean {
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

async function fetchMediaBlob(src: string, signal: AbortSignal): Promise<Blob> {
  try {
    return await requestBlob(src, { signal })
  } catch (error) {
    if (!shouldRetryLegacyMediaWithoutAuth(src, error)) throw error
    const legacyResponse = await fetch(src, { signal, headers: {} })
    if (legacyResponse.ok) return legacyResponse.blob()
    const legacyError = new Error(`media ${legacyResponse.status}`) as Error & {
      cause?: unknown
    }
    legacyError.cause = error
    throw legacyError
  }
}

type MediaStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Resuelve un src de media autenticado a un object-URL (o lo deja pasar si
 * ya es directo) y expone el estado de la carga. El estado permite mostrar
 * un placeholder con spinner mientras el blob viaja y un placeholder de
 * "no disponible" si falla — en vez del icono de imagen rota del browser.
 */
export function useAuthenticatedMediaState(src: string | null | undefined): {
  src: string | null
  status: MediaStatus
} {
  const direct = src && !shouldFetchWithApiClient(src) ? src : null
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(direct)
  const [status, setStatus] = useState<MediaStatus>(
    direct ? 'ready' : src ? 'loading' : 'idle',
  )

  useEffect(() => {
    if (!src) {
      setResolvedSrc(null)
      setStatus('idle')
      return
    }
    if (!shouldFetchWithApiClient(src)) {
      setResolvedSrc(src)
      setStatus('ready')
      return
    }

    const controller = new AbortController()
    let objectUrl: string | null = null
    let active = true
    setResolvedSrc(null)
    setStatus('loading')

    void fetchMediaBlob(src, controller.signal)
      .then((blob) => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setResolvedSrc(objectUrl)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (active) {
          setResolvedSrc(null)
          setStatus('error')
        }
      })

    return () => {
      active = false
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src])

  return { src: resolvedSrc, status }
}

/** Compat: la mayoría de los consumidores (AudioNote) solo quieren el src. */
export function useAuthenticatedMediaSrc(src: string | null | undefined): string | null {
  return useAuthenticatedMediaState(src).src
}

// Pixel transparente: mientras el blob viaja, el <img> carga ESTO (no un
// src vacío) — así el navegador nunca dibuja su icono de imagen rota.
const TRANSPARENT_PX =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

export function AuthenticatedMomentoImage({
  storageKey,
  alt,
  className = '',
  style,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & {
  storageKey: string
  alt: string
}) {
  const { src, status } = useAuthenticatedMediaState(momentoMediaUrl(storageKey))
  const ready = status === 'ready' && !!src

  // El <img> SIEMPRE está montado (accesible + estable). Mientras el blob
  // viaja mostramos un pixel transparente sobre un fondo papel que late, así
  // nunca aparece el icono de imagen rota del navegador. En error queda el
  // fondo papel sin latido (caja vacía sutil, no un glyph roto).
  return (
    <img
      {...props}
      className={`${className} ${status === 'loading' ? 'animate-pulse-subtle' : ''}`.trim()}
      alt={alt}
      src={ready ? src : TRANSPARENT_PX}
      style={ready ? style : { ...style, backgroundColor: 'rgb(var(--paper-100) / 0.6)' }}
    />
  )
}
