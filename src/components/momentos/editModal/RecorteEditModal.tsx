import { useState } from 'react'
import type { Momento, MomentoPayload } from '../../../types'
import { useUpdateMomento, useToast } from '../../../state'
import { fromDateTimeLocalInput, toDateTimeLocalInput } from '../helpers'
import { CapturedAtField, ModalFooter, ModalShell } from './shell'

/**
 * Sub-modal de edición para momentos kind=recorte.
 * Permite editar url, title, bodyText, source, author, note, capturedAt.
 *
 * Mantenemos la convención: campo undefined si vacío (no string ''),
 * para que el JSONB del payload quede limpio.
 */
export function RecorteEditModal({
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
  const [capturedAt, setCapturedAt] = useState(toDateTimeLocalInput(momento.capturedAt))

  async function handleSave() {
    if (updateMomento.isPending) return
    const newCapturedAt = fromDateTimeLocalInput(capturedAt)
    if (capturedAt && !newCapturedAt) {
      toast.show({ message: 'Fecha inválida', tone: 'error' })
      return
    }
    try {
      const payload: MomentoPayload = { ...momento.payload }
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
          aria-label="URL del recorte"
          className="input-paper w-full text-sm"
          disabled={updateMomento.isPending}
        />
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título"
          aria-label="Título del recorte"
          className="input-paper w-full"
          disabled={updateMomento.isPending}
        />
        <textarea
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          placeholder="Texto del recorte (el tweet, el párrafo, lo que pegues)"
          aria-label="Texto del recorte"
          rows={4}
          className="input-paper w-full resize-none font-serif text-lead leading-relaxed placeholder:italic"
          disabled={updateMomento.isPending}
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Autor (opcional)"
            aria-label="Autor"
            className="input-paper flex-1 text-sm"
            disabled={updateMomento.isPending}
          />
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Fuente (Twitter, blog…)"
            aria-label="Fuente"
            className="input-paper flex-1 text-sm"
            disabled={updateMomento.isPending}
          />
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Tu nota: por qué te llamó la atención"
          aria-label="Nota del recorte"
          rows={2}
          className="input-paper w-full resize-none font-serif text-lead leading-relaxed placeholder:italic"
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
