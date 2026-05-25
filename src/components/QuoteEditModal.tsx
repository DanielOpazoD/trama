import { useEffect, useState } from 'react'
import type { Quote } from '../types'
import { useUpdateQuote, useToast } from '../state'

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
  const [context, setContext] = useState(quote.context ?? '')
  const [reflection, setReflection] = useState(quote.userReflection ?? '')

  useEffect(() => {
    if (!open) return
    setText(quote.text)
    setSource(quote.source ?? '')
    setContext(quote.context ?? '')
    setReflection(quote.userReflection ?? '')
  }, [open, quote])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

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
          context: context.trim() || null,
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
          aria-label="Editar cita"
          aria-modal="true"
          className="pointer-events-auto w-full max-w-xl max-h-[90vh] overflow-y-auto border border-ink-100/80 rounded-xl shadow-xl shadow-ink-900/25"
          style={{ backgroundColor: 'rgb(var(--paper-50))' }}
        >
          <header className="px-5 py-3 border-b border-ink-100/60">
            <p
              className="section-eyebrow-serif"
              style={{ color: 'var(--accent-gold)' }}
            >
              editar cita
            </p>
            <h3 className="font-serif text-xl text-ink-800 leading-tight mt-1">
              Refinar el fragmento
            </h3>
          </header>

          <div className="px-5 py-4 space-y-3">
            <div>
              <label className="block text-micro uppercase tracking-eyebrow text-ink-400 mb-1">
                Cita
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                className="input-paper w-full text-sm resize-none font-serif italic leading-relaxed"
                disabled={updateQuote.isPending}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-micro uppercase tracking-eyebrow text-ink-400 mb-1">
                Fuente (libro, artículo, álbum…)
              </label>
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="input-paper w-full text-sm"
                placeholder="Opcional"
                disabled={updateQuote.isPending}
              />
            </div>
            <div>
              <label className="block text-micro uppercase tracking-eyebrow text-ink-400 mb-1">
                Contexto
              </label>
              <input
                type="text"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                className="input-paper w-full text-sm"
                placeholder="Capítulo, página, año…"
                disabled={updateQuote.isPending}
              />
            </div>
            <div>
              <label className="block text-micro uppercase tracking-eyebrow text-ink-400 mb-1">
                Tu reflexión
              </label>
              <textarea
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                rows={3}
                className="input-paper w-full text-sm resize-none"
                placeholder="Por qué guardaste esta cita"
                disabled={updateQuote.isPending}
              />
            </div>
          </div>

          <div className="px-5 py-3 border-t border-ink-100/60 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={updateQuote.isPending}
              className="text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors disabled:opacity-60"
            >
              cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={updateQuote.isPending || !text.trim()}
              className="px-3 py-1.5 text-xs font-medium bg-ink-900 text-paper-50 rounded-md hover:bg-ink-800 disabled:opacity-60 transition-colors"
            >
              {updateQuote.isPending ? 'guardando…' : 'guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
