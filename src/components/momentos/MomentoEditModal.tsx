import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { Momento, MomentoPayload } from '../../types'
import { useUpdateMomento, useToast } from '../../state'
import { compressImage, readImageDimensions } from './helpers'

/**
 * χ-followup: modal para editar un momento de tipo foto. Permite:
 *   - reordenar fotos (★ portada)
 *   - quitar fotos existentes
 *   - agregar fotos nuevas (con compresión client-side)
 *   - editar título (caption) y nota
 *
 * Diseño: state local con un array unificado `items[]` donde cada
 * elemento puede ser "existing" (ya está en blobs, viene del momento
 * original) o "new" (file local pendiente de subir). El submit sólo
 * sube los "new", luego arma el payload con storageKeys mezclados y
 * llama PATCH.
 *
 * No edita momentos de tipo nota o recorte por ahora — el caso de uso
 * principal es foto (donde el usuario quiere agregar/quitar imágenes).
 */

type ExistingItem = {
  kind: 'existing'
  storageKey: string
  width?: number
  height?: number
}
type NewItem = {
  kind: 'new'
  file: File
  previewUrl: string
}
type EditItem = ExistingItem | NewItem

function buildInitialItems(momento: Momento): EditItem[] {
  const { items, storageKey, width, height } = momento.payload
  if (items && items.length > 0) {
    return items.map((it) => ({
      kind: 'existing' as const,
      storageKey: it.storageKey,
      width: it.width,
      height: it.height,
    }))
  }
  if (storageKey) {
    return [{ kind: 'existing', storageKey, width, height }]
  }
  return []
}

