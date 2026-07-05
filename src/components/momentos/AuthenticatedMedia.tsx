import {
  useEffect,
  useState,
  type ImgHTMLAttributes,
  type VideoHTMLAttributes,
} from 'react'
import { requestBlob } from '../../api/request'
import { momentoMediaUrl } from './helpers'
import {
  shouldFetchWithApiClient,
  shouldRetryLegacyMediaWithoutAuth,
} from './authenticatedMediaModel'

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

/**
 * ω-video: hermano de `AuthenticatedMomentoImage` para clips. Resuelve el
 * mismo blob autenticado a un object-URL y lo monta en un `<video>`.
 *
 * A diferencia del `<img>` no hay "pixel transparente" equivalente, así que
 * mientras el blob viaja mostramos una caja papel que late —del mismo
 * tamaño que ocupará el video— y en error una caja con aviso, nunca el
 * reproductor roto del navegador. El consumidor pasa `controls`, `poster`,
 * `preload`, etc. por props.
 *
 * Autoplay confiable: como el `<video>` recién se monta cuando el blob ya
 * llegó (después del gesto del usuario), un `autoPlay` con sonido lo bloquean
 * los navegadores. Por eso `muted` cae por defecto a `autoPlay` —el visor
 * arranca en silencio y el usuario sube el volumen con los controles—, salvo
 * que el consumidor pase `muted` explícito.
 */
export function AuthenticatedMomentoVideo({
  storageKey,
  className = '',
  style,
  muted,
  autoPlay,
  ...props
}: Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src'> & {
  storageKey: string
}) {
  const { src, status } = useAuthenticatedMediaState(momentoMediaUrl(storageKey))
  const ready = status === 'ready' && !!src

  if (!ready) {
    return (
      <div
        className={`${className} ${
          status === 'loading' ? 'animate-pulse-subtle' : ''
        } flex items-center justify-center`.trim()}
        style={{ ...style, backgroundColor: 'rgb(var(--paper-100) / 0.6)' }}
      >
        {status === 'error' && (
          <span className="text-micro text-ink-400">video no disponible</span>
        )}
      </div>
    )
  }

  return (
    <video
      {...props}
      autoPlay={autoPlay}
      muted={muted ?? autoPlay}
      src={src}
      className={className}
      style={style}
    />
  )
}
