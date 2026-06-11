import { useEffect } from 'react'
import { CloseIcon, ReadingIcon } from '../Icons'

/**
 * "Abrir como ensayo": una respuesta larga del assistant, servida como
 * página tipografiada a pantalla completa — serif, medida de lectura,
 * párrafos con aire — en vez de leerla apretada dentro de un bubble.
 * El registro es el mismo del Atril: papel, eyebrow, una sola pieza.
 *
 * Texto plano del chat: los párrafos se parten por línea en blanco; los
 * saltos simples se respetan dentro del párrafo (pre-wrap).
 */
export function EssayOverlay({
  content,
  title,
  onClose,
}: {
  content: string
  /** Título del hilo — el ensayo se presenta como pieza con cabecera. */
  title?: string | null
  onClose: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const paragraphs = content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  return (
    <div
      role="dialog"
      aria-label="Ensayo"
      className="fixed inset-0 z-50 overflow-y-auto bg-paper-50 animate-fade-up"
    >
      <button
        onClick={onClose}
        aria-label="Cerrar"
        className="fixed top-5 right-5 p-2 text-ink-300 hover:text-ink-700 transition-colors"
      >
        <CloseIcon />
      </button>

      <article className="mx-auto max-w-2xl px-6 py-16 md:py-24">
        <p className="text-micro uppercase tracking-shout text-ink-300 flex items-center gap-2">
          <ReadingIcon size={12} />
          ensayo
        </p>
        {title && (
          <h2 className="mt-4 font-serif text-h1 leading-snug text-ink-800 text-balance">
            {title}
          </h2>
        )}
        <span
          aria-hidden
          className="mt-6 block w-10 h-px"
          style={{ backgroundColor: 'var(--accent-gold)' }}
        />
        <div className="mt-8 space-y-5">
          {paragraphs.map((p, i) => (
            <p
              key={i}
              className="font-serif text-lead leading-relaxed text-ink-700 whitespace-pre-wrap"
            >
              {p}
            </p>
          ))}
        </div>
      </article>
    </div>
  )
}
