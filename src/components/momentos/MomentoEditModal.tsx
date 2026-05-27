import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import type { Momento, MomentoPayload } from '../../types'
import { useUpdateMomento, useToast } from '../../state'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import {
  compressImage,
  fromDateTimeLocalInput,
  readImageDimensions,
  toDateTimeLocalInput,
} from './helpers'

/**
 * Modal de edición de Momentos. Despacha al sub-renderer correcto según
 * `momento.kind` — cada kind tiene shape de payload distinto:
 *
 *   - nota    → bodyText (textarea serif)
 *   - recorte → url, title, body, source, author, note
 *   - foto    → items[], caption, note (con upload + reorder)
 *
 * Todas las kinds permiten además modificar `capturedAt` (independiente
 * del momento de subida — útil para backdating).
 *
 * Tipografía: los inputs de texto largo (nota, body, caption) usan la
 * misma estética que el composer de nota: `font-serif text-base
 * leading-relaxed placeholder:italic`. Es la "voz" del momento.
 */
export function MomentoEditModal({
  momento,
  open,
  onClose,
}: {
  momento: Momento
  open: boolean
  onClose: () => void
}) {
  if (!open) return null
  if (momento.kind === 'nota') {
    return <NotaEditModal momento={momento} onClose={onClose} />
  }
  if (momento.kind === 'recorte') {
    return <RecorteEditModal momento={momento} onClose={onClose} />
  }
  return <FotoEditModal momento={momento} onClose={onClose} />
}

// ──────────────────────────────────────────────────────────────────
// Shell de modal — overlay + dialog. Compartido entre los 3 sub-modales.
// ──────────────────────────────────────────────────────────────────

function ModalShell({
  ariaLabel,
  eyebrow,
  title,
  children,
  onClose,
}: {
  ariaLabel: string
  eyebrow: string
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, true)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
          ref={dialogRef}
          role="dialog"
          aria-label={ariaLabel}
          aria-modal="true"
          className="pointer-events-auto w-full max-w-xl max-h-[90vh] overflow-y-auto border border-ink-100/80 rounded-xl shadow-xl shadow-ink-900/25"
          style={{ backgroundColor: 'rgb(var(--paper-50))' }}
        >
          <header className="px-5 py-3 border-b border-ink-100/60">
            <p
              className="section-eyebrow-serif"
              style={{ color: 'var(--accent-gold)' }}
            >
              {eyebrow}
            </p>
            <h3 className="font-serif text-xl text-ink-800 leading-tight mt-1">
              {title}
            </h3>
          </header>
          {children}
        </div>
      </div>
    </>
  )
}

/** Campo de fecha — usado por los 3 sub-modales. */
function CapturedAtField({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <label className="block space-y-1">
      <span className="text-micro uppercase tracking-eyebrow text-ink-400">
        fecha y hora del momento
      </span>
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-paper w-full text-sm tabular-nums"
        disabled={disabled}
      />
    </label>
  )
}

