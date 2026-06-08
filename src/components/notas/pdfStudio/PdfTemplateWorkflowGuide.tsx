import { DownloadIcon, FilePdfIcon, PlusIcon, UploadIcon } from '../../Icons'

type Step = {
  label: string
  status: string
  complete: boolean
}

function StepPill({ complete, label, status }: Step) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 py-2 ${
        complete
          ? 'border-[color:var(--accent-sage)]/25 bg-[color:var(--accent-sage-soft)]/35'
          : 'border-ink-100 bg-paper-50'
      }`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          complete ? 'bg-[color:var(--accent-sage)]' : 'bg-ink-200'
        }`}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="truncate text-caption font-medium text-ink-800">{label}</p>
        <p className="truncate text-micro text-ink-400">{status}</p>
      </div>
    </div>
  )
}

export function PdfTemplateWorkflowGuide({
  busy = false,
  fieldCount,
  pageCount,
  saving = false,
  onAddFields,
  onDownloadFillable,
  onImport,
  onSaveTemplate,
}: {
  busy?: boolean
  fieldCount: number
  pageCount: number
  saving?: boolean
  onAddFields: () => void
  onDownloadFillable: () => void
  onImport: () => void
  onSaveTemplate: () => void
}) {
  const hasBase = pageCount > 0
  const hasFields = fieldCount > 0
  const baseStatus = hasBase
    ? `${pageCount} ${pageCount === 1 ? 'página' : 'páginas'}`
    : 'Pendiente'
  const fieldStatus = hasFields
    ? `${fieldCount} ${fieldCount === 1 ? 'casillero' : 'casilleros'}`
    : hasBase
      ? 'Pendiente'
      : 'Sin base'
  const saveStatus = hasFields ? 'Listo' : 'Pendiente'

  return (
    <section
      aria-label="Crear plantilla"
      className="rounded-md border border-ink-100 bg-paper-50/85 p-2 shadow-sm shadow-ink-900/5"
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-1.5 sm:grid-cols-3">
          <StepPill label="Base" status={baseStatus} complete={hasBase} />
          <StepPill label="Casilleros" status={fieldStatus} complete={hasFields} />
          <StepPill label="Guardar" status={saveStatus} complete={hasFields} />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onImport}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-100 bg-paper-50 px-2.5 text-caption font-medium text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-40"
          >
            <UploadIcon size={13} />
            Importar base
          </button>
          <button
            type="button"
            onClick={onAddFields}
            disabled={!hasBase || busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[color:var(--accent-sage)]/25 bg-[color:var(--accent-sage-soft)]/35 px-2.5 text-caption font-medium text-[color:var(--accent-sage)] transition-colors hover:bg-[color:var(--accent-sage-soft)] disabled:border-ink-100 disabled:bg-ink-50 disabled:text-ink-300"
          >
            <PlusIcon size={13} />
            Definir casilleros
          </button>
          <button
            type="button"
            onClick={onSaveTemplate}
            disabled={!hasFields || busy || saving}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-ink-800 px-2.5 text-caption font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-35 disabled:hover:bg-ink-800"
          >
            <FilePdfIcon size={13} />
            Guardar como plantilla
          </button>
          <button
            type="button"
            onClick={onDownloadFillable}
            disabled={!hasFields || busy || saving}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-caption font-medium text-ink-500 transition-colors hover:bg-ink-100/60 hover:text-ink-800 disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-ink-500"
          >
            <DownloadIcon size={13} />
            PDF rellenable
          </button>
        </div>
      </div>
    </section>
  )
}
