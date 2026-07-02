import {
  describePdfStudioAutosaveState,
  type PdfStudioAutosaveDescription,
  type PdfStudioAutosaveState,
} from '../workspace/pdfStudioAutosaveState'

const DOT_BY_TONE: Record<PdfStudioAutosaveDescription['tone'], string> = {
  neutral: 'bg-ink-300',
  working: 'animate-pulse bg-ink-300',
  safe: 'bg-[color:var(--accent-sage)]',
  restored: 'bg-[color:var(--accent-sage)]',
  risk: 'bg-[color:var(--accent-clay)]',
}

/** Indicador discreto del autosave local dentro del editor de planillas: el
 *  chip del estudio queda tapado por el modal, así que el estado se replica acá. */
export function PdfTextEditorAutosaveBadge({
  state,
}: {
  state?: PdfStudioAutosaveState
}) {
  if (!state || state.kind === 'idle') return null
  const description = describePdfStudioAutosaveState(state)
  return (
    <div
      role="status"
      aria-live="polite"
      title={description.detail}
      className="pointer-events-none absolute bottom-3 left-3 z-30 inline-flex items-center gap-1.5 rounded-full border border-ink-100 bg-paper-50/90 px-2.5 py-1 text-micro font-medium text-ink-500 shadow-sm shadow-ink-900/10 backdrop-blur"
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${DOT_BY_TONE[description.tone]}`}
      />
      {description.label}
    </div>
  )
}
