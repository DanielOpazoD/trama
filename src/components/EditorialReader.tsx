import { CloseIcon } from './Icons'
import { useModalOverlay } from '../hooks/useModalOverlay'
import { renderMarkdown } from './notas/markdown'

/**
 * Lectura editorial — superficie compartida para LEER textos largos (borrador
 * editorial, citas extensas, ensayos del chat), distinta del `ReadingMode` de
 * extracción por IA. Columna serif de medida controlada (~65ch), respiración
 * vertical, sin cromos de gestión. Cierra con Esc o el botón; respeta
 * `prefers-reduced-motion`.
 */
export function EditorialReader({
  open,
  onClose,
  title,
  markdown,
}: {
  open: boolean
  onClose: () => void
  title?: string
  markdown: string
}) {
  const overlay = useModalOverlay({ open, onClose })

  if (!open) return null

  return (
    <div
      ref={overlay.dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'Lectura editorial'}
      className="animate-fade-up fixed inset-0 z-50 overflow-y-auto bg-paper-50 motion-reduce:animate-none"
    >
      <button
        onClick={onClose}
        aria-label="Cerrar lectura"
        className="fixed right-5 top-5 z-10 rounded-full bg-paper-50/80 p-2 text-ink-300 backdrop-blur transition-colors hover:text-ink-700"
      >
        <CloseIcon />
      </button>

      <div className="mx-auto max-w-prose px-6 py-16 md:py-24">
        {title && (
          <header className="mb-10 text-center">
            <p className="section-eyebrow-serif" style={{ color: 'var(--accent-gold)' }}>
              lectura
            </p>
            <h1 className="mt-2 font-serif text-4xl leading-tight tracking-tight text-ink-800">
              {title}
            </h1>
            <span className="accent-rule mx-auto mt-5" />
          </header>
        )}
        <article className="font-serif text-lead leading-loose text-ink-700">
          {markdown.trim() ? (
            renderMarkdown(markdown)
          ) : (
            <p className="italic text-ink-400">Nada que leer todavía.</p>
          )}
        </article>
      </div>
    </div>
  )
}
