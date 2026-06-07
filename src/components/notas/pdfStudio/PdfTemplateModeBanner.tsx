import { FilePdfIcon, PencilIcon, PrinterIcon } from '../../Icons'

export type PdfTemplateMode = 'design' | 'fill'

export function PdfTemplateModeBanner({
  mode,
  fieldCount,
  onEditStructure,
  onPrint,
}: {
  mode: PdfTemplateMode
  fieldCount: number
  onEditStructure?: () => void
  onPrint?: () => void
}) {
  const isFill = mode === 'fill'
  const countLabel = `${fieldCount} ${fieldCount === 1 ? 'casillero' : 'casilleros'}`

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[color:var(--accent-sage)]/25 bg-[color:var(--accent-sage-soft)]/35 px-3 py-2 text-caption text-ink-700"
    >
      <div className="flex min-w-0 items-start gap-2">
        <span
          className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded bg-paper-50 text-[color:var(--accent-sage)] ring-1 ring-[color:var(--accent-sage)]/20"
          aria-hidden
        >
          <FilePdfIcon size={14} />
        </span>
        <p className="min-w-0">
          <span className="font-medium text-ink-800">
            {isFill ? 'Rellenar planilla' : 'Editar casilleros'}
          </span>
          <span className="text-ink-500">
            {' '}
            ·{' '}
            {isFill
              ? `completa datos en ${countLabel} e imprime.`
              : `ubica los casilleros que luego se llenarán al imprimir.`}
          </span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {isFill && onPrint ? (
          <button
            type="button"
            onClick={onPrint}
            className="btn-accent inline-flex items-center gap-1 text-xs"
          >
            <PrinterIcon size={13} />
            Imprimir planilla
          </button>
        ) : null}
        {isFill && onEditStructure ? (
          <button
            type="button"
            onClick={onEditStructure}
            className="btn-ghost inline-flex items-center gap-1 text-xs"
          >
            <PencilIcon size={13} />
            Editar estructura
          </button>
        ) : null}
      </div>
    </div>
  )
}
