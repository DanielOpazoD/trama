import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useToast } from '../../state'
import { AuthenticatedMomentoImage } from './AuthenticatedMedia'

/**
 * DD1: panel de recuperación de blobs huérfanos.
 *
 * Si subiste fotos en un deploy preview, los blobs siguen en el store
 * global de Netlify Blobs pero los Momentos que las referenciaban se
 * perdieron al cambiar de BD (Neon branching). Este panel lista los
 * blobs huérfanos como thumbnails y permite "adoptarlos" creando un
 * Momento por cada uno.
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
      toast.show({ message: 'Foto recuperada', tone: 'success' })
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
      message:
        fail === 0 ? `${ok} fotos recuperadas` : `${ok} recuperadas, ${fail} con error`,
      tone: fail === 0 ? 'success' : 'default',
    })
  }

  if (loading) {
    return <p className="text-xs text-ink-300 italic">buscando fotos huérfanas…</p>
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-red-700">{error}</p>
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
        no hay fotos huérfanas — todos los blobs están referenciados.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-ink-500 leading-relaxed">
          Estas fotos viven en el storage pero ningún Momento las referencia
          (probablemente subidas desde un deploy preview que tenía su propia BD).
          Recupéralas para que vuelvan a aparecer en tu timeline.
        </p>
        <button
          onClick={handleRescueAll}
          disabled={rescuing !== null}
          className="shrink-0 text-micro uppercase tracking-eyebrow text-ink-500 hover:text-ink-700 transition-colors disabled:opacity-50"
        >
          recuperar todas ({orphans.length})
        </button>
      </div>
      <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {orphans.map((key) => (
          <li
            key={key}
            className="relative aspect-square rounded-md overflow-hidden border border-ink-100/60 bg-paper-100"
          >
            <AuthenticatedMomentoImage
              storageKey={key}
              alt={`Foto huérfana ${key.slice(0, 8)}`}
              loading="lazy"
              className="w-full h-full object-cover"
            />
            <button
              onClick={() => handleRescue(key)}
              disabled={rescuing !== null}
              className="absolute inset-0 flex items-end justify-center bg-ink-900/0 hover:bg-ink-900/55 transition-colors text-paper-50 text-micro uppercase tracking-eyebrow font-medium pb-2 opacity-0 hover:opacity-100 focus-visible:opacity-100 disabled:opacity-100 disabled:bg-ink-900/55"
              aria-label={`Recuperar foto ${key.slice(0, 8)}`}
            >
              {rescuing === key ? 'recuperando…' : 'recuperar'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
