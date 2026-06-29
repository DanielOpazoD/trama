import { useEffect, useState } from 'react'
import type { Quote } from '../types'
import { useUpdateQuote, useToast } from '../state'
import { ModalShell, ModalFooter } from './ModalShell'
import { Button } from './Button'

/**
 * AA-D: modal para editar una cita ya guardada.
 *
 * Campos editables:
 *   - text (cuerpo de la cita)
 *   - source (libro / artículo / álbum)
 *   - context (donde apareció, opcional)
 *   - userReflection (tu nota sobre la cita)
 *
 * NO se edita la entityId desde acá — para "atribuir a otra entidad"
 * existe otro flujo (drag entre tarjetas, todavía no implementado).
 * El usuario que quiera mover una cita la borra y la recrea.
 *
 * El chrome del modal (portal + backdrop + caja + header) lo aporta ModalShell;
 * acá viven solo los campos y las acciones.
 */
export function QuoteEditModal({
  quote,
  open,
  onClose,
}: {
  quote: Quote
  open: boolean
  onClose: () => void
}) {
  const updateQuote = useUpdateQuote()
  const toast = useToast()

  const [text, setText] = useState(quote.text)
  const [source, setSource] = useState(quote.source ?? '')
  const [link, setLink] = useState(quote.link ?? '')
  const [reflection, setReflection] = useState(quote.userReflection ?? '')

  useEffect(() => {
    if (!open) return
    setText(quote.text)
    setSource(quote.source ?? '')
    setLink(quote.link ?? '')
    setReflection(quote.userReflection ?? '')
  }, [open, quote])

  async function handleSave() {
    if (updateQuote.isPending) return
    const trimmed = text.trim()
    if (!trimmed) {
      toast.show({ message: 'La cita no puede estar vacía', tone: 'default' })
      return
    }
    try {
      await updateQuote.mutateAsync({
        id: quote.id,
        patch: {
          text: trimmed,
          source: source.trim() || null,
          link: link.trim() || null,
          userReflection: reflection.trim() || null,
        },
      })
      toast.show({ message: 'Cita actualizada', tone: 'success' })
      onClose()
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo guardar',
        tone: 'error',
      })
    }
  }

  if (!open) return null

  return (
    <ModalShell
      ariaLabel="Editar cita"
      eyebrow="editar cita"
      title="Refinar el fragmento"
      onClose={onClose}
      lockScroll={false}
    >
      <div className="px-5 py-4 space-y-3">
        <div>
          <label htmlFor="quote-edit-text" className="block section-eyebrow mb-1">
            Cita
          </label>
          <textarea
            id="quote-edit-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="input-paper w-full text-body resize-none font-serif italic leading-relaxed"
            disabled={updateQuote.isPending}
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="quote-edit-source" className="block section-eyebrow mb-1">
            Fuente (libro, artículo, álbum…)
          </label>
          <input
            id="quote-edit-source"
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="input-paper w-full text-sm"
            placeholder="Opcional"
            disabled={updateQuote.isPending}
          />
        </div>
        <div>
          <label htmlFor="quote-edit-link" className="block section-eyebrow mb-1">
            Hipervínculo
          </label>
          <input
            id="quote-edit-link"
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="input-paper w-full text-sm"
            placeholder="https://… (opcional)"
            disabled={updateQuote.isPending}
          />
        </div>
        <div>
          <label htmlFor="quote-edit-reflection" className="block section-eyebrow mb-1">
            Tu reflexión
          </label>
          <textarea
            id="quote-edit-reflection"
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            rows={3}
            className="input-paper w-full text-sm resize-none"
            placeholder="Por qué guardaste esta cita"
            disabled={updateQuote.isPending}
          />
        </div>
      </div>

      <ModalFooter>
        <Button variant="quiet" onClick={onClose} disabled={updateQuote.isPending}>
          cancelar
        </Button>
        <Button
          variant="accent"
          className="text-xs"
          onClick={handleSave}
          loading={updateQuote.isPending}
          loadingLabel="guardando…"
          disabled={!text.trim()}
        >
          guardar cambios
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