export function MomentoEditModal({
  momento,
  open,
  onClose,
}: {
  momento: Momento
  open: boolean
  onClose: () => void
}) {
  const updateMomento = useUpdateMomento()
  const toast = useToast()

  const [items, setItems] = useState<EditItem[]>(() => buildInitialItems(momento))
  const [caption, setCaption] = useState(momento.payload.caption ?? '')
  const [note, setNote] = useState(momento.note ?? '')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  // Rebuild state when the momento changes (e.g., modal reuse).
  useEffect(() => {
    if (!open) return
    setItems(buildInitialItems(momento))
    setCaption(momento.payload.caption ?? '')
    setNote(momento.note ?? '')
    setUploading(false)
    setProgress(null)
  }, [open, momento])

  // Cleanup blob URLs at unmount.
  useEffect(() => {
    return () => {
      for (const it of items) {
        if (it.kind === 'new') URL.revokeObjectURL(it.previewUrl)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Escape closes.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  function addFiles(files: File[]) {
    const valid = files.filter((f) => f.type.startsWith('image/'))
    if (valid.length === 0) return
    setItems((prev) => [
      ...prev,
      ...valid.map((file) => ({
        kind: 'new' as const,
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ])
  }

  function removeItem(idx: number) {
    setItems((prev) => {
      const next = [...prev]
      const removed = next.splice(idx, 1)[0]
      if (removed && removed.kind === 'new') URL.revokeObjectURL(removed.previewUrl)
      return next
    })
  }

  function setPrimary(idx: number) {
    setItems((prev) => {
      if (idx <= 0 || idx >= prev.length) return prev
      const next = [...prev]
      const [picked] = next.splice(idx, 1)
      next.unshift(picked)
      return next
    })
  }

  async function handleSave() {
    if (uploading || updateMomento.isPending) return
    if (items.length === 0) {
      toast.show({ message: 'Necesitas al menos una foto', tone: 'default' })
      return
    }
    setUploading(true)
    const newItems = items.filter((it): it is NewItem => it.kind === 'new')
    setProgress(
      newItems.length > 0 ? { done: 0, total: newItems.length } : null,
    )
    try {
      // Subir solo los nuevos. Mantenemos el orden — necesitamos
      // poder volver a poner storageKey en su posición original del
      // array `items` al final.
      const uploadedKeys = new Map<File, { storageKey: string; width?: number; height?: number }>()
      await Promise.all(
        newItems.map(async (it) => {
          const compressed = await compressImage(it.file)
          const dims = await readImageDimensions(compressed)
          const uploaded = await api.momentoUpload(compressed)
          uploadedKeys.set(it.file, {
            storageKey: uploaded.storageKey,
            width: dims.width || undefined,
            height: dims.height || undefined,
          })
          setProgress((prev) =>
            prev ? { done: prev.done + 1, total: prev.total } : prev,
          )
        }),
      )
      // Armar items[] final manteniendo el ORDEN visible (incluido el
      // marcado de portada — la primera del array).
      type FinalItem = { storageKey: string; width?: number; height?: number }
      const finalItems: FinalItem[] = items.flatMap((it) => {
        if (it.kind === 'existing') {
          const out: FinalItem = { storageKey: it.storageKey }
          if (it.width !== undefined) out.width = it.width
          if (it.height !== undefined) out.height = it.height
          return [out]
        }
        const data = uploadedKeys.get(it.file)
        if (!data) return [] // upload falló — skip
        const out: FinalItem = { storageKey: data.storageKey }
        if (data.width !== undefined) out.width = data.width
        if (data.height !== undefined) out.height = data.height
        return [out]
      })

      const [first] = finalItems
      const payload: MomentoPayload = {
        ...momento.payload,
        items: finalItems,
        // Back-compat: actualiza el storageKey legacy a la portada actual.
        storageKey: first?.storageKey,
        width: first?.width,
        height: first?.height,
        caption: caption.trim() || undefined,
      }
      await updateMomento.mutateAsync({
        id: momento.id,
        patch: {
          payload,
          note: note.trim() || null,
        },
      })
      toast.show({ message: 'Momento actualizado', tone: 'success' })
      onClose()
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo guardar',
        tone: 'error',
      })
    } finally {
      setUploading(false)
      setProgress(null)
    }
  }

  if (!open) return null

  return (
    <>
      <button
        onClick={onClose}
        aria-label="Cerrar"
        className="fixed inset-0 z-40 bg-ink-900/40 backdrop-blur-sm cursor-default animate-fade-up"
        tabIndex={-1}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none animate-fade-up">
        <div
          role="dialog"
          aria-label="Editar momento"
          aria-modal="true"
          className="pointer-events-auto w-full max-w-xl max-h-[90vh] overflow-y-auto border border-ink-100/80 rounded-xl shadow-xl shadow-ink-900/25"
          style={{ backgroundColor: 'rgb(var(--paper-50))' }}
        >
          <header className="px-5 py-3 border-b border-ink-100/60">
            <p
              className="section-eyebrow-serif"
              style={{ color: 'var(--accent-gold)' }}
            >
              editar momento
            </p>
            <h3 className="font-serif text-xl text-ink-800 leading-tight mt-1">
              Fotos del episodio
            </h3>
          </header>

          <div className="px-5 py-4 space-y-3">
            <label
              className="block border-2 border-dashed border-ink-200/60 rounded-lg p-3 text-center cursor-pointer hover:border-ink-300 hover:bg-paper-50/50 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const files = Array.from(e.dataTransfer.files ?? [])
                if (files.length > 0) addFiles(files)
              }}
            >
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? [])
                  if (files.length > 0) addFiles(files)
                  e.target.value = ''
                }}
                disabled={uploading || updateMomento.isPending}
              />
              <p className="text-sm text-ink-400">
                Arrastra más imágenes o click para elegir
              </p>
            </label>

            {items.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {items.map((it, idx) => {
                  const isPrimary = idx === 0
                  const src =
                    it.kind === 'existing'
                      ? `/api/momentos-file/${encodeURIComponent(it.storageKey)}`
                      : it.previewUrl
                  return (
                    <div
                      key={
                        it.kind === 'existing' ? it.storageKey : it.previewUrl
                      }
                      className={`group relative aspect-square overflow-hidden rounded border ${
                        isPrimary ? 'border-2' : 'border-ink-100/60'
                      } bg-paper-100/40`}
                      style={
                        isPrimary
                          ? { borderColor: 'var(--accent-gold)' }
                          : undefined
                      }
                    >
                      <img
                        src={src}
                        alt={`foto ${idx + 1}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="absolute top-1 right-1 size-5 flex items-center justify-center rounded-full bg-ink-900/70 text-paper-50 text-xs hover:bg-ink-900 transition-colors"
                        aria-label={`Quitar foto ${idx + 1}`}
                        title="Quitar"
                        disabled={uploading || updateMomento.isPending}
                      >
                        ×
                      </button>
                      {isPrimary ? (
                        <span
                          className="absolute top-1 left-1 text-micro uppercase tracking-eyebrow px-1.5 py-0.5 rounded leading-none font-medium"
                          style={{
                            backgroundColor: 'var(--accent-gold)',
                            color: '#fff',
                          }}
                        >
                          ★ portada
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPrimary(idx)}
                          className="absolute top-1 left-1 text-micro uppercase tracking-eyebrow px-1.5 py-0.5 rounded leading-none bg-ink-900/55 text-paper-50 hover:bg-ink-900/80 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                          title="Marcar como portada"
                          disabled={uploading || updateMomento.isPending}
                        >
                          ★ portada
                        </button>
                      )}
                      <span className="absolute bottom-1 left-1 text-micro tabular-nums bg-ink-900/60 text-paper-50 px-1 rounded leading-none py-0.5">
                        {idx + 1}
                      </span>
                      {it.kind === 'new' && (
                        <span
                          className="absolute bottom-1 right-1 text-micro uppercase tracking-eyebrow bg-emerald-700/80 text-paper-50 px-1 rounded leading-none py-0.5"
                          title="Foto nueva — se subirá al guardar"
                        >
                          nueva
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-caption text-ink-400 italic text-center py-3">
                Sin fotos. Agrega al menos una.
              </p>
            )}

            {progress && progress.total > 0 && (
              <p className="text-caption text-ink-400 italic tabular-nums">
                Subiendo {progress.done} de {progress.total}…
              </p>
            )}

            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Título del episodio (opcional)"
              className="input-paper w-full text-sm"
              disabled={uploading || updateMomento.isPending}
            />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Tu nota sobre el momento (opcional)"
              rows={2}
              className="input-paper w-full text-sm resize-none"
              disabled={uploading || updateMomento.isPending}
            />
          </div>

          <div className="px-5 py-3 border-t border-ink-100/60 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={uploading || updateMomento.isPending}
              className="text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors disabled:opacity-60"
            >
              cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={
                uploading || updateMomento.isPending || items.length === 0
              }
              className="btn-ink text-xs"
            >
              {uploading
                ? 'subiendo…'
                : updateMomento.isPending
                  ? 'guardando…'
                  : 'guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
