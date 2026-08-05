import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../../api'
import { requestBlob } from '../../../api/request'
import { editImage } from '../../../lib/imageEditor'
import type { Momento, MomentoPayload } from '../../../types'
import { useUpdateMomento, useToast } from '../../../state'
import {
  compressImage,
  fromDateTimeLocalInput,
  getMomentoPhotoItems,
  momentoMediaUrl,
  readImageDimensions,
  toDateTimeLocalInput,
} from '../helpers'
import { CapturedAtField, ModalFooter, ModalShell } from './shell'
import { AudioPicker } from '../AudioPicker'
import { FotoPhotoTile, type PhotoEditItem, type NewPhotoEditItem } from './FotoPhotoTile'

/**
 * Sub-modal de edición para momentos kind=foto.
 * Maneja la lógica más compleja de los 3: agregar/quitar fotos,
 * reordenar (★ portada + flechas), compresión client-side, upload
 * progresivo a Netlify Blobs.
 *
 * State local:
 *   - items[]: lista unificada de fotos. Cada item es 'existing' (ya
 *     subido al store) o 'new' (File local pendiente). Al guardar se
 *     suben solo las 'new'.
 *   - caption, note, capturedAt: campos editables.
 *   - uploading + progress: feedback durante el upload paralelo.
 */

/** Nota de voz en edición: la guardada (storageKey) o una nueva (File). */
type AudioState =
  | { kind: 'existing'; storageKey: string }
  | { kind: 'new'; file: File; previewUrl: string }
  | null

function buildInitialItems(momento: Momento): PhotoEditItem[] {
  return getMomentoPhotoItems(momento.payload).map((it) => ({
    kind: 'existing' as const,
    storageKey: it.storageKey,
    width: it.width,
    height: it.height,
    // Preservar el marcador de video: sin esto, re-guardar el momento (aunque
    // solo se cambie el caption) degradaría el clip a una foto rota.
    type: it.type,
    // Ídem el póster y la miniatura: perderlos aquí haría que cada edición
    // devuelva las tiles a bajar el original entero.
    posterStorageKey: it.posterStorageKey,
    thumbStorageKey: it.thumbStorageKey,
    dominantColor: it.dominantColor,
  }))
}

