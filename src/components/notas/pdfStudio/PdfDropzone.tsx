import type { DragEvent } from 'react'
import { FilePdfIcon } from '../../Icons'

const ACCENT = 'var(--accent-sage)'

export function PdfDropzone({
  onClick,
  onDropFiles,
}: {
  onClick: () => void
  onDropFiles: (e: DragEvent) => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropFiles}
      className="group mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-ink-200 bg-paper-50/55 px-6 py-16 text-center shadow-sm shadow-ink-900/5 transition-colors hover:border-ink-300 hover:bg-paper-50/80"
    >
      <span
        className="inline-flex h-12 w-12 items-center justify-center rounded-md transition-transform duration-200 group-hover:scale-105"
        style={{ backgroundColor: 'var(--accent-sage-soft)', color: ACCENT }}
      >
        <FilePdfIcon size={22} />
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-body font-medium text-ink-700">
          Arrastra PDFs o imágenes aquí
        </span>
        <span className="text-caption text-ink-400">o haz clic para elegir archivos</span>
      </span>
      <span className="flex items-center gap-1.5 text-micro uppercase tracking-eyebrow text-ink-400">
        {['PDF', 'JPG', 'PNG'].map((t) => (
          <span key={t} className="rounded bg-ink-100/60 px-1.5 py-0.5">
            {t}
          </span>
        ))}
      </span>
    </button>
  )
}
