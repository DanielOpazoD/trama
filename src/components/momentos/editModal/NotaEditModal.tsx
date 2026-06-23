import { useState } from 'react'
import type { Momento } from '../../../types'
import { useUpdateMomento, useToast } from '../../../state'
import { fromDateTimeLocalInput, toDateTimeLocalInput } from '../helpers'
import { CapturedAtField, ModalFooter, ModalShell } from './shell'

/**
 * Sub-modal de edición para momentos kind=nota.
 * Permite editar `bodyText` y `capturedAt`.
 */
export function NotaEditModal({
  momento,
  onClose,
}: {
  momento: Momento
  onClose: () => void
}) {
  const updateMomento = useUpdateMomento()
  const toast = useToast()
  const [bodyText, setBodyText] = useState(momento.payload.bodyText ?? '')
  const [capturedAt, setCapturedAt] = useState(toDateTimeLocalInput(momento.capturedAt))

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
        saveDisabled={!bodyText.trim()}
      />
    </ModalShell>
  )
}