export function FotoEditModal({
  momento,
  onClose,
}: {
  momento: Momento
  onClose: () => void
}) {
  const updateMomento = useUpdateMomento()
  const toast = useToast()
  const previewUrlsRef = useRef<Set<string>>(new Set())

  const [items, setItems] = useState<PhotoEditItem[]>(() => buildInitialItems(momento))
  const [caption, setCaption] = useState(momento.payload.caption ?? '')
  const [note, setNote] = useState(momento.note ?? '')
  // Nota de voz: 'existing' (ya en el store) o 'new' (File pendiente).
  const [audio, setAudio] = useState<AudioState>(() =>
    momento.payload.audioKey
      ? { kind: 'existing', storageKey: momento.payload.audioKey }
      : null,
  )
  const [capturedAt, setCapturedAt] = useState(toDateTimeLocalInput(momento.capturedAt))
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const createPreviewUrl = useCallback((file: File) => {
    const url = URL.createObjectURL(file)
    previewUrlsRef.current.add(url)
    return url
  }, [])

  const revokePreviewUrl = useCallback((url: string) => {
    if (!previewUrlsRef.current.delete(url)) return
    URL.revokeObjectURL(url)
  }, [])

  // Cleanup blob URLs al desmontar — los `new` items tienen
  // URL.createObjectURL que hay que revocar para no leakear memoria.
  useEffect(() => {
    const previewUrls = previewUrlsRef.current
    return () => {
      for (const url of previewUrls) URL.revokeObjectURL(url)
      previewUrls.clear()
    }
  }, [])

  function addFiles(files: File[]) {
    const valid = files.filter((f) => f.type.startsWith('image/'))
    if (valid.length === 0) return
    setItems((prev) => [
      ...prev,
      ...valid.map((file) => ({
        kind: 'new' as const,
        file,
        previewUrl: createPreviewUrl(file),
      })),
    ])
  }

  function removeItem(idx: number) {
    setItems((prev) => {
      const next = [...prev]
      const removed = next.splice(idx, 1)[0]
      if (removed && removed.kind === 'new') revokePreviewUrl(removed.previewUrl)
      return next
    })
  }

  function setPrimary(idx: number) {
    setItems((prev) => {
      if (idx <= 0 || idx >= prev.length) return prev
      const next = [...prev]
      const [picked] = next.splice(idx, 1)
      if (!picked) return prev
      next.unshift(picked)
      return next
    })
  }

  function moveItem(idx: number, dir: -1 | 1) {
    setItems((prev) => {
      const target = idx + dir
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      const tmp = next[idx]
      const swap = next[target]
      if (tmp === undefined || swap === undefined) return prev
      next[idx] = swap
      next[target] = tmp
      return next
    })
  }

  /** Editar una foto (nueva o ya guardada) con el editor de imágenes. Las
   *  guardadas se bajan, se editan y se convierten en item `new` (al guardar se
   *  re-suben con storageKey nuevo; el blob viejo queda huérfano, recuperable). */
  async function editItem(idx: number) {
    const item = items[idx]
    if (!item) return
    let original: File
    if (item.kind === 'new') {
      original = item.file
    } else {
      try {
        const blob = await requestBlob(momentoMediaUrl(item.storageKey))
        original = new File([blob], `foto-${idx + 1}.jpg`, {
          type: blob.type || 'image/jpeg',
        })
      } catch (err) {
        toast.show({
          message: err instanceof Error ? err.message : 'No se pudo abrir',
          tone: 'error',
        })
        return
      }
    }
    const edited = await editImage(original, {
      outputType: 'image/jpeg',
      title: `foto ${idx + 1}`,
    })
    if (!edited || edited === original) return
    setItems((prev) => {
      const next = [...prev]
      const cur = next[idx]
      if (cur && cur.kind === 'new') revokePreviewUrl(cur.previewUrl)
      next[idx] = { kind: 'new', file: edited, previewUrl: createPreviewUrl(edited) }
      return next
    })
  }

  function setAudioFile(file: File) {
    setAudio((prev) => {
      if (prev && prev.kind === 'new') revokePreviewUrl(prev.previewUrl)
      return { kind: 'new', file, previewUrl: createPreviewUrl(file) }
    })
  }

  function removeAudio() {
    setAudio((prev) => {
      if (prev && prev.kind === 'new') revokePreviewUrl(prev.previewUrl)
      return null
    })
  }

  const audioPreviewSrc =
    audio?.kind === 'existing'
      ? momentoMediaUrl(audio.storageKey)
      : audio?.kind === 'new'
        ? audio.previewUrl
        : null

  async function handleSave() {
    if (uploading || updateMomento.isPending) return
    if (items.length === 0) {
      toast.show({ message: 'Necesitas al menos una foto', tone: 'default' })
      return
    }
    const newCapturedAt = fromDateTimeLocalInput(capturedAt)
    if (capturedAt && !newCapturedAt) {
      toast.show({ message: 'Fecha inválida', tone: 'error' })
      return
    }
    setUploading(true)
    const newItems = items.filter((it): it is NewPhotoEditItem => it.kind === 'new')
    setProgress(newItems.length > 0 ? { done: 0, total: newItems.length } : null)
    try {
      const uploadedKeys = new Map<
        File,
        { storageKey: string; width?: number; height?: number }
      >()
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
      type FinalItem = {
        storageKey: string
        width?: number
        height?: number
        type?: 'image' | 'video'
        posterStorageKey?: string
        thumbStorageKey?: string
        dominantColor?: string
      }
      const finalItems: FinalItem[] = items.flatMap((it) => {
        if (it.kind === 'existing') {
          const out: FinalItem = { storageKey: it.storageKey }
          if (it.width !== undefined) out.width = it.width
          if (it.height !== undefined) out.height = it.height
          // Conservar type ('video') y póster al reconstruir items[] — ver
          // buildInitialItems.
          if (it.type !== undefined) out.type = it.type
          if (it.posterStorageKey !== undefined)
            out.posterStorageKey = it.posterStorageKey
          if (it.thumbStorageKey !== undefined) out.thumbStorageKey = it.thumbStorageKey
          if (it.dominantColor !== undefined) out.dominantColor = it.dominantColor
          return [out]
        }
        const data = uploadedKeys.get(it.file)
        if (!data) return []
        const out: FinalItem = { storageKey: data.storageKey }
        if (data.width !== undefined) out.width = data.width
        if (data.height !== undefined) out.height = data.height
        return [out]
      })

      // Nota de voz: subir la nueva si la hay; conservar la existente;
      // o quitarla del payload si se removió.
      let audioKey: string | undefined
      if (audio?.kind === 'existing') {
        audioKey = audio.storageKey
      } else if (audio?.kind === 'new') {
        const uploadedAudio = await api.momentoAudioUpload(audio.file)
        audioKey = uploadedAudio.storageKey
        revokePreviewUrl(audio.previewUrl)
      }

      const [first] = finalItems
      const payload: MomentoPayload = {
        ...momento.payload,
        items: finalItems,
        storageKey: first?.storageKey,
        width: first?.width,
        height: first?.height,
        caption: caption.trim() || undefined,
      }
      if (audioKey) {
        payload.audioKey = audioKey
      } else {
        delete payload.audioKey
      }
      const patch: Parameters<typeof updateMomento.mutateAsync>[0]['patch'] = {
        payload,
        note: note.trim() || null,
      }
      if (newCapturedAt) patch.capturedAt = newCapturedAt
      await updateMomento.mutateAsync({ id: momento.id, patch })
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

  return (
    <ModalShell
      ariaLabel="Editar momento"
      eyebrow="editar momento"
      title="Fotos del episodio"
      onClose={onClose}
    >
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
            aria-label="Agregar fotos"
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
            {items.map((it, idx) => (
              <FotoPhotoTile
                key={it.kind === 'existing' ? it.storageKey : it.previewUrl}
                item={it}
                idx={idx}
                total={items.length}
                disabled={uploading || updateMomento.isPending}
                onRemove={() => removeItem(idx)}
                onEdit={() => editItem(idx)}
                onSetPrimary={() => setPrimary(idx)}
                onMove={(dir) => moveItem(idx, dir)}
              />
            ))}
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
          aria-label="Título del episodio"
          className="input-paper w-full font-serif text-lead leading-relaxed placeholder:italic"
          disabled={uploading || updateMomento.isPending}
        />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Tu nota sobre el momento (opcional)"
          aria-label="Nota del momento"
          rows={3}
          className="input-paper w-full resize-none font-serif text-lead leading-relaxed placeholder:italic"
          disabled={uploading || updateMomento.isPending}
        />
        <AudioPicker
          previewSrc={audioPreviewSrc}
          onPick={setAudioFile}
          onClear={removeAudio}
          disabled={uploading || updateMomento.isPending}
        />
        <CapturedAtField
          value={capturedAt}
          onChange={setCapturedAt}
          disabled={uploading || updateMomento.isPending}
        />
      </div>
      <ModalFooter
        onClose={onClose}
        onSave={handleSave}
        saveLabel={uploading ? 'subiendo…' : 'guardar cambios'}
        saving={uploading || updateMomento.isPending}
        saveDisabled={items.length === 0}
      />
    </ModalShell>
  )
}