function ModalFooter({
  onClose,
  onSave,
  saveLabel,
  saving,
  saveDisabled,
}: {
  onClose: () => void
  onSave: () => void
  saveLabel: string
  saving: boolean
  saveDisabled?: boolean
}) {
  return (
    <div className="px-5 py-3 border-t border-ink-100/60 flex justify-end gap-3">
      <button
        type="button"
        onClick={onClose}
        disabled={saving}
        className="text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors disabled:opacity-60"
      >
        cancelar
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving || saveDisabled}
        className="btn-accent text-xs"
      >
        {saving ? 'guardando…' : saveLabel}
      </button>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// NOTA — editar bodyText + capturedAt.
// ──────────────────────────────────────────────────────────────────

function NotaEditModal({
  momento,
  onClose,
}: {
  momento: Momento
  onClose: () => void
}) {
  const updateMomento = useUpdateMomento()
  const toast = useToast()
  const [bodyText, setBodyText] = useState(momento.payload.bodyText ?? '')
  const [capturedAt, setCapturedAt] = useState(
    toDateTimeLocalInput(momento.capturedAt),
  )

  async function handleSave() {
    if (updateMomento.isPending) return
    const trimmed = bodyText.trim()
    if (!trimmed) {
      toast.show({ message: 'La nota no puede estar vacía', tone: 'default' })
      return
    }
    const newCapturedAt = fromDateTimeLocalInput(capturedAt)
    if (capturedAt && !newCapturedAt) {
      toast.show({ message: 'Fecha inválida', tone: 'error' })
      return
    }
    try {
      const patch: Parameters<typeof updateMomento.mutateAsync>[0]['patch'] = {
        payload: { ...momento.payload, bodyText: trimmed },
      }
      if (newCapturedAt) patch.capturedAt = newCapturedAt
      await updateMomento.mutateAsync({ id: momento.id, patch })
      toast.show({ message: 'Nota actualizada', tone: 'success' })
      onClose()
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo guardar',
        tone: 'error',
      })
    }
  }

  return (
    <ModalShell
      ariaLabel="Editar nota"
      eyebrow="editar momento"
      title="Nota del día"
      onClose={onClose}
    >
      <div className="px-5 py-4 space-y-3">
        <textarea
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          placeholder="Una observación, una idea, un recuerdo del día…"
          rows={6}
          className="input-paper w-full resize-none font-serif text-base leading-relaxed placeholder:italic"
          disabled={updateMomento.isPending}
        />
        <CapturedAtField
          value={capturedAt}
          onChange={setCapturedAt}
          disabled={updateMomento.isPending}
        />
      </div>
      <ModalFooter
        onClose={onClose}
        onSave={handleSave}
        saveLabel="guardar cambios"
        saving={updateMomento.isPending}
        saveDisabled={!bodyText.trim()}
      />
    </ModalShell>
  )
}

// ──────────────────────────────────────────────────────────────────
// RECORTE — editar url, title, bodyText, source, author, note, capturedAt.
// ──────────────────────────────────────────────────────────────────

function RecorteEditModal({
  momento,
  onClose,
}: {
  momento: Momento
  onClose: () => void
}) {
  const updateMomento = useUpdateMomento()
  const toast = useToast()
  const [url, setUrl] = useState(momento.payload.url ?? '')
  const [title, setTitle] = useState(momento.payload.title ?? '')
  const [bodyText, setBodyText] = useState(momento.payload.bodyText ?? '')
  const [source, setSource] = useState(momento.payload.source ?? '')
  const [author, setAuthor] = useState(momento.payload.author ?? '')
  const [note, setNote] = useState(momento.note ?? '')
  const [capturedAt, setCapturedAt] = useState(
    toDateTimeLocalInput(momento.capturedAt),
  )

  async function handleSave() {
    if (updateMomento.isPending) return
    const newCapturedAt = fromDateTimeLocalInput(capturedAt)
    if (capturedAt && !newCapturedAt) {
      toast.show({ message: 'Fecha inválida', tone: 'error' })
      return
    }
    try {
      const payload: MomentoPayload = { ...momento.payload }
      // Mantenemos la convención de payload: campo undefined si vacío,
      // no string vacío. Esto deja el JSONB limpio.
      const trimmedUrl = url.trim()
      const trimmedTitle = title.trim()
      const trimmedBody = bodyText.trim()
      const trimmedSource = source.trim()
      const trimmedAuthor = author.trim()
      payload.url = trimmedUrl || undefined
      payload.title = trimmedTitle || undefined
      payload.bodyText = trimmedBody || undefined
      payload.source = trimmedSource || undefined
      payload.author = trimmedAuthor || undefined

      const patch: Parameters<typeof updateMomento.mutateAsync>[0]['patch'] = {
        payload,
        note: note.trim() || null,
      }
      if (newCapturedAt) patch.capturedAt = newCapturedAt
      await updateMomento.mutateAsync({ id: momento.id, patch })
      toast.show({ message: 'Recorte actualizado', tone: 'success' })
      onClose()
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo guardar',
        tone: 'error',
      })
    }
  }

  return (
    <ModalShell
      ariaLabel="Editar recorte"
      eyebrow="editar momento"
      title="Recorte del mundo"
      onClose={onClose}
    >
      <div className="px-5 py-4 space-y-3">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className="input-paper w-full text-sm"
          disabled={updateMomento.isPending}
        />
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título"
          className="input-paper w-full"
          disabled={updateMomento.isPending}
        />
        <textarea
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          placeholder="Texto del recorte (el tweet, el párrafo, lo que pegues)"
          rows={4}
          className="input-paper w-full resize-none font-serif text-base leading-relaxed placeholder:italic"
          disabled={updateMomento.isPending}
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Autor (opcional)"
            className="input-paper flex-1 text-sm"
            disabled={updateMomento.isPending}
          />
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Fuente (Twitter, blog…)"
            className="input-paper flex-1 text-sm"
            disabled={updateMomento.isPending}
          />
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Tu nota: por qué te llamó la atención"
          rows={2}
          className="input-paper w-full resize-none font-serif text-base leading-relaxed placeholder:italic"
          disabled={updateMomento.isPending}
        />
        <CapturedAtField
          value={capturedAt}
          onChange={setCapturedAt}
          disabled={updateMomento.isPending}
        />
      </div>
      <ModalFooter
        onClose={onClose}
        onSave={handleSave}
        saveLabel="guardar cambios"
        saving={updateMomento.isPending}
      />
    </ModalShell>
  )
}

