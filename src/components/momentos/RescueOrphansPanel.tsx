import { useEffect, useState } from 'react'
import { api } from '../../api'
import { LoadingHint } from '../LoadingHint'
import { useToast } from '../../state'
import {
  AuthenticatedMomentoImage,
  AuthenticatedMomentoVideo,
} from './AuthenticatedMedia'
import { isVideoStorageKey } from './helpers'
import { VideoPlayBadge } from './VideoPlayBadge'

/**
 * DD1: panel de recuperación de media huérfana.
 *
 * Si subiste fotos en un deploy preview, los blobs siguen en el store
 * global de Netlify Blobs pero los Momentos que las referenciaban se
 * perdieron al cambiar de BD (Neon branching). Este panel lista los
 * blobs huérfanos como thumbnails y permite "adoptarlos" creando un
 * Momento por cada uno.
 *
 * También lista videos: la media grande vive en R2 y el barrido del endpoint
 * enumera los dos backends. Por eso cada miniatura elige `<video>` o `<img>`
 * según la extensión de la key — un clip en un `<img>` sería una caja vacía.
 *
 * Vive en Settings/Data y se muestra solo si hay al menos 1 huérfano.
 */
export function RescueOrphansPanel() {
  const toast = useToast()
  const [orphans, setOrphans] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [rescuing, setRescuing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function fetchOrphans() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.listOrphanedBlobs()
      setOrphans(res.orphans)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al buscar huérfanos')
      setOrphans([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrphans()
  }, [])

  async function handleRescue(storageKey: string) {
    setRescuing(storageKey)
    try {
      await api.rescueOrphanedBlob({ storageKey })
      // Quitar de la lista local sin re-fetchear (UI snappy)
      setOrphans((prev) => (prev ?? []).filter((k) => k !== storageKey))
      toast.show({
        message: isVideoStorageKey(storageKey) ? 'Video recuperado' : 'Foto recuperada',
        tone: 'success',
      })
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo recuperar',
        tone: 'error',
      })
    } finally {
      setRescuing(null)
    }
  }

  async function handleRescueAll() {
    if (!orphans || orphans.length === 0) return
    const keys = [...orphans]
    let ok = 0
    let fail = 0
    for (const key of keys) {
      setRescuing(key)
      try {
        await api.rescueOrphanedBlob({ storageKey: key })
        ok++
        setOrphans((prev) => (prev ?? []).filter((k) => k !== key))
      } catch {
        fail++
      }
    }
    setRescuing(null)
    toast.show({
      message: fail === 0 ? `${ok} recuperados` : `${ok} recuperados, ${fail} con error`,
      tone: fail === 0 ? 'success' : 'default',
    })
  }

  if (loading) {
    return <LoadingHint text="buscando fotos y videos huérfanos" />
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-[color:var(--accent-clay)]">{error}</p>
        <button
          onClick={fetchOrphans}
          className="text-xs px-3 py-1.5 border border-ink-100/60 rounded-md hover:bg-ink-50 transition-all"
        >
          reintentar
        </button>
      </div>
    )
  }

  if (!orphans || orphans.length === 0) {
    return (
      <p className="text-xs text-ink-300 italic">
        no hay fotos ni videos huérfanos — toda la media está referenciada.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-body text-ink-500 leading-relaxed">
          Estas fotos y videos viven en el storage pero ningún Momento los referencia
          (probablemente subidos desde un deploy preview que tenía su propia BD).
          Recupéralos para que vuelvan a aparecer en tu timeline.
        </p>
        <button
          onClick={handleRescueAll}
          disabled={rescuing !== null}
          className="shrink-0 text-micro uppercase tracking-eyebrow text-ink-500 hover:text-ink-700 transition-colors disabled:opacity-50"
        >
          recuperar todo ({orphans.length})
        </button>
      </div>
      <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {orphans.map((key) => {
          const esVideo = isVideoStorageKey(key)
          const etiqueta = `${esVideo ? 'Video' : 'Foto'} huérfano ${key.slice(0, 8)}`
          return (
            <li
              key={key}
              className="relative aspect-square rounded-md overflow-hidden border border-ink-100/60 bg-paper-100"
            >
              {esVideo ? (
                <>
                  <AuthenticatedMomentoVideo
                    storageKey={key}
                    muted
                    playsInline
                    preload="metadata"
                    aria-label={etiqueta}
                    className="w-full h-full object-cover"
                  />
                  <VideoPlayBadge />
                </>
              ) : (
                <AuthenticatedMomentoImage
                  storageKey={key}
                  alt={etiqueta}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              )}
              <button
                onClick={() => handleRescue(key)}
                disabled={rescuing !== null}
                className="absolute inset-0 flex items-end justify-center bg-ink-900/0 hover:bg-ink-900/55 transition-colors text-paper-50 text-micro uppercase tracking-eyebrow font-medium pb-2 opacity-0 hover:opacity-100 focus-visible:opacity-100 disabled:opacity-100 disabled:bg-ink-900/55"
                aria-label={`Recuperar ${etiqueta.toLowerCase()}`}
              >
                {rescuing === key ? 'recuperando…' : 'recuperar'}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
