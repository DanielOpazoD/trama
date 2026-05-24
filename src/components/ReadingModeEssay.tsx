import { useEffect } from 'react'
import { CloseIcon, OrnamentBreak } from './Icons'

/**
 * δ4: Modo lectura para essays largos. Modal full-screen serif sin chrome,
 * pensado para LEER, no editar. Tipografía Spectral 17px / leading 1.7,
 * columna max-w-prose centrada (~65ch), drop-cap en el primer párrafo si
 * el ensayo arranca con un párrafo sustancial.
 *
 * No confundir con el "Modo lectura" del input (Reading) que procesa textos
 * largos para extracción. Este es OUTPUT-only — leer lo que ya escribiste.
 *
 * Atajo Escape para cerrar. Open/close lo controla el padre (NodeDetailPanel).
 */
export function ReadingModeEssay({
  title,
  body,
  open,
  onClose,
}: {
  title: string
  body: string
  open: boolean
  onClose: () => void
}) {
  // Escape cierra el modal.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const hasContent = body.trim().length > 0
  // Drop cap solo si arranca con un párrafo "respetable" (>= 60 chars).
  // En párrafos muy cortos el drop cap se ve apretado contra el siguiente.
  const useDropCap = hasContent && body.trim().length >= 60

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Leyendo ensayo de ${title}`}
      className="fixed inset-0 z-50 animate-fade-up overflow-y-auto"
      style={{ backgroundColor: 'rgb(var(--paper-50))' }}
    >
      {/* Botón cerrar — esquina superior derecha, discreto, sin label
          visible. El user llegó acá apretando un botón, sabe que está
          en un modal; el atajo Escape también está documentado. */}
      <button
        onClick={onClose}
        aria-label="Cerrar modo lectura (Escape)"
        title="Cerrar (Escape)"
        className="fixed top-6 right-6 z-10 p-2 text-ink-300 hover:text-ink-700 hover:bg-ink-100 rounded-md transition-colors"
      >
        <CloseIcon size={18} />
      </button>

      <article className="max-w-prose mx-auto px-6 pad-block-8">
        <header className="mb-12 text-center">
          <p className="section-eyebrow-serif mb-3">ensayo</p>
          <h1 className="font-serif text-3xl md:text-4xl text-ink-800 leading-tight tracking-tight">
            {title}
          </h1>
          <div className="flex justify-center mt-6 text-ink-200">
            <OrnamentBreak size={48} />
          </div>
        </header>

        {hasContent ? (
          <div
            className={`font-serif text-ink-700 leading-relaxed whitespace-pre-wrap ${
              useDropCap ? 'drop-cap' : ''
            }`}
            style={{ fontSize: '17px', lineHeight: 1.75 }}
          >
            {body}
          </div>
        ) : (
          <p className="text-ink-300 italic text-center">Sin contenido todavía.</p>
        )}

        <footer className="flex justify-center mt-16 mb-8 text-ink-200">
          <OrnamentBreak size={32} />
        </footer>
      </article>
    </div>
  )
}
