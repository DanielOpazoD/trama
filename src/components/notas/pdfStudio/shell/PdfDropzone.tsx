import type { DragEvent } from 'react'
import { EmptyIllustration } from '../../../Icons'

const ACCENT = 'var(--accent-sage)'

/**
 * Estado vacío de Imprenta/Planillas — la primera impresión del módulo. En vez
 * del dropzone utilitario, el gesto editorial de los empty states de Trama
 * (ilustración del motivo tejido + serif italic), sobre el mismo botón con
 * drag-and-drop de siempre.
 */
export function PdfDropzone({
  onClick,
  onDropFiles,
  eyebrow = 'imprenta',
  subtitle = 'Arrastra archivos o haz clic para elegirlos.',
  title = 'Trae un PDF o unas imágenes; aquí se componen.',
}: {
  onClick: () => void
  onDropFiles: (e: DragEvent) => void
  eyebrow?: string
  subtitle?: string
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropFiles}
      className="group mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-ink-200 bg-paper-50/40 px-6 py-14 text-center transition-colors hover:border-ink-300 hover:bg-paper-50/70"
    >
      <span className="text-ink-300 transition-colors duration-200 group-hover:text-ink-400">
        <EmptyIllustration kind="thread" size={110} />
      </span>
      <span className="flex flex-col items-center gap-2">
        <span className="section-eyebrow-serif" style={{ color: ACCENT }}>
          {eyebrow}
        </span>
        <span className="font-serif text-2xl italic leading-tight text-ink-600">
          {title}
        </span>
        <span className="text-sm text-ink-400 leading-relaxed">{subtitle}</span>
      </span>
      <span className="mt-1 flex items-center gap-1.5 text-micro uppercase tracking-eyebrow text-ink-400">
        {['PDF', 'JPG', 'PNG'].map((t) => (
          <span key={t} className="rounded bg-ink-100/60 px-1.5 py-0.5">
            {t}
          </span>
        ))}
      </span>
    </button>
  )
}