// ──────────────────────────────────────────────────────────────────
// FOTO — editar items[], caption, note, capturedAt (con upload).
// Mantiene la lógica original de reorder, portada, upload progresivo.
// ──────────────────────────────────────────────────────────────────

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

function FotoEditModal({
  momento,
  onClose,
}: {
  momento: Momento
  onClose: () => void
}) {
  const updateMomento = useUpdateMomento()
  const toast = useToast()

  const [items, setItems] = useState<EditItem[]>(() => buildInitialItems(momento))
  const [caption, setCaption] = useState(momento.payload.caption ?? '')
  const [note, setNote] = useState(momento.note ?? '')
  const [capturedAt, setCapturedAt] = useState(
    toDateTimeLocalInput(momento.capturedAt),
  )
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  // Cleanup blob URLs al desmontar.
  useEffect(() => {
    return () => {
      for (const it of items) {
        if (it.kind === 'new') URL.revokeObjectURL(it.previewUrl)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    const newItems = items.filter((it): it is NewItem => it.kind === 'new')
    setProgress(
      newItems.length > 0 ? { done: 0, total: newItems.length } : null,
    )
    try {
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
      type FinalItem = { storageKey: string; width?: number; height?: number }
      const finalItems: FinalItem[] = items.flatMap((it) => {
        if (it.kind === 'existing') {
          const out: FinalItem = { storageKey: it.storageKey }
          if (it.width !== undefined) out.width = it.width
          if (it.height !== undefined) out.height = it.height
          return [out]
        }
        const data = uploadedKeys.get(it.file)
        if (!data) return []
        const out: FinalItem = { storageKey: data.storageKey }
        if (data.width !== undefined) out.width = data.width
        if (data.height !== undefined) out.height = data.height
        return [out]
      })

      const [first] = finalItems
      const payload: MomentoPayload = {
        ...momento.payload,
        items: finalItems,
        storageKey: first?.storageKey,
        width: first?.width,
        height: first?.height,
        caption: caption.trim() || undefined,
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
                      className="absolute top-1 right-7 text-micro uppercase tracking-eyebrow bg-emerald-700/80 text-paper-50 px-1 rounded leading-none py-0.5"
                      title="Foto nueva — se subirá al guardar"
                    >
                      nueva
                    </span>
                  )}
                  {items.length > 1 && (
                    <div className="absolute bottom-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() => moveItem(idx, -1)}
                          className="size-5 flex items-center justify-center rounded bg-ink-900/65 text-paper-50 text-xs hover:bg-ink-900/85 transition-colors leading-none"
                          aria-label={`Mover foto ${idx + 1} hacia atrás`}
                          title="Mover atrás"
                          disabled={uploading || updateMomento.isPending}
                        >
                          ‹
                        </button>
                      )}
                      {idx < items.length - 1 && (
                        <button
                          type="button"
                          onClick={() => moveItem(idx, 1)}
                          className="size-5 flex items-center justify-center rounded bg-ink-900/65 text-paper-50 text-xs hover:bg-ink-900/85 transition-colors leading-none"
                          aria-label={`Mover foto ${idx + 1} hacia adelante`}
                          title="Mover adelante"
                          disabled={uploading || updateMomento.isPending}
                        >
                          ›
                        </button>
                      )}
                    </div>
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
          className="input-paper w-full font-serif text-base leading-relaxed placeholder:italic"
          disabled={uploading || updateMomento.isPending}
        />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Tu nota sobre el momento (opcional)"
          rows={3}
          className="input-paper w-full resize-none font-serif text-base leading-relaxed placeholder:italic"
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
